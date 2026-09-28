from fastapi import APIRouter, Query

router = APIRouter(
    prefix = "/api/access-matrix",
    tags = ["Access Matrix"]
)

ACCESS_MATRIX = [
    {
        "id":1,
        "blueprint": "ODX Clinical Operations",
        "version": "v1.0",
        "environment": "dev",
        "level": "Object",
        "role_name" : "dbx-dev-gpd-user-odx-clinops",
        "object_name" : "gpdip_odx_us_east_1.GPDIP_OUTBOUND.adx_contact",
        "privilege": "SELECT",
        "request_manager": True,
        "form_type" : "Regular User",
        "display_name": "clinical Operations Data User",
        "technical_approver": "Raji A",
        "Business_approver": "Raji B",
        "status": "Active"
    }
]

@router.get("")
async def get_acess_matrix(
    environment:str | None = Query(default=None),
    blueprint:str | None = Query(default=None),
    role_name:str | None = Query(default=None),
):
    results = ACCESS_MATRIX
    # Filter by environment
    if environment:
        results = [row for row in results if row["environment"].lower() == environment.lower()]
    # Filter by blueprint
    if blueprint:
        results = [row for row in results if row["blueprint"].lower() == blueprint.lower()]
    # Filter by role_name
    if role_name:
        results = [row for row in results if row["role_name"].lower() == role_name.lower()]
    return {
        "count": len(results),
        "items": results
    }