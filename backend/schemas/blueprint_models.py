from typing import Generic, Literal, TypeVar
from pydantic import BaseModel, ConfigDict, Field, model_validator

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
    catalog_type: str | None = None
    comment: str | None = None
    tags: list[str] = Field(default_factory=list)

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

SecurableType = Literal["CATALOG", "SCHEMA", "TABLE", "VIEW"]

# Number of dot-separated name parts expected for each securable type.
SECURABLE_NAME_PARTS: dict[str, int] = {"CATALOG": 1, "SCHEMA": 2, "TABLE": 3, "VIEW": 3}

class SecurableSelection(BaseModel):
    securable_type: SecurableType
    full_name: str = Field(min_length=1, max_length=765)

    @model_validator(mode="after")
    def validate_full_name(self) -> "SecurableSelection":
        self.full_name = self.full_name.strip()
        parts = self.full_name.split(".")
        expected = SECURABLE_NAME_PARTS[self.securable_type]
        if len(parts) != expected or any(not part.strip() for part in parts):
            raise ValueError(
                f"{self.securable_type} full_name must have {expected} dot-separated part(s)."
            )
        return self

class PrivilegesRequest(BaseModel):
    securables: list[SecurableSelection] = Field(min_length=1, max_length=100)
    # True: effective privileges, including those inherited from parent catalog/schema.
    # False: only privileges granted directly on each securable.
    include_inherited: bool = True

class PrivilegeDetail(BaseModel):
    privilege: str
    inherited: bool = False
    inherited_from_type: str | None = None
    inherited_from_name: str | None = None

class ObjectPrivilegeResponse(BaseModel):
    securable_type: SecurableType
    full_name: str
    principal: str
    privileges: list[PrivilegeDetail]

class PrincipalResponse(BaseModel):
    group_name: str
    # Number of selected securables this principal holds privileges on.
    securable_count: int
    # Distinct privileges held across the selected securables.
    privileges: list[str]

class ErrorResponse(BaseModel):
    code: str
    message: str
    request_id: str | None = None

class CacheClearResponse(BaseModel):
    message: str
    deleted_entries: int

class DiscoveryQuery(BaseModel):
    search: str | None = Field(default = None, max_length = 200)