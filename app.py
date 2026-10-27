"""Serves the FastAPI backend API and the Vite-built React SPA."""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse

ROOT_DIR = Path(__file__).parent
BACKEND_DIR = ROOT_DIR / "backend"

# The backend modules use top-level imports (``from core.config import ...``),
# which only resolve when ``backend/`` is on the import path. Add it here so
# the deployed entrypoint behaves the same as running ``backend/main.py`` locally.
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.cache import discovery_cache  # noqa: E402
from routers.access_matrix import router as access_matrix_router  # noqa: E402
from routers.blueprint_discovery import router as blueprint_discovery_router  # noqa: E402

DIST_DIR = ROOT_DIR / "frontend" / "dist"
PORT = int(os.environ.get("DATABRICKS_APP_PORT", 8000))


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await discovery_cache.clear()


app = FastAPI(
    title="Request Manager Application",
    description="Security Manager",
    version="0.1.0",
    lifespan=lifespan,
)

# ── Backend API routes ──
app.include_router(blueprint_discovery_router)
app.include_router(access_matrix_router)


@app.get("/api/health")
async def health():
    return {"status": "healthy", "service": "Security Management"}


# ── SPA static files ──
# Catch-all registered AFTER API routes so /api/* always matches first.
if DIST_DIR.is_dir():

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(DIST_DIR / "index.html"))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
