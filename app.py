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


# ── TEMPORARY: OpenTelemetry startup diagnostics ──
# Prints the effective OTEL_* settings and the active tracer provider once at
# startup so we can see why spans are not reaching otel_spans. Sensitive values
# (headers, tokens, keys) are masked. Remove once traces are confirmed working.
def _log_otel_diagnostics() -> None:
    sensitive = ("HEADER", "TOKEN", "KEY", "SECRET", "PASSWORD", "AUTH")
    lines = []
    for name in sorted(os.environ):
        if not name.startswith("OTEL_"):
            continue
        value = os.environ[name]
        if any(word in name for word in sensitive):
            value = f"<masked, {len(value)} chars>"
        lines.append(f"{name}={value}")
    if not lines:
        lines.append("(no OTEL_* environment variables set)")

    try:
        from opentelemetry import trace

        provider = trace.get_tracer_provider()
        lines.append(f"tracer_provider={type(provider).__module__}.{type(provider).__name__}")
        sampler = getattr(provider, "sampler", None)
        if sampler is not None:
            lines.append(f"sampler={sampler.get_description()}")
        processor = getattr(provider, "_active_span_processor", None)
        processors = getattr(processor, "_span_processors", ()) if processor else ()
        exporters = [
            type(getattr(p, "span_exporter", getattr(p, "_exporter", p))).__name__
            for p in processors
        ]
        lines.append(f"span_exporters={exporters or 'none'}")
    except Exception as exc:  # diagnostics must never break startup
        lines.append(f"tracer_provider=<error: {exc!r}>")

    for line in lines:
        print(f"[otel-diag] {line}", file=sys.stderr, flush=True)


_log_otel_diagnostics()


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
