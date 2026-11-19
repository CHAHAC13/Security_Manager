from typing import Generic, Literal, TypeVar
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    # Raw Unity Catalog principal (group name, user email, or service
    # principal application ID). Use this value for GRANT/REVOKE.
    principal: str
    # Human-readable name for display. Service principal application IDs are
    # resolved to their display name; otherwise equals `principal`.
    principal_display_name: str
    privileges: list[PrivilegeDetail]


# ---------------------------------------------------------------------------
# Permission profiles (predefined Read Only / Read & Write permission sets).
# Kept separate from ObjectPrivilegeResponse, which reports current grants.
# ---------------------------------------------------------------------------

PermissionProfileId = Literal["READ_ONLY", "READ_WRITE"]
REQUIRED_PROFILE_IDS: tuple[str, ...] = ("READ_ONLY", "READ_WRITE")

# OBJECT covers every object returned by the objects endpoint (tables and views
# alike); profiles do not distinguish between them.
ProfileSecurableType = Literal["CATALOG", "SCHEMA", "OBJECT", "VOLUME", "FUNCTION"]
# Response order for securable types.
PROFILE_SECURABLE_TYPES: tuple[str, ...] = (
    "CATALOG", "SCHEMA", "OBJECT", "VOLUME", "FUNCTION",
)


def normalize_privilege_name(name: str) -> str:
    """'read volume' / 'READ_VOLUME' -> 'READ_VOLUME'."""
    return "_".join(name.strip().upper().replace("_", " ").split())


class PermissionProfileDefinition(BaseModel):
    """One profile as stored in core/permission_profiles.json."""
    model_config = ConfigDict(extra="forbid")

    id: PermissionProfileId
    display_name: str = Field(min_length=1)
    description: str | None = None
    privileges_by_securable_type: dict[ProfileSecurableType, list[str]] = Field(
        default_factory=dict
    )

    @field_validator("privileges_by_securable_type")
    @classmethod
    def normalize_privileges(
        cls, value: dict[str, list[str]]
    ) -> dict[str, list[str]]:
        normalized: dict[str, list[str]] = {}
        for securable_type, names in value.items():
            cleaned = [normalize_privilege_name(name) for name in names]
            if any(not name for name in cleaned):
                raise ValueError(f"{securable_type}: privilege names must not be empty.")
            if len(set(cleaned)) != len(cleaned):
                raise ValueError(f"{securable_type}: duplicate privileges.")
            normalized[securable_type] = cleaned
        return normalized


class PermissionProfilesConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")  # allows a top-level "_comment"

    profiles: list[PermissionProfileDefinition]

    @model_validator(mode="after")
    def validate_profile_ids(self) -> "PermissionProfilesConfig":
        ids = [profile.id for profile in self.profiles]
        if sorted(ids) != sorted(REQUIRED_PROFILE_IDS):
            raise ValueError(
                f"Exactly one profile each is required for {list(REQUIRED_PROFILE_IDS)}; got {ids}."
            )
        return self

    def get(self, profile_id: str) -> PermissionProfileDefinition:
        return next(profile for profile in self.profiles if profile.id == profile_id)


class ProfilePrivilegeCheckbox(BaseModel):
    privilege: str  # Databricks API name, e.g. READ_VOLUME
    label: str      # UI label, e.g. READ VOLUME
    # Profile privileges are always shown ticked and locked: the user picks a
    # profile, never individual privileges.
    checked: Literal[True] = True
    disabled: Literal[True] = True


class ProfileSecurablePrivileges(BaseModel):
    securable_type: ProfileSecurableType
    # False when no mapping is defined for this type in permission_profiles.json.
    configured: bool
    privileges: list[ProfilePrivilegeCheckbox]


class PermissionProfileSummary(BaseModel):
    id: PermissionProfileId
    display_name: str
    description: str | None = None
    configured_securable_types: list[ProfileSecurableType]


class PermissionProfileResponse(BaseModel):
    id: PermissionProfileId
    display_name: str
    description: str | None = None
    # Individual privileges cannot be selected; only the whole profile.
    privileges_selectable: Literal[False] = False
    securable_types: list[ProfileSecurablePrivileges]
