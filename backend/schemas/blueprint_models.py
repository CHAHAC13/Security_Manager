from typing import Generic, Literal, TypeVar
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")

class PaginationMetadata(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: bool
    has_previous: bool

class PaginatedResponse(BaseModel, Generic[T],):
    items: list[T]
    pagination: PaginationMetadata
    search: str | None = None
    cached: bool = False

class CatalogResponse(BaseModel):
    name: str
    full_name:str
    catalog_type: str
    comment: str | None = None

class SchemaResponse(BaseModel):
    name: str
    catalog_name: str
    full_name: str
    comment: str | None = None

class UnityCatalogObjectResponse(BaseModel):
    name: str
    catalog_name: str
    schema_name: str
    full_name: str
    object_type: str
    display_type: Literal["TABLE", "VIEW",]
    comment: str | None = None

class ErrorResponse(BaseModel):
    code: str
    message: str
    request_id: str | None = None

class CacheClearResponse(BaseModel):
    message: str
    deleted_entries: int

class DiscoveryQuery(BaseModel):
    search: str | None = Field(default = None, max_length = 200)