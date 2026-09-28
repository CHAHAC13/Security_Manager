"""Serves the FastAPI backend API and the Vite-built React SPA."""

import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse

from backend.routers import access_matrix

DIST_DIR = Path(__file__).parent / "frontend" / "dist"
PORT = int(os.environ.get("DATABRICKS_APP_PORT", 8000))

app = FastAPI(
    title="Request Manager Application",
    description="Security Manager",
    version="0.1.0",
)

# ── Backend API routes ──
app.include_router(access_matrix.router)


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
