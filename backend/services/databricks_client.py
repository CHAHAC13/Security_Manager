from typing import Any, cast

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
        url = f"{self.settings.normalized_databricks_host}{path}"
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.databricks_timeout_seconds,
                follow_redirects=False,
            ) as client:
                response = await client.get(
                    url=url,
                    headers=self._get_auth_headers(),
                    params=params,
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