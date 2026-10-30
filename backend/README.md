**Databricks Security Manager — Discovery API starter
This project includes the initial read-only Unity Catalog discovery APIs and the Access Matrix starter endpoint previously shown to the client. The Access Matrix currently returns sample/demo records for continuity and frontend integration; it is not connected to persistent storage or live Databricks security state. This is not the complete Security Manager backend.
Endpoints**
·	`GET /api/health`
·	`GET /api/access-matrix` (sample/demo records; supports filters such as `blueprint`, `version`, `environment`, `role`, `object`, `privilege`, `status`, and `request_manager`)
·	`GET /api/v1/discovery/catalogs`
·	`GET /api/v1/discovery/catalogs/{catalog_name}/schemas`
·	`GET /api/v1/discovery/catalogs/{catalog_name}/schemas/{schema_name}/objects` (`schema_name` accepts a comma-separated list of up to 20 schemas, e.g. `/catalogs/main/schemas/sales,finance/objects`; optional `object_type`, `search`, `page`, `page_size` query parameters)
·	`POST /api/v1/discovery/privileges` (returns a list with one entry per selected securable and `principal`, with its privileges; body `{"securables": [{"securable_type": "CATALOG|SCHEMA|TABLE|VIEW", "full_name": "..."}], "include_inherited": true}`, up to 100 securables)
Search, pagination, and object-type filtering are supported by the discovery endpoints.
`GET /api/v1/discovery/catalogs` returns only catalogs that carry at least one of the Unity Catalog tag names in `CATALOG_TAG_FILTER` (default: `gpdip`, `gpdip_dev`, `gpdip_stg`, `gpdip_prod`). Each catalog in the response includes a `tags` list, and `search` also matches tag names. Tags are read in one query from `system.information_schema.catalog_tags` via the SQL Statement Execution API, so a SQL warehouse is required.
Catalog search accepts `search_by=all|name` (default `all`). `all` retains name, full-name, comment, and tag matching; `name` restricts the case-insensitive substring search to catalog names. The Objects catalog picker sends `search_by=name` so shared `gpdip` tags do not cause unrelated catalog names to match. Search runs before pagination, and totals reflect the filtered results. Tag eligibility filtering still applies in either search mode.
Environment variables
| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABRICKS_HOST` | Yes | - | Workspace URL, e.g. `https://<workspace>.cloud.databricks.com`. Must be HTTPS outside localhost. |
| `DATABRICKS_TOKEN` | No | - | Personal access token. If unset, Databricks SDK default credential resolution is used. |
| `DATABRICKS_WAREHOUSE_ID` | Yes, when `CATALOG_TAG_FILTER` is set | - | SQL warehouse ID used to read catalog tags. The backend identity needs `CAN USE` on the warehouse. |
| `CATALOG_TAG_FILTER` | No | `gpdip,gpdip_dev,gpdip_stg,gpdip_prod` | Comma-separated UC tag names. Only catalogs with at least one of these tags are returned. Set to an empty value to return all catalogs. |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,http://localhost:5173` | Comma-separated CORS origins. |
| `DISCOVERY_CACHE_TTL_SECONDS` | No | `300` | Discovery cache TTL (0-3600). `0` disables caching. |
| `DISCOVERY_CACHE_MAX_ENTRIES` | No | `500` | Maximum cached entries (1-10000). |
| `DATABRICKS_PAGE_SIZE` | No | `500` | Page size for Unity Catalog list APIs (1-1000). |
| `DATABRICKS_TIMEOUT_SECONDS` | No | `30.0` | HTTP timeout for Databricks API calls (max 120). |
| `DISCOVERY_MAX_SCHEMA_REQUESTS` | No | `5` | Max concurrent schema requests in the objects endpoint (1-25). |
Local setup
1.	Use the Python version approved by the project.
2.	Create a virtual environment.
3.	Install dependencies: `pip install -r requirements.txt`
4.	Copy `.env.example` to `.env` and configure the development workspace.
5.	Run syntax check: `python -m compileall .`
6.	Run tests: `pytest`
7.	Start: `uvicorn main:app --reload --port 8000`
	Note: run all commands from the `backend/` folder. Modules such as `routers/blueprint_discovery.py` use package imports (`core`, `schemas`, `services`, `utils`) and cannot be run directly as standalone files; doing so raises `ModuleNotFoundError: No module named 'core'`.
	On Databricks workspace files, run tests with `PYTHONDONTWRITEBYTECODE=1 python -B -m pytest -p no:cacheprovider` because the workspace filesystem does not allow `__pycache__` directories.
8.	Swagger: `http://localhost:8000/docs`
Security / production gates
·	Do not commit `.env` or access tokens.
·	Configure enterprise authentication and application authorization before deployment. The Access Matrix sample endpoint must be protected by the application authorization model and backed by approved persistent data before production use.
·	Configure approved Databricks workload identity and least-privilege grants.
·	Restrict CORS to approved frontend origins.
·	Add structured logging, metrics, request IDs, and secret redaction.
·	Add authorization-aware cache partitioning if results can differ by caller.
·	The in-memory cache is process-local and not shared across workers.
·	Add integration tests against a non-production Databricks workspace.
·	Confirm API contracts, deployment platform, SSO, database, background jobs, audit, retention, and DR with the relevant owners.
