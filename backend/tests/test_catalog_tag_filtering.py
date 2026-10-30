"""Unit tests for catalog tag filtering.

Covers:
- DatabricksUnityCatalogClient.list_catalog_tags  (client layer)
- The /api/v1/discovery/catalogs endpoint            (router layer)
- Settings.catalog_tag_names property                (config layer)
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.cache import discovery_cache
from core.config import Settings
from schemas.blueprint_models import CatalogResponse
from services.databricks_client import DatabricksApiError, DatabricksUnityCatalogClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_settings(**overrides: Any) -> Settings:
    """Build a Settings instance suitable for testing (no .env needed)."""
    defaults: dict[str, Any] = {
        "DATABRICKS_HOST": "https://test.cloud.databricks.com",
        "DATABRICKS_TOKEN": "dapi_test_token",
        "DATABRICKS_WAREHOUSE_ID": "abc123",
        "CATALOG_TAG_FILTER": "gpdip,gpdip_dev,gpdip_stg,gpdip_prod",
        "DISCOVERY_CACHE_TTL_SECONDS": 0,  # disable caching in tests
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _make_client(settings: Settings | None = None) -> DatabricksUnityCatalogClient:
    return DatabricksUnityCatalogClient(settings or _make_settings())


def _sql_success_payload(rows: list[list[str]]) -> dict[str, Any]:
    """Simulate a SUCCEEDED SQL Statement API response with inline data."""
    return {
        "statement_id": "stmt_1",
        "status": {"state": "SUCCEEDED"},
        "result": {
            "data_array": rows,
        },
    }


# ---------------------------------------------------------------------------
# Settings.catalog_tag_names
# ---------------------------------------------------------------------------

class TestCatalogTagNamesProperty:
    def test_default_tags(self) -> None:
        settings = _make_settings()
        assert settings.catalog_tag_names == [
            "gpdip", "gpdip_dev", "gpdip_prod", "gpdip_stg",
        ]

    def test_empty_filter_returns_empty_list(self) -> None:
        settings = _make_settings(CATALOG_TAG_FILTER="")
        assert settings.catalog_tag_names == []

    def test_whitespace_and_duplicates_are_stripped(self) -> None:
        settings = _make_settings(CATALOG_TAG_FILTER=" a , b , a , ")
        assert settings.catalog_tag_names == ["a", "b"]


# ---------------------------------------------------------------------------
# DatabricksUnityCatalogClient.list_catalog_tags
# ---------------------------------------------------------------------------

class TestListCatalogTags:
    def test_empty_tag_names_returns_empty_dict(self) -> None:
        client = _make_client()
        result = asyncio.run(
            client.list_catalog_tags([])
        )
        assert result == {}

    def test_missing_warehouse_id_raises(self) -> None:
        settings = _make_settings(DATABRICKS_WAREHOUSE_ID=None)
        client = _make_client(settings)
        with pytest.raises(DatabricksApiError, match="DATABRICKS_WAREHOUSE_ID"):
            asyncio.run(
                client.list_catalog_tags(["gpdip_dev"])
            )

    def test_returns_grouped_tags(self) -> None:
        """Verify rows are grouped into {catalog: [tags]} correctly."""
        rows = [
            ["catalog_a", "gpdip_dev"],
            ["catalog_a", "gpdip_stg"],
            ["catalog_b", "gpdip_prod"],
        ]
        client = _make_client()

        async def fake_post(path: str, body: dict) -> dict:
            return _sql_success_payload(rows)

        client._post = fake_post  # type: ignore[assignment]

        result = asyncio.run(
            client.list_catalog_tags(["gpdip_dev", "gpdip_stg", "gpdip_prod"])
        )
        assert result == {
            "catalog_a": ["gpdip_dev", "gpdip_stg"],
            "catalog_b": ["gpdip_prod"],
        }

    def test_duplicate_rows_are_deduplicated(self) -> None:
        rows = [
            ["catalog_x", "gpdip"],
            ["catalog_x", "gpdip"],
        ]
        client = _make_client()
        client._post = AsyncMock(return_value=_sql_success_payload(rows))  # type: ignore[assignment]

        result = asyncio.run(
            client.list_catalog_tags(["gpdip"])
        )
        assert result == {"catalog_x": ["gpdip"]}

    def test_malformed_rows_are_skipped(self) -> None:
        rows = [
            ["catalog_ok", "gpdip"],
            ["only_one_col"],             # too short
            [123, "gpdip"],               # wrong type
            [None, None],                 # nulls
        ]
        client = _make_client()
        client._post = AsyncMock(return_value=_sql_success_payload(rows))  # type: ignore[assignment]

        result = asyncio.run(
            client.list_catalog_tags(["gpdip"])
        )
        assert result == {"catalog_ok": ["gpdip"]}

    def test_failed_statement_raises(self) -> None:
        failed_payload: dict[str, Any] = {
            "statement_id": "stmt_1",
            "status": {
                "state": "FAILED",
                "error": {"message": "Syntax error near line 1"},
            },
        }
        client = _make_client()
        client._post = AsyncMock(return_value=failed_payload)  # type: ignore[assignment]

        with pytest.raises(DatabricksApiError, match="Syntax error"):
            asyncio.run(
                client.list_catalog_tags(["gpdip"])
            )


# ---------------------------------------------------------------------------
# GET /api/v1/discovery/catalogs — integration via TestClient
# ---------------------------------------------------------------------------

def _build_test_app(settings: Settings) -> FastAPI:
    """Create a minimal FastAPI app wired to our discovery router with
    dependency overrides so no real Databricks calls are made."""
    from core.config import get_settings
    from routers.blueprint_discovery import router

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_settings] = lambda: settings
    return app


# Fake catalog list returned by the UC REST API
_RAW_CATALOGS: list[dict[str, Any]] = [
    {"name": "gpdip_odx_dev", "catalog_type": "MANAGED"},
    {"name": "gpdip_cdx_stg", "catalog_type": "MANAGED"},
    {"name": "unrelated_catalog", "catalog_type": "MANAGED"},
    {"name": "gpdip_safety_prod", "catalog_type": "MANAGED"},
]

# Simulated tag lookup result (only two of the four catalogs are tagged)
_TAGS_BY_CATALOG: dict[str, list[str]] = {
    "gpdip_odx_dev": ["gpdip_dev"],
    "gpdip_safety_prod": ["gpdip_prod"],
}


class TestGetCatalogsEndpoint:
    """Test the /catalogs endpoint filters by tag and includes tags in the response."""

    @pytest.fixture()
    def _patch_client(self):
        with patch.object(
            DatabricksUnityCatalogClient,
            "list_catalogs",
            new_callable=AsyncMock,
            return_value=_RAW_CATALOGS,
        ), patch.object(
            DatabricksUnityCatalogClient,
            "list_catalog_tags",
            new_callable=AsyncMock,
            return_value=_TAGS_BY_CATALOG,
        ):
            yield

    @pytest.fixture()
    def client(self, _patch_client) -> TestClient:
        settings = _make_settings()
        app = _build_test_app(settings)
        return TestClient(app)

    def test_only_tagged_catalogs_returned(self, client: TestClient) -> None:
        resp = client.get("/api/v1/discovery/catalogs")
        assert resp.status_code == 200
        body = resp.json()
        names = [item["name"] for item in body["items"]]
        assert sorted(names) == ["gpdip_odx_dev", "gpdip_safety_prod"]
        # unrelated_catalog and gpdip_cdx_stg should be excluded
        assert "unrelated_catalog" not in names
        assert "gpdip_cdx_stg" not in names

    def test_tags_are_in_response(self, client: TestClient) -> None:
        resp = client.get("/api/v1/discovery/catalogs")
        items = resp.json()["items"]
        by_name = {item["name"]: item for item in items}
        assert by_name["gpdip_odx_dev"]["tags"] == ["gpdip_dev"]
        assert by_name["gpdip_safety_prod"]["tags"] == ["gpdip_prod"]

    def test_search_matches_tag_name(self, client: TestClient) -> None:
        resp = client.get("/api/v1/discovery/catalogs", params={"search": "gpdip_prod"})
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "gpdip_safety_prod"

    def test_pagination_metadata(self, client: TestClient) -> None:
        resp = client.get(
            "/api/v1/discovery/catalogs", params={"page": 1, "page_size": 1}
        )
        body = resp.json()
        assert body["pagination"]["total_items"] == 2
        assert body["pagination"]["total_pages"] == 2
        assert len(body["items"]) == 1


class TestGetCatalogsNoTagFilter:
    """When CATALOG_TAG_FILTER is empty, all catalogs are returned unfiltered."""

    @pytest.fixture()
    def _patch_client(self):
        with patch.object(
            DatabricksUnityCatalogClient,
            "list_catalogs",
            new_callable=AsyncMock,
            return_value=_RAW_CATALOGS,
        ):
            yield

    @pytest.fixture()
    def client(self, _patch_client) -> TestClient:
        settings = _make_settings(CATALOG_TAG_FILTER="")
        app = _build_test_app(settings)
        return TestClient(app)

    def test_all_catalogs_returned(self, client: TestClient) -> None:
        resp = client.get("/api/v1/discovery/catalogs")
        assert resp.status_code == 200
        names = [item["name"] for item in resp.json()["items"]]
        assert sorted(names) == [
            "gpdip_cdx_stg",
            "gpdip_odx_dev",
            "gpdip_safety_prod",
            "unrelated_catalog",
        ]

    def test_tags_are_empty_when_no_filter(self, client: TestClient) -> None:
        resp = client.get("/api/v1/discovery/catalogs")
        for item in resp.json()["items"]:
            assert item["tags"] == []


class TestCatalogNameSearch:
    @pytest.fixture()
    def client(self) -> Iterator[TestClient]:
        discovery_cache._cache.clear()
        catalogs = [
            {"name": "unrelated", "comment": "gpdip", "catalog_type": "MANAGED"},
            {"name": "gpdip_first", "catalog_type": "MANAGED"},
            {"name": "GPDiP_second", "catalog_type": "MANAGED"},
            {"name": "gpdip_untagged", "catalog_type": "MANAGED"},
        ]
        tags = {item["name"]: ["gpdip_prod"] for item in catalogs[:3]}
        with patch.object(
            DatabricksUnityCatalogClient, "list_catalogs",
            new_callable=AsyncMock, return_value=catalogs,
        ), patch.object(
            DatabricksUnityCatalogClient, "list_catalog_tags",
            new_callable=AsyncMock, return_value=tags,
        ):
            yield TestClient(_build_test_app(_make_settings()))
        discovery_cache._cache.clear()

    def test_name_only_filters_before_pagination(self, client: TestClient) -> None:
        for page, expected_name in [(1, "gpdip_first"), (2, "GPDiP_second")]:
            response = client.get("/api/v1/discovery/catalogs", params={
                "search": " GPDiP ", "search_by": "name", "page": page, "page_size": 1,
            })
            assert response.status_code == 200
            body = response.json()
            assert [item["name"] for item in body["items"]] == [expected_name]
            assert body["pagination"]["total_items"] == 2
            assert body["pagination"]["total_pages"] == 2
            assert body["pagination"]["has_next"] is (page == 1)

    @pytest.mark.parametrize("search", ["gpdip_prod", "missing"])
    def test_name_only_ignores_tag_and_comment_matches(self, client: TestClient, search: str) -> None:
        response = client.get("/api/v1/discovery/catalogs", params={
            "search": search, "search_by": "name",
        })
        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["pagination"]["total_items"] == 0

    @pytest.mark.parametrize("search_by", [None, "all"])
    def test_existing_search_still_matches_tags(self, client: TestClient, search_by: str | None) -> None:
        params = {"search": "gpdip_prod"}
        if search_by is not None:
            params["search_by"] = search_by
        response = client.get("/api/v1/discovery/catalogs", params=params)
        assert response.status_code == 200
        assert response.json()["pagination"]["total_items"] == 3

    def test_empty_name_search_keeps_all_tag_eligible_catalogs(self, client: TestClient) -> None:
        response = client.get("/api/v1/discovery/catalogs", params={
            "search": " ", "search_by": "name",
        })
        assert response.status_code == 200
        assert response.json()["pagination"]["total_items"] == 3

    def test_invalid_search_mode_is_rejected(self, client: TestClient) -> None:
        response = client.get("/api/v1/discovery/catalogs", params={"search_by": "invalid"})
        assert response.status_code == 422
