from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.config import Settings
from routers.blueprint_discovery import get_databricks_client, router
from services.databricks_client import DatabricksApiError, DatabricksUnityCatalogClient


@pytest.fixture
def client_and_databricks():
    app = FastAPI()
    app.include_router(router)
    databricks = AsyncMock()
    app.dependency_overrides[get_databricks_client] = lambda: databricks
    with TestClient(app) as client:
        yield client, databricks


def test_schema_check_uses_fresh_data_not_cached_results(client_and_databricks):
    client, databricks = client_and_databricks
    databricks.list_schemas.return_value = [{"name": "new_schema"}]
    with patch("routers.blueprint_discovery.discovery_cache.get", new_callable=AsyncMock, return_value=[]) as cache:
        response = client.get("/api/v1/discovery/catalogs/cat/schema-name-exists", params={"name": "NEW_SCHEMA"})
    assert response.status_code == 200
    assert response.json() == {"exists": True}
    assert response.headers["cache-control"] == "no-store"
    databricks.list_schemas.assert_awaited_once_with("cat")
    cache.assert_not_awaited()


def test_object_check_uses_fresh_data_and_includes_unknown_object_types(client_and_databricks):
    client, databricks = client_and_databricks
    databricks.list_tables_and_views.return_value = [{"name": "recent", "table_type": "UNKNOWN"}]
    with patch("routers.blueprint_discovery.discovery_cache.get", new_callable=AsyncMock, return_value=[]) as cache:
        response = client.get("/api/v1/discovery/catalogs/cat/schemas/sch/object-name-exists", params={"name": "RECENT"})
    assert response.status_code == 200
    assert response.json() == {"exists": True}
    assert response.headers["cache-control"] == "no-store"
    databricks.list_tables_and_views.assert_awaited_once_with("cat", "sch")
    cache.assert_not_awaited()


@pytest.mark.parametrize("kind", ["schema", "object"])
def test_name_check_propagates_upstream_failures_and_rejects_bad_names(client_and_databricks, kind):
    client, databricks = client_and_databricks
    method = databricks.list_schemas if kind == "schema" else databricks.list_tables_and_views
    url = ("/api/v1/discovery/catalogs/cat/schema-name-exists" if kind == "schema"
           else "/api/v1/discovery/catalogs/cat/schemas/sch/object-name-exists")
    method.side_effect = DatabricksApiError(403, "Access denied")
    assert client.get(url, params={"name": "test"}).status_code == 403
    method.side_effect = None
    method.return_value = [{"name": None}]
    assert client.get(url, params={"name": "test"}).status_code == 502
    method.return_value = []
    assert client.get(url, params={"name": "test"}).json() == {"exists": False}


@pytest.mark.parametrize(
    ("url", "collection"),
    [
        ("/api/v1/discovery/catalogs/cat/schema-name-exists", "schemas"),
        ("/api/v1/discovery/catalogs/cat/schemas/sch/object-name-exists", "tables"),
    ],
)
def test_name_checks_cover_all_upstream_pages(url, collection):
    settings = Settings(DATABRICKS_HOST="https://test.cloud.databricks.com", DATABRICKS_TOKEN="test")
    databricks = DatabricksUnityCatalogClient(settings)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_databricks_client] = lambda: databricks
    with patch.object(databricks, "_get", new_callable=AsyncMock) as get:
        get.side_effect = [
            {collection: [{"name": "other"}], "next_page_token": "next"},
            {collection: [{"name": "MATCH"}]},
        ]
        with TestClient(app) as client:
            response = client.get(url, params={"name": "match"})
    assert response.status_code == 200
    assert response.json() == {"exists": True}
    assert get.await_count == 2
