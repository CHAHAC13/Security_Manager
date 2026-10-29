# React + TypeScript + Vite

## Objects pagination

Schema and object lists request five records at a time and show
`Page X of Y` beside Previous/Next when there is more than one page.
Totals come from the discovery API's `total_items` and `total_pages`, not the
number of records loaded so far. Metadata is cached with each resource list;
object totals follow the focused schema and schema totals follow the catalog.
Page changes preserve selected schemas and objects and do not prefetch remaining
pages. Proposed local definitions are not included in the API's page totals.
The discovery API must return non-negative integer totals; invalid or missing
totals use the existing discovery error/retry UI.
Objects are fetched with
`GET /api/v1/discovery/catalogs/{catalog_name}/schemas/{schema_name}/objects`.
Catalog and schema path segments are URL-encoded; filters and pagination use
`object_type`, `search`, `page`, and `page_size` query parameters.

The catalog picker searches catalog **names only**, using
`GET /api/v1/discovery/catalogs?search=...&search_by=name`.
Matching is case-insensitive and runs on the backend before pagination, so it
includes matching names beyond the initially loaded page. Shared catalog tags
do not make unrelated names match. The existing 300 ms debounce, query-specific
cache, and Load more catalogs control still apply. Clearing search restores the
unfiltered list without changing the selected catalog or its selected resources.
Load more keeps the picker open and appends results to the existing list. The
button remains focusable while loading, but repeat clicks/keyboard activation
are blocked until the request finishes. When the final page removes the button,
focus returns to the search box without closing the picker. Catalog selection,
Escape, outside clicks, and tabbing out still dismiss it.
The backend's configured tag eligibility filter is unchanged; searching does not
reveal catalogs excluded by that filter.

## Blueprint Permissions (Step 3)

The Permissions editor uses collapsible Role Assignment cards. Each single-line
header shows the role name, New/Existing badge, level and role type, with grant/
revoke counts only when privileges have changed. Cards start collapsed except
newly created roles. Expand All / Collapse All controls change card visibility
without changing assignments or grants.

Each expanded card owns its Objects & Permissions tree, containing only that
role's scope and descendants, with inline privilege checkboxes. Edits target
exactly one role-ID/object-ID record. Different roles never share grants merely
because they reference the same resource. There is no separate resource-first
section or privilege dropdown.

New roles retain editable level, scope, role type and role name controls.
Existing identity is read-only text, with no disabled identity dropdowns or name
counter. Removing an existing assignment uses "Remove from blueprint" and requires
confirmation. Request Manager uses Yes/No radios inside each card; Form Type and
Display Name appear only for Yes.

The global creation button supports creating or searching existing roles. The
only resource-specific creation shortcut appears in warnings for new leaf
objects with no role coverage; it preselects that object's scope. Parent-scoped
roles count as coverage. All selected schemas, including `information_schema`,
and their selected descendants are included in discovery, role scopes and trees;
there is currently no system-schema exclusion.
Mock role names use the same environment/type/catalog/scope naming helper as new
roles, without generated display-name suffixes.

Validation expands invalid cards before focusing the first invalid field.
Escape collapses the active card and returns focus to its header.

The editor uses the existing wizard-owned state, shared footer, buttons and
badges. The environment remains `dev` by default in wizard state; Setup does not
display an environment selector.
The five-step wizard and single-catalog Objects picker are intentionally unchanged.
Approvers and Review remain the existing placeholders; Deployment is not part of
this implementation.

### Data flow and API integration

- `src/types/blueprint.ts` defines role assignments, scoped object permissions,
  immutable discovery baselines, Request Manager configuration and field errors.
- Objects retains catalog/schema **metadata snapshots** beside its existing
  selection IDs so Permissions does not re-fetch or re-select those objects.
- `src/services/permissionsService.ts` exposes `PermissionsService`. The UI and
  hook only depend on that interface. Its default binding is
  `apiPermissionsService`, which reads actual grants through
  `POST /api/v1/discovery/privileges`. `createMockPermissionsService` remains
  available for isolated component tests; API failures never fall back to it.
- `getSelectedObjects` adapts wizard selections into a hierarchy with
  catalog-qualified stable IDs. `getPermissionMetadata` returns privilege
  options, configurable role types, and form types together. Those options still
  come from local configuration in `src/data/permissionsData.ts`; the backend
  has no permission-metadata endpoint.
- Discovery sends existing selected catalogs, schemas, tables and views as
  `{ securable_type, full_name }`, using names from the selected hierarchy rather
  than opaque UI IDs. Materialized views use `VIEW`. Proposed resources are not
  sent, empty selections make no request, and selections over the backend's
  100-item limit are split into batches. An error in any batch fails the entire
  load through the existing error/retry UI.
- Requests use `include_inherited: true` for every selected existing resource.
  Principal names, privilege codes such as `USE_CATALOG`, inheritance flags and
  source fields are retained exactly as returned, including nulls and response
  order. Each resource stores read-only `discoveredAssignments` snapshots with
  all response fields internally, separate from local edits. The application
  displays simple permission controls and inheritance details, not raw JSON
  panels. Empty and inherited-only assignments are not dropped.
- Only privileges with `inherited: false` populate the direct-grant baseline
  and editable checkboxes. Inherited privileges are displayed separately as
  read-only entries, with the exact catalog/schema/metastore source supplied
  by the API, including multiple sources for the same privilege. No inheritance
  is inferred from catalog checkboxes or copied to child grant selections.
  API-discovered direct grants remain valid on that exact principal/resource
  even when the local option list is incomplete; keeping them never requires
  deleting grants. Local additional-grant options use API-style underscore codes.
- Each returned principal becomes one existing assignment per selected catalog,
  grouping its grants across the selected hierarchy. Principal names are
  preserved, not generated or classified by naming conventions. Catalog scope
  is an editor grouping, not a claim about a principal's actual Databricks role
  level. The endpoint can return groups, users and service principals without
  distinguishing them; missing role types are omitted from card headers without
  a placeholder or separator. The Role Type selector remains available for new
  roles. Request Manager fields start unset because discovery provides no
  such metadata; they are local editor values, not authoritative server settings.
- Search filters principals returned for the selected resources, not all roles
  in the workspace. The backend has no environment parameter: the configured
  backend workspace determines the source, while Setup environment partitions
  local discovery IDs. It does not filter grants by role-name prefix.
- `validateRoleName` is called for new roles before Next; existing names are
  read-only. No name-validation or draft-write endpoint exists yet, so the API
  adapter explicitly rejects those operations with visible errors. Next remains
  available for valid existing assignments, but new-role validation cannot be
  completed. Edits remain in wizard state across Back/Next navigation; they are
  not persisted and no grants are applied. The mock service used in tests still
  checks draft serializability only. Saves from other steps first
  reconcile permissions against the current scope/environment, so saving
  directly from Objects cannot retain grants for deselected objects.
- Future name-validation, draft-write and grant-application APIs should be wired
  through `PermissionsService`, mapping their confirmed DTOs inside the adapter.
  The current discovery POST only reads privileges and is never used to save
  changes. Strip discovery bookkeeping and derive grant/revoke operations as
  needed by the future write contract.
- Return `{ valid: false, message }` for name conflicts. Throw
  `PermissionsValidationError` with role-ID-keyed field errors for server
  validation, or an `Error` for transport/service failures. Both are surfaced in
  the editor; save failures remain retryable.
- Production must independently authorize and validate scope, role identity,
  privileges, name uniqueness and draft writes, and obtain authoritative
  baselines. Client validation is not a security boundary.

### Behavior and scope

`src/lib/permissions.ts` owns naming, level/scope selection, validation,
grant/revoke and Request Manager diffs, and ID-based reconciliation. Catalog
roles cover their selected subtree, schema roles their selected subtree, and
object roles their selected leaf. Existing identity (level/scope/type/name) is
read-only; privileges and Request Manager values remain editable.

New-role names regenerate until manually edited. Recommendations are never
silently truncated: overlength names must be shortened by the user while
retaining the environment/type prefix and the level's scope-token structure.
Catalog/schema/dataset tokens are normalized to lowercase hyphenated text.
Existing role names are not renamed to match a new recommendation, but still
must be nonempty and unique in the blueprint. The 32-character creation limit
applies only to new roles, not read-only existing identities. New roles require
at least one privilege; existing roles may have no remaining privileges so all
original grants can be revoked without deleting the role.

Reconciliation preserves edits on retained objects, removes deselected objects
from active assignments, and discovers newly applicable roles without duplicating
or resurrecting deliberately removed roles. New descendants of an existing role
receive their discovered originals. Reloaded resource snapshots and baselines
are refreshed from discovery, then only the user's prior explicit direct-grant
additions/removals are reapplied. Upstream changes and newly returned inheritance
do not manufacture local grant/revoke operations. Older space-separated wizard
labels are migrated to raw API codes without creating changes.
An environment change replaces existing
role discovery while retaining new-role edits. A new role whose scope disappears
moves to the first available scope of its level with no carried-over grants for
removed objects; with no scope available it remains incomplete and Next is blocked.
Removing an existing role assignment only excludes it from this blueprint; it
does not delete the Databricks role.

Inheritance displays use only the API records for the **same principal/resource**,
not parent-grant guesses. Editing a catalog does not change any inherited
snapshot or child checkbox. Inherited records never participate in grant/revoke
diffs. Opening/collapsing cards, searching and revisiting Permissions do not
create changes; only explicit edits to direct-grant checkboxes do.
Request Manager No clears its
inactive form/display fields while retaining original settings for change
tracking. Discovered original privileges remain checked on initial load and can
be kept, unchecked, or restored without an unsupported-privilege error. They do
not become globally available grant options for other principals or resources.
Arbitrary new privileges outside the local options and that resource's baseline
are still rejected. "Pending addition" / "Pending removal" labels describe only
local differences; they do not mean changes have been applied to Databricks.
A resource with changed existing grants offers Restore original permissions to
undo local changes, including removals made before the validation fix.

The permissions hierarchy/utilities support multiple catalogs and FUNCTION /
EXECUTE data. The existing Objects UI still selects one catalog and offers its
existing table/view/materialized-view kinds; materialized views use VIEW
privileges. Expanding discovery/Objects to other resource kinds or simultaneous
catalog selection is outside this step's agreed scope.

### Validation and tests

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Vitest and React Testing Library cover utility boundaries, the permissions
components, and wizard navigation/draft integration. API adapter tests cover
exact route/body contracts, fully qualified names, direct-grant baselines,
principal grouping, batching at 100 resources, malformed responses, unsupported
operations and transport errors. Discovery integration tests exercise real
frontend adapters against mocked HTTP responses, including error/retry behavior.
Other wizard integration tests
isolate the Objects page's external discovery dependency; browser smoke testing
can use deterministic discovery responses against the actual Objects UI.

Known unrelated repository-wide validation blockers at implementation time:
`BlueprintEditorPage.tsx` passes an un-narrowed string to its environment filter;
`useAccessMatrix.ts` fails `react-hooks/set-state-in-effect`. Neither is part of
the Permissions change. The production Vite build and the changed-file ESLint
check pass independently.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
