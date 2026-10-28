"""Unit tests for the privileges endpoint.

Covers:
- DatabricksUnityCatalogClient.get_privilege_assignments  (client layer)
- map_privilege_assignment / to_databricks_securable_type (mapping layer)
- POST /api/v1/discovery/privileges                        (router layer)
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from core.cache import discovery_cache
from core.config import Settings
from routers.blueprint_discovery import (
    map_privilege_assignment,
    to_databricks_securable_type,
)
from services.databricks_client import DatabricksApiError, DatabricksUnityCatalogClient


PRIVILEGES_URL = "/api/v1/discovery/privileges"

CATALOG = "cat_a"
SCHEMA = "cat_a.sch_a"
TABLE = "cat_a.sch_a.tbl_a"
VIEW = "cat_a.sch_a.vw_a"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_settings(**overrides: Any) -> Settings:
    """Build a Settings instance suitable for testing (no .env needed)."""
    defaults: dict[str, Any] = {
        "DATABRICKS_HOST": "https://test.cloud.databricks.com",
        "DATABRICKS_TOKEN": "dapi_test_token",
        "DATABRICKS_WAREHOUSE_ID": "abc123",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _build_test_app(settings: Settings) -> FastAPI:
    """Minimal app wired to the discovery router; no real Databricks calls."""
    from core.config import get_settings
    from routers.blueprint_discovery import router

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_settings] = lambda: settings
    return app


def _body(*securables: tuple[str, str], include_inherited: bool = True) -> dict[str, Any]:
    return {
        "securables": [
            {"securable_type": securable_type, "full_name": full_name}
            for securable_type, full_name in securables
        ],
        "include_inherited": include_inherited,
    }


# Effective-permissions style responses (privileges are objects).
_EFFECTIVE: dict[str, list[dict[str, Any]]] = {
    CATALOG: [
        {"principal": "grp-readers", "privileges": [
            {"privilege": "USE_CATALOG"},
            {"privilege": "SELECT"},
        ]},
        {"principal": "Grp-Admins", "privileges": [{"privilege": "MANAGE"}]},
    ],
    TABLE: [
        {"principal": "grp-readers", "privileges": [
            {"privilege": "SELECT", "inherited_from_type": "CATALOG",
             "inherited_from_name": CATALOG},
        ]},
        {"principal": "grp-writers", "privileges": [{"privilege": "MODIFY"}]},
    ],
    VIEW: [
        {"principal": "grp-readers", "privileges": [
            {"privilege": "SELECT", "inherited_from_type": "CATALOG",
             "inherited_from_name": CATALOG},
        ]},
    ],
    SCHEMA: [],
}

# Direct-grants style responses (privileges are strings).
_DIRECT: dict[str, list[dict[str, Any]]] = {
    CATALOG: [
        {"principal": "grp-readers", "privileges": ["USE_CATALOG", "SELECT"]},
    ],
    TABLE: [],
}


async def _fake_assignments(
    securable_type: str, full_name: str, effective: bool
) -> list[dict[str, Any]]:
    source = _EFFECTIVE if effective else _DIRECT
    return source.get(full_name, [])


@pytest.fixture(autouse=True)
def _clear_cache():
    # The discovery cache is process-global; isolate every test.
    discovery_cache._cache.clear()
    yield
    discovery_cache._cache.clear()


@pytest.fixture()
def mock_assignments():
    with patch.object(
        DatabricksUnityCatalogClient,
        "get_privilege_assignments",
        new_callable=AsyncMock,
        side_effect=_fake_assignments,
    ) as mocked:
        yield mocked


@pytest.fixture()
def client(mock_assignments) -> TestClient:
    return TestClient(_build_test_app(_make_settings()))


# ---------------------------------------------------------------------------
# to_databricks_securable_type / map_privilege_assignment
# ---------------------------------------------------------------------------

class TestToDatabricksSecurableType:
    @pytest.mark.parametrize(
        ("securable_type", "expected"),
        [("CATALOG", "catalog"), ("SCHEMA", "schema"), ("TABLE", "table"),
         ("VIEW", "table"), ("view", "table")],
    )
    def test_mapping(self, securable_type: str, expected: str) -> None:
        assert to_databricks_securable_type(securable_type) == expected

    def test_unsupported_type_raises_422(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            to_databricks_securable_type("VOLUME")
        assert exc_info.value.status_code == 422
        assert exc_info.value.detail["code"] == "UNSUPPORTED_SECURABLE_TYPE"


class TestMapPrivilegeAssignment:
    def _map(self, assignment: dict[str, Any], include_inherited: bool = True):
        return map_privilege_assignment(
            assignment=assignment,
            securable_type="TABLE",
            full_name=TABLE,
            include_inherited=include_inherited,
        )

    def test_string_privileges_are_direct_and_sorted(self) -> None:
        result = self._map({"principal": "grp", "privileges": ["USE_CATALOG", "SELECT"]})
        assert result is not None
        assert result.principal == "grp"
        assert [(p.privilege, p.inherited) for p in result.privileges] == [
            ("SELECT", False), ("USE_CATALOG", False),
        ]

    def test_inheritance_details_are_kept(self) -> None:
        result = self._map({"principal": "grp", "privileges": [
            {"privilege": "SELECT", "inherited_from_type": "CATALOG",
             "inherited_from_name": CATALOG},
        ]})
        assert result is not None
        detail = result.privileges[0]
        assert detail.inherited is True
        assert detail.inherited_from_type == "CATALOG"
        assert detail.inherited_from_name == CATALOG

    def test_inherited_privileges_dropped_when_not_requested(self) -> None:
        result = self._map(
            {"principal": "grp", "privileges": [
                {"privilege": "SELECT", "inherited_from_type": "CATALOG",
                 "inherited_from_name": CATALOG},
                {"privilege": "MODIFY"},
            ]},
            include_inherited=False,
        )
        assert result is not None
        assert [p.privilege for p in result.privileges] == ["MODIFY"]

    def test_only_inherited_and_not_requested_returns_none(self) -> None:
        result = self._map(
            {"principal": "grp", "privileges": [
                {"privilege": "SELECT", "inherited_from_name": CATALOG},
            ]},
            include_inherited=False,
        )
        assert result is None

    @pytest.mark.parametrize("principal", [None, "", "   ", 123])
    def test_missing_principal_returns_none(self, principal: Any) -> None:
        assert self._map({"principal": principal, "privileges": ["SELECT"]}) is None

    def test_malformed_privilege_entries_are_skipped(self) -> None:
        result = self._map({"principal": "grp", "privileges": [
            "SELECT", "  ", 123, None, {"no": "privilege"},
        ]})
        assert result is not None
        assert [p.privilege for p in result.privileges] == ["SELECT"]

    def test_invalid_privileges_field_raises(self) -> None:
        with pytest.raises(DatabricksApiError, match="privileges"):
            self._map({"principal": "grp", "privileges": "SELECT"})


# ---------------------------------------------------------------------------
# DatabricksUnityCatalogClient.get_privilege_assignments
# ---------------------------------------------------------------------------

class TestGetPrivilegeAssignments:
    def _run(self, coro):
        return asyncio.new_event_loop().run_until_complete(coro)

    def test_effective_uses_effective_permissions_api(self) -> None:
        api = DatabricksUnityCatalogClient(_make_settings())
        api._get = AsyncMock(return_value={"privilege_assignments": [{"principal": "g"}]})  # type: ignore[assignment]
        result = self._run(api.get_privilege_assignments("table", TABLE, effective=True))
        api._get.assert_awaited_once_with(
            f"/api/2.1/unity-catalog/effective-permissions/table/{TABLE}",
            params={"max_results": 0},
        )
        assert result == [{"principal": "g"}]

    def test_direct_uses_permissions_api(self) -> None:
        api = DatabricksUnityCatalogClient(_make_settings())
        api._get = AsyncMock(return_value={})  # type: ignore[assignment]
        result = self._run(api.get_privilege_assignments("catalog", CATALOG, effective=False))
        api._get.assert_awaited_once_with(
            f"/api/2.1/unity-catalog/permissions/catalog/{CATALOG}", params=None
        )
        assert result == []

    def test_special_characters_are_url_encoded(self) -> None:
        api = DatabricksUnityCatalogClient(_make_settings())
        api._get = AsyncMock(return_value={})  # type: ignore[assignment]
        self._run(api.get_privilege_assignments("table", "c.s.my table/x", effective=True))
        api._get.assert_awaited_once_with(
            "/api/2.1/unity-catalog/effective-permissions/table/c.s.my%20table%2Fx",
            params={"max_results": 0},
        )

    def test_follows_page_tokens(self) -> None:
        api = DatabricksUnityCatalogClient(_make_settings())
        api._get = AsyncMock(side_effect=[  # type: ignore[assignment]
            {"privilege_assignments": [{"principal": "a"}], "next_page_token": "t1"},
            {"privilege_assignments": [{"principal": "b"}]},
        ])
        result = self._run(api.get_privilege_assignments("table", TABLE, effective=True))
        assert result == [{"principal": "a"}, {"principal": "b"}]
        assert api._get.await_count == 2
        assert api._get.await_args_list[1].kwargs["params"]["page_token"] == "t1"

    def test_repeated_page_token_raises(self) -> None:
        api = DatabricksUnityCatalogClient(_make_settings())
        api._get = AsyncMock(  # type: ignore[assignment]
            return_value={"privilege_assignments": [], "next_page_token": "same"}
        )
        with pytest.raises(DatabricksApiError, match="page token"):
            self._run(api.get_privilege_assignments("table", TABLE, effective=True))

    def test_invalid_payload_raises(self) -> None:
        api = DatabricksUnityCatalogClient(_make_settings())
        api._get = AsyncMock(return_value={"privilege_assignments": "oops"})  # type: ignore[assignment]
        with pytest.raises(DatabricksApiError, match="privilege_assignments"):
            self._run(api.get_privilege_assignments("table", TABLE, effective=True))


# ---------------------------------------------------------------------------
# POST /api/v1/discovery/privileges
# ---------------------------------------------------------------------------

class TestPrivilegesEndpoint:
    def test_returns_one_row_per_securable_and_principal(self, client: TestClient) -> None:
        resp = client.post(PRIVILEGES_URL, json=_body(("TABLE", TABLE), ("CATALOG", CATALOG)))
        assert resp.status_code == 200
        # Sorted by full_name, then principal (case-insensitive).
        assert [(i["securable_type"], i["principal"]) for i in resp.json()] == [
            ("CATALOG", "Grp-Admins"), ("CATALOG", "grp-readers"),
            ("TABLE", "grp-readers"), ("TABLE", "grp-writers"),
        ]

    def test_inherited_privileges_are_flagged(self, client: TestClient) -> None:
        resp = client.post(PRIVILEGES_URL, json=_body(("TABLE", TABLE)))
        readers = next(i for i in resp.json() if i["principal"] == "grp-readers")
        assert readers["privileges"] == [{
            "privilege": "SELECT",
            "inherited": True,
            "inherited_from_type": "CATALOG",
            "inherited_from_name": CATALOG,
        }]

    def test_securable_types_map_to_uc_types(
        self, client: TestClient, mock_assignments: AsyncMock
    ) -> None:
        client.post(PRIVILEGES_URL, json=_body(
            ("CATALOG", CATALOG), ("SCHEMA", SCHEMA), ("TABLE", TABLE), ("VIEW", VIEW),
        ))
        calls = {
            (c.kwargs["securable_type"], c.kwargs["full_name"])
            for c in mock_assignments.await_args_list
        }
        assert calls == {
            ("catalog", CATALOG), ("schema", SCHEMA), ("table", TABLE), ("table", VIEW),
        }
        assert all(c.kwargs["effective"] is True for c in mock_assignments.await_args_list)

    def test_securable_with_no_grants_returns_no_rows(self, client: TestClient) -> None:
        resp = client.post(PRIVILEGES_URL, json=_body(("SCHEMA", SCHEMA)))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_direct_only_mode(self, client: TestClient, mock_assignments: AsyncMock) -> None:
        resp = client.post(
            PRIVILEGES_URL,
            json=_body(("CATALOG", CATALOG), ("TABLE", TABLE), include_inherited=False),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert [(i["full_name"], i["principal"]) for i in items] == [(CATALOG, "grp-readers")]
        assert [p["privilege"] for p in items[0]["privileges"]] == ["SELECT", "USE_CATALOG"]
        assert all(p["inherited"] is False for p in items[0]["privileges"])
        assert all(c.kwargs["effective"] is False for c in mock_assignments.await_args_list)

    def test_duplicate_securables_are_fetched_once(
        self, client: TestClient, mock_assignments: AsyncMock
    ) -> None:
        resp = client.post(PRIVILEGES_URL, json=_body(("TABLE", TABLE), ("TABLE", f" {TABLE} ")))
        assert resp.status_code == 200
        assert mock_assignments.await_count == 1

    @pytest.mark.parametrize(
        "payload",
        [
            {"securables": []},
            {"securables": [{"securable_type": "TABLE", "full_name": "only.two"}]},
            {"securables": [{"securable_type": "SCHEMA", "full_name": "cat_a"}]},
            {"securables": [{"securable_type": "CATALOG", "full_name": "a.b"}]},
            {"securables": [{"securable_type": "TABLE", "full_name": "a..c"}]},
            {"securables": [{"securable_type": "VOLUME", "full_name": "a.b.c"}]},
            {"securables": [{"securable_type": "TABLE"}]},
            {},
        ],
    )
    def test_invalid_requests_return_422(
        self, client: TestClient, mock_assignments: AsyncMock, payload: dict[str, Any]
    ) -> None:
        resp = client.post(PRIVILEGES_URL, json=payload)
        assert resp.status_code == 422
        mock_assignments.assert_not_awaited()

    def test_more_than_100_securables_rejected(
        self, client: TestClient, mock_assignments: AsyncMock
    ) -> None:
        payload = _body(*(("TABLE", f"c.s.t{i}") for i in range(101)))
        resp = client.post(PRIVILEGES_URL, json=payload)
        assert resp.status_code == 422
        mock_assignments.assert_not_awaited()

    @pytest.mark.parametrize(
        ("upstream_status", "expected_status"),
        [(404, 404), (403, 403), (500, 502), (503, 502)],
    )
    def test_databricks_errors_are_mapped(
        self, upstream_status: int, expected_status: int
    ) -> None:
        error = DatabricksApiError(upstream_status, "Table 'c.s.t' does not exist.")
        with patch.object(
            DatabricksUnityCatalogClient,
            "get_privilege_assignments",
            new_callable=AsyncMock,
            side_effect=error,
        ):
            resp = TestClient(_build_test_app(_make_settings())).post(
                PRIVILEGES_URL, json=_body(("TABLE", "c.s.t"))
            )
        assert resp.status_code == expected_status
        assert resp.json() == {
            "detail": {"code": "DATABRICKS_API_ERROR", "message": "Table 'c.s.t' does not exist."}
        }

    def test_view_and_table_rows_keep_their_own_type(self, client: TestClient) -> None:
        resp = client.post(PRIVILEGES_URL, json=_body(("VIEW", VIEW), ("TABLE", TABLE)))
        types = {i["full_name"]: i["securable_type"] for i in resp.json()}
        assert types == {VIEW: "VIEW", TABLE: "TABLE"}
