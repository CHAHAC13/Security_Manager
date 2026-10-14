import asyncio
from typing import Any, Literal, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query

from core.cache import discovery_cache
from core.config import Settings, get_settings
from schemas.blueprint_models import (
    CatalogResponse,
    PaginatedResponse,
    SchemaResponse,
    UnityCatalogObjectResponse,
)
from services.databricks_client import DatabricksApiError, DatabricksUnityCatalogClient
from utils.pagination import filter_by_search, paginate_items


router = APIRouter(
    prefix="/api/v1/discovery",
    tags=["Blueprint Editor - Discovery"],
)


def get_databricks_client(
    settings: Settings = Depends(get_settings),
) -> DatabricksUnityCatalogClient:
    return DatabricksUnityCatalogClient(settings)


def raise_databricks_error(error: DatabricksApiError) -> NoReturn:
    # Never send raw Databricks payloads or credentials to API consumers.
    raise HTTPException(
        status_code=502 if error.status_code >= 500 else error.status_code,
        detail={"code": "DATABRICKS_API_ERROR", "message": error.message},
    )


def required_string(item: dict[str, Any], key: str) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise DatabricksApiError(
            502, f"Databricks response is missing required field '{key}'."
        )
    return value


def optional_string(item: dict[str, Any], key: str) -> str | None:
    value = item.get(key)
    return value if isinstance(value, str) else None


def map_catalog(item: dict[str, Any]) -> CatalogResponse:
    name = required_string(item, "name")
    return CatalogResponse(
        name=name,
        full_name=name,
        catalog_type=optional_string(item, "catalog_type"),
        comment=optional_string(item, "comment"),
    )


def map_schema(item: dict[str, Any], catalog_name: str) -> SchemaResponse:
    name = required_string(item, "name")
    return SchemaResponse(
        name=name,
        catalog_name=catalog_name,
        full_name=f"{catalog_name}.{name}",
        comment=optional_string(item, "comment"),
    )


def map_object(item: dict[str, Any]) -> UnityCatalogObjectResponse | None:
    raw_type = optional_string(item, "table_type")
    if raw_type is None:
        return None

    view_types = {"VIEW", "MATERIALIZED_VIEW", "METRIC_VIEW"}
    table_types = {
        "MANAGED",
        "EXTERNAL",
        "STREAMING_TABLE",
        "MANAGED_SHALLOW_CLONE",
        "EXTERNAL_SHALLOW_CLONE",
    }
    normalized_type = raw_type.upper()

    if normalized_type in view_types:
        display_type: Literal["TABLE", "VIEW"] = "VIEW"
        object_type = normalized_type
    elif normalized_type in table_types:
        display_type = "TABLE"
        object_type = normalized_type
    else:
        # Unknown object types are omitted until explicitly supported.
        return None

    name = required_string(item, "name")
    catalog_name = required_string(item, "catalog_name")
    schema_name = required_string(item, "schema_name")
    full_name = optional_string(item, "full_name") or (
        f"{catalog_name}.{schema_name}.{name}"
    )

    return UnityCatalogObjectResponse(
        name=name,
        catalog_name=catalog_name,
        schema_name=schema_name,
        full_name=full_name,
        object_type=object_type,
        display_type=display_type,
        comment=optional_string(item, "comment"),
    )


@router.get("/catalogs", response_model=PaginatedResponse[CatalogResponse])
async def get_catalogs(
    search: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    client: DatabricksUnityCatalogClient = Depends(get_databricks_client),
) -> PaginatedResponse[CatalogResponse]:
    cache_key = "catalogs"
    cached = await discovery_cache.get(cache_key)
    cache_hit = cached is not None

    if cache_hit:
        catalogs = cached
    else:
        try:
            raw_items = await client.list_catalogs()
            catalogs = [map_catalog(item).model_dump() for item in raw_items]
        except DatabricksApiError as exc:
            raise_databricks_error(exc)
        await discovery_cache.set(cache_key, catalogs)

    items = [CatalogResponse(**item) for item in catalogs]
    filtered = filter_by_search(
        items, search, lambda item: (item.name, item.full_name, item.comment)
    )
    page_items, pagination = paginate_items(filtered, page, page_size)
    return PaginatedResponse[CatalogResponse](
        items=page_items,
        pagination=pagination,
        search=search,
        cached=cache_hit,
    )


@router.get(
    "/catalogs/{catalog_name}/schemas",
    response_model=PaginatedResponse[SchemaResponse],
)
async def get_schemas(
    catalog_name: str,
    search: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    client: DatabricksUnityCatalogClient = Depends(get_databricks_client),
) -> PaginatedResponse[SchemaResponse]:
    cache_key = f"schemas:{catalog_name}"
    cached = await discovery_cache.get(cache_key)
    cache_hit = cached is not None

    if cache_hit:
        schemas = cached
    else:
        try:
            raw_items = await client.list_schemas(catalog_name)
            schemas = [
                map_schema(item, catalog_name).model_dump() for item in raw_items
            ]
        except DatabricksApiError as exc:
            raise_databricks_error(exc)
        await discovery_cache.set(cache_key, schemas)

    items = [SchemaResponse(**item) for item in schemas]
    filtered = filter_by_search(
        items, search, lambda item: (item.name, item.full_name, item.comment)
    )
    page_items, pagination = paginate_items(filtered, page, page_size)
    return PaginatedResponse[SchemaResponse](
        items=page_items,
        pagination=pagination,
        search=search,
        cached=cache_hit,
    )


@router.get(
    "/catalogs/{catalog_name}/objects",
    response_model=PaginatedResponse[UnityCatalogObjectResponse],
)
async def get_objects(
    catalog_name: str,
    schema_names: list[str] = Query(..., min_length=1, max_length=20),
    search: str | None = Query(default=None, max_length=200),
    object_type: Literal["TABLE", "VIEW", "ALL"] = Query(default="ALL"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    client: DatabricksUnityCatalogClient = Depends(get_databricks_client),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[UnityCatalogObjectResponse]:
    normalized_schemas = sorted({name.strip() for name in schema_names if name.strip()})
    if not normalized_schemas:
        raise HTTPException(status_code=422, detail="At least one non-empty schema is required.")
    if len(normalized_schemas) > 20:
        raise HTTPException(status_code=422, detail="A maximum of 20 schemas may be queried at once.")

    # Cache key includes all request dimensions that affect the upstream result.
    cache_key = f"objects:{catalog_name}:{','.join(normalized_schemas)}"
    cached = await discovery_cache.get(cache_key)
    cache_hit = cached is not None

    if cache_hit:
        objects = cached
    else:
        semaphore = asyncio.Semaphore(settings.discovery_max_schema_requests)

        async def fetch_schema(schema_name: str) -> list[dict[str, Any]]:
            async with semaphore:
                return await client.list_tables_and_views(catalog_name, schema_name)

        try:
            results = await asyncio.gather(
                *(fetch_schema(name) for name in normalized_schemas)
            )
            mapped: list[dict[str, Any]] = []
            for raw_items in results:
                for raw_item in raw_items:
                    mapped_item = map_object(raw_item)
                    if mapped_item is not None:
                        mapped.append(mapped_item.model_dump())
            objects = mapped
        except DatabricksApiError as exc:
            raise_databricks_error(exc)
        await discovery_cache.set(cache_key, objects)

    items = [UnityCatalogObjectResponse(**item) for item in objects]
    if object_type != "ALL":
        items = [item for item in items if item.display_type == object_type]
    filtered = filter_by_search(
        items,
        search,
        lambda item: (
            item.name,
            item.full_name,
            item.catalog_name,
            item.schema_name,
            item.object_type,
            item.comment,
        ),
    )
    page_items, pagination = paginate_items(filtered, page, page_size)
    return PaginatedResponse[UnityCatalogObjectResponse](
        items=page_items,
        pagination=pagination,
        search=search,
        cached=cache_hit,
    )