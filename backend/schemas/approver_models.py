from typing import Literal

from pydantic import BaseModel

from schemas.blueprint_models import PaginationMetadata

ApproverType = Literal["TECHNICAL", "BUSINESS"]


class ApproverResponse(BaseModel):
    # Stable directory identifier (AD objectId / Entra ID once integrated).
    id: str
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    email: str
    job_title: str | None = None
    department: str | None = None
    approver_type: ApproverType


class TechnicalApproversResponse(BaseModel):
    count: int
    items: list[ApproverResponse]
    # "mock" until the technical approvers group is created.
    source: str


class BusinessApproversResponse(BaseModel):
    items: list[ApproverResponse]
    pagination: PaginationMetadata
    search: str | None = None
    # "mock" until Pfizer Active Directory access is available.
    source: str
