from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.cache import discovery_cache
from core.config import get_settings
from routers.blueprint_discovery import router as blueprint_discovery_router
from routers.access_matrix import router as access_matrix_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The cache is process-local. Use a shared cache only if the deployment
    # architecture requires cross-worker cache consistency.
    yield
    await discovery_cache.clear()


settings = get_settings()

app = FastAPI(
    title="Databricks Security Manager",
    version="0.1.0",
    description="Backend APIs for Databricks Unity Catalog discovery.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(blueprint_discovery_router)
app.include_router(access_matrix_router)


@app.get("/api/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "databricks-security-manager",
    }