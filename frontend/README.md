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
  hook only depend on that interface. Its current binding uses deterministic
  fixtures from `src/data/permissionsData.ts`, with no permission HTTP calls,
  artificial delays, random failures, or browser-storage persistence.
- `getSelectedObjects` adapts wizard selections into a hierarchy with
  catalog-qualified stable IDs. `getPermissionMetadata` returns privilege
  options, configurable role types, and form types together.
- Existing-role discovery/search is restricted to the selected scope and Setup
  environment. The mock generates deterministic fixture roles, not real grants.
- `validateRoleName` is called for new roles before Next; existing names are
  read-only. `savePermissionsDraft` accepts the full wizard snapshot, including
  incomplete/invalid assignments. The mock checks serializability only and
  explicitly reports that saves are not durable. Saves from other steps first
  reconcile permissions against the current scope/environment, so saving
  directly from Objects cannot retain grants for deselected objects.
- To connect the API, implement `PermissionsService` and replace the exported
  binding. Map the confirmed API DTOs inside that adapter; no endpoint URLs or
  server payload contract have been assumed. The UI model is not a prescribed
  server DTO. Strip discovery bookkeeping and derive grant/revoke operations as
  needed by the agreed contract.
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
receive their discovered originals. An environment change replaces existing
role discovery while retaining new-role edits. A new role whose scope disappears
moves to the first available scope of its level with no carried-over grants for
removed objects; with no scope available it remains incomplete and Next is blocked.
Removing an existing role assignment only excludes it from this blueprint; it
does not delete the Databricks role.

Inheritance hints only show catalog grants recorded on the **same role** and do
not mutate, check, disable or infer child grants. Request Manager No clears its
inactive form/display fields while retaining original settings for change
tracking. Unknown discovered privileges are shown so they can be removed, and
cannot be silently submitted as supported grants.

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
components, and wizard navigation/draft integration. Wizard integration tests
isolate the Objects page's external discovery dependency; browser smoke testing
can use deterministic discovery responses against the actual Objects UI.

Known unrelated repository-wide validation blockers at implementation time:
`BlueprintEditorPage.tsx` passes an un-narrowed string to its environment filter;
`useAccessMatrix.ts` fails `react-hooks/set-state-in-effect`. Neither is part of
the Permissions change. The production Vite build and the changed-file ESLint
check pass independently.

## Blueprint Approvers (Step 4)

Assigns at least one Technical/System Owner and one Domain/Business Owner to
every role produced by the Permissions step. Roles are read from wizard state
(`permissionsData.roleAssignments`) and never refetched; approvers are stored in
`BlueprintFormData.approvers` as `{ approvers: { [roleId]: { technical, business } }, prefilledRoleIds }`.

| File | Responsibility |
|---|---|
| `src/config/approverConfig.ts` | `MAX_APPROVERS_PER_TYPE`, `ALLOW_SAME_PERSON_BOTH_TYPES`, debounce/min chars, `USE_MOCK`, mock latency/error toggle, endpoint placeholders. |
| `src/services/approverService.ts` | `ApproverService` contract + request/response types, mock implementation, HTTP adapter (`apiClient`). |
| `src/data/approverData.ts` | Mock directory users, known role approvers and sample roles. |
| `src/lib/approvers.ts` | Pure validation, add/remove, Apply-to-All, reconcile/prefill, filter and scope helpers (unit-tested). |
| `src/hooks/useApprovers.ts` | Prefills existing roles once, prunes removed roles, loads scope labels, loading/error/retry. |
| `src/components/blueprint/BlueprintApproversForm.tsx` | Step orchestration: header/progress, toolbar, banner, table, modal, toast, empty state. |
| `ApproverTable`, `ApproverCell`, `UserPickerTypeahead`, `ApplyToAllModal`, `ValidationBanner` | Reusable building blocks in `src/components/blueprint/`. |

### Switching to the real API

1. Implement backend endpoints matching the types in `approverService.ts`:
   `GET /api/directory/users?q=`, `GET /api/blueprints/{id}/approvers?roleIds=`,
   `PUT /api/blueprints/{id}/approvers` (body `{ approvers }`, response `{ success, savedAt }`).
2. Set `VITE_APPROVERS_USE_MOCK=false` (or change `USE_MOCK`). No UI changes needed.
3. Replace the wizard's client-generated `draft-<uuid>` blueprint id with the id issued by the backend.

Mock failures can be simulated with `VITE_APPROVERS_MOCK_ERROR=true` or
`setMockApproverError(true)`.

### Behaviour notes

- Next ("Next: Review & Submit") is disabled until every role is complete; Save Draft is always allowed.
- Existing-role approvers are prefilled once per role (`prefilledRoleIds`), so user removals are not re-filled on revisit.
- Apply to All supports Add/Replace and "Only roles missing approvers" (fills only empty columns); replacing that would remove approvers requires confirmation.
- Same person in both columns is a warning when `ALLOW_SAME_PERSON_BOTH_TYPES` is true, otherwise a blocking error.
- UI validation is not a security boundary; the backend must re-validate approvers, reject service accounts and enforce self-approval rules.

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
