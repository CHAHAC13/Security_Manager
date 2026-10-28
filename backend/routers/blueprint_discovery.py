import asyncio
from typing import Any, Literal, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query

from core.cache import discovery_cache
from core.config import Settings, get_settings
from schemas.blueprint_models import (
    CatalogResponse,
    ObjectPrivilegeResponse,
    PaginatedResponse,
    PrincipalResponse,
    PrivilegeDetail,
    PrivilegesRequest,
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


def map_catalog(
    item: dict[str, Any], tags: list[str] | None = None
) -> CatalogResponse:
    name = required_string(item, "name")
    return CatalogResponse(
        name=name,
        full_name=name,
        catalog_type=optional_string(item, "catalog_type"),
        comment=optional_string(item, "comment"),
        tags=sorted(tags or []),
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
        "FOREIGN",
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


def to_databricks_securable_type(securable_type: str) -> str:
    """
    Convert the frontend/API securable type into the value expected by
    the Databricks Unity Catalog permissions API.
    Unity Catalog handles views through the table securable type.
    """
    mapping = {
        "CATALOG": "catalog",
        "SCHEMA": "schema",
        "TABLE": "table",
        "VIEW": "table",
    }
    databricks_type = mapping.get(securable_type.upper())
    if databricks_type is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "UNSUPPORTED_SECURABLE_TYPE",
                "message": f"Unsupported securable type: {securable_type}",
            },
        )
    return databricks_type


def map_privilege_assignment(
    assignment: dict[str, Any],
    securable_type: str,
    full_name: str,
    include_inherited: bool,
) -> ObjectPrivilegeResponse | None:
    """
    Convert one Databricks privilege assignment into the response
    returned to the Access Matrix frontend.
    """
    principal = assignment.get("principal")
    if not isinstance(principal, str) or not principal.strip():
        return None
    raw_privileges = assignment.get("privileges", [])
    if not isinstance(raw_privileges, list):
        raise DatabricksApiError(
            502,
            "Databricks returned an invalid privileges field.",
        )
    privileges: list[PrivilegeDetail] = []
    for item in raw_privileges:
        # Direct permissions API can return privileges as strings.
        if isinstance(item, str):
            privilege_name = item.strip()
            if privilege_name:
                privileges.append(
                    PrivilegeDetail(
                        privilege=privilege_name,
                        inherited=False,
                    )
                )
            continue
        # Effective permissions API returns privilege objects.
        if not isinstance(item, dict):
            continue
        privilege_name = item.get("privilege")
        if not isinstance(privilege_name, str) or not privilege_name.strip():
            continue
        inherited_from_type = item.get("inherited_from_type")
        inherited_from_name = (
            item.get("inherited_from_name")
            or item.get("inherited_from")
        )
        inherited = bool(
            inherited_from_type
            or inherited_from_name
        )
        # Defensive filtering in case the upstream effective-permissions
        # response contains inherited values while they were not requested.
        if inherited and not include_inherited:
            continue
        privileges.append(
            PrivilegeDetail(
                privilege=privilege_name.strip(),
                inherited=inherited,
                inherited_from_type=(
                    inherited_from_type
                    if isinstance(inherited_from_type, str)
                    else None
                ),
                inherited_from_name=(
                    inherited_from_name
                    if isinstance(inherited_from_name, str)
                    else None
                ),
            )
        )
    if not privileges:
        return None
    privileges.sort(
        key=lambda item: (
            item.privilege,
            item.inherited,
            item.inherited_from_name or "",
        )
    )
    return ObjectPrivilegeResponse(
        securable_type=securable_type,
        full_name=full_name,
        # Your existing schema calls this group_name. Databricks may return
        # a group, user, or service principal here.
        principal=principal.strip(),
        privileges=privileges,
    )

@router.get("/catalogs", response_model=PaginatedResponse[CatalogResponse])
async def get_catalogs(
    search: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    client: DatabricksUnityCatalogClient = Depends(get_databricks_client),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[CatalogResponse]:
    tag_names = settings.catalog_tag_names
    # Include the tag filter in the cache key so a config change never serves stale results.
    cache_key = f"catalogs:tags={','.join(tag_names)}"
    cached = await discovery_cache.get(cache_key)
    cache_hit = cached is not None

    if cache_hit:
        catalogs = cached
    else:
        try:
            if tag_names:
                raw_items, tags_by_catalog = await asyncio.gather(
                    client.list_catalogs(),
                    client.list_catalog_tags(tag_names),
                )
                # Keep only catalogs that carry at least one of the configured tags.
                catalogs = [
                    map_catalog(item, tags_by_catalog[item["name"]]).model_dump()
                    for item in raw_items
                    if isinstance(item.get("name"), str)
                    and item["name"] in tags_by_catalog
                ]
            else:
                raw_items = await client.list_catalogs()
                catalogs = [map_catalog(item).model_dump() for item in raw_items]
        except DatabricksApiError as exc:
            raise_databricks_error(exc)
        await discovery_cache.set(cache_key, catalogs)

    items = [CatalogResponse(**item) for item in catalogs]
    filtered = filter_by_search(
        items,
        search,
        lambda item: (item.name, item.full_name, item.comment, *item.tags),
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
    "/catalogs/{catalog_name}/schemas/{schema_name}/objects",
    response_model=PaginatedResponse[UnityCatalogObjectResponse],
)
async def get_objects(
    catalog_name: str,
    schema_name: str,
    search: str | None = Query(default=None, max_length=200),
    object_type: Literal["TABLE", "VIEW", "ALL"] = Query(default="ALL"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    client: DatabricksUnityCatalogClient = Depends(get_databricks_client),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[UnityCatalogObjectResponse]:
    # schema_name supports multiple selection as a comma-separated list,
    # e.g. /catalogs/main/schemas/sales,finance/objects
    normalized_schemas = sorted(
        {name.strip() for name in schema_name.split(",") if name.strip()}
    )
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

        async def fetch_schema(name: str) -> list[dict[str, Any]]:
            async with semaphore:
                return await client.list_tables_and_views(catalog_name, name)

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

@router.post(
    "/privileges",
    response_model=list[ObjectPrivilegeResponse],
)
async def get_privileges(
    request: PrivilegesRequest,
    client: DatabricksUnityCatalogClient = Depends(
        get_databricks_client
    ),
    settings: Settings = Depends(get_settings),
) -> list[ObjectPrivilegeResponse]:
    """
    Return principals and privileges for the securables selected in
    the Blueprint Editor.
    include_inherited=True:
        Returns direct and inherited privileges.
    include_inherited=False:
        Returns only privileges assigned directly on each securable.
    """
    # Prevent duplicate Databricks calls if the frontend accidentally sends
    # the same securable more than once.
    unique_selections = list(
        {
            (
                selection.securable_type,
                selection.full_name,
            ): selection
            for selection in request.securables
        }.values()
    )
    semaphore = asyncio.Semaphore(
        settings.discovery_max_schema_requests
    )
    async def fetch_privileges(
        selection: Any,
    ) -> list[ObjectPrivilegeResponse]:
        async with semaphore:
            databricks_type = to_databricks_securable_type(
                selection.securable_type
            )
            assignments = await client.get_privilege_assignments(
                securable_type=databricks_type,
                full_name=selection.full_name,
                effective=request.include_inherited,
            )
            mapped_assignments: list[ObjectPrivilegeResponse] = []
            for assignment in assignments:
                mapped = map_privilege_assignment(
                    assignment=assignment,
                    securable_type=selection.securable_type,
                    full_name=selection.full_name,
                    include_inherited=request.include_inherited,
                )
                if mapped is not None:
                    mapped_assignments.append(mapped)
            return mapped_assignments
    try:
        results = await asyncio.gather(
            *(
                fetch_privileges(selection)
                for selection in unique_selections
            )
        )
    except DatabricksApiError as exc:
        raise_databricks_error(exc)
    flattened = [
        assignment
        for result in results
        for assignment in result
    ]
    flattened.sort(
        key=lambda item: (
            item.full_name,
            item.principal.lower(),
        )
    )
    return flattened