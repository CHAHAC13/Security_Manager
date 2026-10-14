**Databricks Security Manager — Discovery API starter
This project includes the initial read-only Unity Catalog discovery APIs and the Access Matrix starter endpoint previously shown to the client. The Access Matrix currently returns sample/demo records for continuity and frontend integration; it is not connected to persistent storage or live Databricks security state. This is not the complete Security Manager backend.
Endpoints**
·	`GET /api/health`
·	`GET /api/access-matrix` (sample/demo records; supports filters such as `blueprint`, `version`, `environment`, `role`, `object`, `privilege`, `status`, and `request\_manager`)
·	`GET /api/v1/discovery/catalogs`
·	`GET /api/v1/discovery/catalogs/{catalog\_name}/schemas`
·	`GET /api/v1/discovery/catalogs/{catalog\_name}/objects?schema\_names=SCHEMA`
Search, pagination, and object-type filtering are supported by the discovery endpoints.
Local setup
1.	Use the Python version approved by the project.
2.	Create a virtual environment.
3.	Install dependencies: `pip install -r requirements.txt`
4.	Copy `.env.example` to `.env` and configure the development workspace.
5.	Run syntax check: `python -m compileall .`
6.	Run tests: `pytest`
7.	Start: `uvicorn main:app --reload --port 8000`
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
