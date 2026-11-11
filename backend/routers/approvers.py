from fastapi import APIRouter, Depends, Query

from schemas.approver_models import BusinessApproversResponse, TechnicalApproversResponse
from services.directory_service import DirectoryProvider, get_directory_provider
from utils.pagination import paginate_items


router = APIRouter(
    prefix="/api/v1/approvers",
    tags=["Blueprint Editor - Approvers"],
)


@router.get("/technical", response_model=TechnicalApproversResponse)
async def get_technical_approvers(
    directory: DirectoryProvider = Depends(get_directory_provider),
) -> TechnicalApproversResponse:
    """Default technical approvers (mock data until the approvers group exists)."""
    approvers = await directory.list_technical_approvers()
    return TechnicalApproversResponse(
        count=len(approvers),
        items=approvers,
        source=directory.source,
    )


@router.get("/business", response_model=BusinessApproversResponse)
async def get_business_approvers(
    search: str | None = Query(
        default=None,
        max_length=200,
        description="Case-insensitive match on name, email, job title or department.",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    directory: DirectoryProvider = Depends(get_directory_provider),
) -> BusinessApproversResponse:
    """Search the user directory for business approvers (mock AD data for now)."""
    normalized_search = search.strip() if search and search.strip() else None
    matches = await directory.search_business_users(normalized_search)
    items, pagination = paginate_items(matches, page, page_size)
    return BusinessApproversResponse(
        items=items,
        pagination=pagination,
        search=normalized_search,
        source=directory.source,
    )
