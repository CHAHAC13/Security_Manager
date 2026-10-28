import asyncio
from typing import Any, cast
from urllib.parse import quote

import httpx
from databricks.sdk.core import Config

from core.config import Settings

class DatabricksApiError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details

class DatabricksUnityCatalogClient:
    """Thin REST client for Unity Catalog discovery endpoints."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _get_auth_headers(self) -> dict[str, str]:
        if self.settings.databricks_token:
            return {
                "Authorization": f"Bearer {self.settings.databricks_token}",
                "Accept": "application/json",
            }

        # Uses Databricks SDK default credential resolution.
        # Confirm the enterprise-approved identity mechanism before production.
        config = Config(host=self.settings.normalized_databricks_host)
        headers = dict(config.authenticate())
        headers["Accept"] = "application/json"
        return cast(dict[str, str], headers)

    async def _get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self._request("GET", path, params=params)

    async def _post(
        self,
        path: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._request("POST", path, json_body=body)

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.settings.normalized_databricks_host}{path}"
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.databricks_timeout_seconds,
                follow_redirects=False,
            ) as client:
                response = await client.request(
                    method,
                    url=url,
                    headers=self._get_auth_headers(),
                    params=params,
                    json=json_body,
                )
        except httpx.TimeoutException as exc:
            raise DatabricksApiError(504, "Databricks API request timed out.") from exc
        except httpx.RequestError as exc:
            # Do not expose exception strings or upstream payloads to clients.
            raise DatabricksApiError(502, "Could not connect to the Databricks API.") from exc

        if response.is_error:
            try:
                payload: Any = response.json()
            except ValueError:
                payload = None

            message = "Databricks API returned an error."
            if isinstance(payload, dict):
                candidate = payload.get("message")
                if isinstance(candidate, str) and candidate.strip():
                    message = candidate.strip()[:300]

            # Keep only a safe, short message. Detailed upstream payloads belong
            # in protected server-side logs, not in the API response.
            raise DatabricksApiError(
                status_code=502 if response.status_code >= 500 else response.status_code,
                message=message,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise DatabricksApiError(
                502, "Databricks returned a non-JSON response."
            ) from exc

        if not isinstance(payload, dict):
            raise DatabricksApiError(
                502, "Databricks returned an unexpected response structure."
            )
        return cast(dict[str, Any], payload)

    async def _get_all_pages(
        self,
        path: str,
        collection_key: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        request_params: dict[str, Any] = dict(params or {})
        request_params.setdefault("max_results", self.settings.databricks_page_size)
        collected: list[dict[str, Any]] = []
        seen_tokens: set[str] = set()

        while True:
            payload = await self._get(path, request_params)
            page_items = payload.get(collection_key, [])
            if not isinstance(page_items, list):
                raise DatabricksApiError(
                    502, f"Databricks returned an invalid '{collection_key}' field."
                )
            collected.extend(item for item in page_items if isinstance(item, dict))

            token = payload.get("next_page_token")
            if token in (None, ""):
                break
            if not isinstance(token, str) or token in seen_tokens:
                raise DatabricksApiError(502, "Databricks returned an invalid page token.")
            seen_tokens.add(token)
            request_params["page_token"] = token

        return collected

    async def list_catalogs(self) -> list[dict[str, Any]]:
        return await self._get_all_pages(
            "/api/2.1/unity-catalog/catalogs", "catalogs"
        )

    async def list_catalog_tags(
        self, tag_names: list[str]
    ) -> dict[str, list[str]]:
        """Return {catalog_name: [matching tag names]} for catalogs that carry
        at least one of the given Unity Catalog tags.

        Uses the SQL Statement Execution API against
        system.information_schema.catalog_tags (one query instead of one
        REST call per catalog). Requires DATABRICKS_WAREHOUSE_ID.
        """
        if not tag_names:
            return {}
        warehouse_id = self.settings.databricks_warehouse_id
        if not warehouse_id:
            raise DatabricksApiError(
                500, "DATABRICKS_WAREHOUSE_ID must be configured to filter catalogs by tag."
            )

        body: dict[str, Any] = {
            "warehouse_id": warehouse_id,
            "statement": (
                "SELECT catalog_name, tag_name "
                "FROM system.information_schema.catalog_tags "
                "WHERE array_contains(split(:tag_names, ','), tag_name)"
            ),
            # Tag names are passed as a bound parameter, never string-concatenated.
            "parameters": [
                {"name": "tag_names", "value": ",".join(tag_names), "type": "STRING"}
            ],
            "wait_timeout": "30s",
            "on_wait_timeout": "CONTINUE",
            "disposition": "INLINE",
            "format": "JSON_ARRAY",
        }
        payload = await self._post("/api/2.0/sql/statements", body)
        payload = await self._wait_for_statement(payload)

        rows: list[list[Any]] = []
        result = payload.get("result") or {}
        while True:
            data = result.get("data_array") or []
            if isinstance(data, list):
                rows.extend(row for row in data if isinstance(row, list))
            next_link = result.get("next_chunk_internal_link")
            if not isinstance(next_link, str) or not next_link:
                break
            result = await self._get(next_link)

        tags_by_catalog: dict[str, list[str]] = {}
        for row in rows:
            if len(row) < 2 or not isinstance(row[0], str) or not isinstance(row[1], str):
                continue
            tags_by_catalog.setdefault(row[0], [])
            if row[1] not in tags_by_catalog[row[0]]:
                tags_by_catalog[row[0]].append(row[1])
        return tags_by_catalog

    async def _wait_for_statement(
        self, payload: dict[str, Any], max_polls: int = 30
    ) -> dict[str, Any]:
        statement_id = payload.get("statement_id")
        for _ in range(max_polls):
            status = payload.get("status") or {}
            state = status.get("state")
            if state == "SUCCEEDED":
                return payload
            if state in {"FAILED", "CANCELED", "CLOSED"}:
                error = status.get("error") or {}
                message = error.get("message") if isinstance(error, dict) else None
                raise DatabricksApiError(
                    502,
                    (message or f"Catalog tag query ended in state {state}.")[:300],
                )
            if not isinstance(statement_id, str) or not statement_id:
                raise DatabricksApiError(502, "Databricks returned no statement id.")
            await asyncio.sleep(1)
            payload = await self._get(f"/api/2.0/sql/statements/{statement_id}")
        raise DatabricksApiError(504, "Catalog tag query timed out.")

    async def list_schemas(self, catalog_name: str) -> list[dict[str, Any]]:
        return await self._get_all_pages(
            "/api/2.1/unity-catalog/schemas",
            "schemas",
            {"catalog_name": catalog_name},
        )

    async def list_tables_and_views(
        self, catalog_name: str, schema_name: str
    ) -> list[dict[str, Any]]:
        return await self._get_all_pages(
            "/api/2.1/unity-catalog/tables",
            "tables",
            {"catalog_name": catalog_name, "schema_name": schema_name},
        )

    async def get_privilege_assignments(
        self,
        securable_type: str,
        full_name: str,
        effective: bool,
    ) -> list[dict[str, Any]]:
        """
        Return Unity Catalog privilege assignments for one securable.
        Effective permissions include privileges inherited from parent
        catalog and schema securables.
        Unity Catalog uses the 'table' securable type for both tables
        and views.
        """
        encoded_full_name = quote(full_name, safe=".")
        if effective:
            path = (
                "/api/2.1/unity-catalog/effective-permissions/"
                f"{securable_type}/{encoded_full_name}"
            )
            # max_results=0 enables server-configured pagination.
            request_params: dict[str, Any] = {
                "max_results": 0,
            }
        else:
            path = (
                "/api/2.1/unity-catalog/permissions/"
                f"{securable_type}/{encoded_full_name}"
            )
            request_params = {}
        collected: list[dict[str, Any]] = []
        seen_tokens: set[str] = set()
        while True:
            payload = await self._get(
                path,
                params=request_params or None,
            )
            assignments = payload.get(
                "privilege_assignments",
                [],
            )
            if not isinstance(assignments, list):
                raise DatabricksApiError(
                    502,
                    "Databricks returned an invalid "
                    "'privilege_assignments' field.",
                )
            collected.extend(
                assignment
                for assignment in assignments
                if isinstance(assignment, dict)
            )
            next_page_token = payload.get("next_page_token")
            if next_page_token in (None, ""):
                break
            if (
                not isinstance(next_page_token, str)
                or next_page_token in seen_tokens
            ):
                raise DatabricksApiError(
                    502,
                    "Databricks returned an invalid permissions page token.",
                )
            seen_tokens.add(next_page_token)
            request_params["page_token"] = next_page_token
        return collected