/**
 * Approver Assignment (Step 4) configuration.
 * Business-rule values below are working assumptions pending product confirmation.
 */

/** Maximum approvers allowed per approver type (technical / business) per role. */
export const MAX_APPROVERS_PER_TYPE = 5;

/** When true, the same person in both columns is a warning; when false it is a blocking error. */
export const ALLOW_SAME_PERSON_BOTH_TYPES = true;

/** Directory typeahead behaviour. */
export const DIRECTORY_SEARCH_DEBOUNCE_MS = 300;
export const DIRECTORY_SEARCH_MIN_CHARS = 2;

/**
 * Switch between the mock service and the HTTP adapter.
 * Set `VITE_APPROVERS_USE_MOCK=false` once the backend endpoints exist.
 */
export const USE_MOCK = import.meta.env.VITE_APPROVERS_USE_MOCK !== 'false';

/** Simulated mock latency range in milliseconds. */
export const MOCK_LATENCY_MS: readonly [number, number] = [300, 600];

/** Start the mock in failure mode (`VITE_APPROVERS_MOCK_ERROR=true`); toggle at runtime via `setMockApproverError`. */
export const MOCK_ERROR_DEFAULT = import.meta.env.VITE_APPROVERS_MOCK_ERROR === 'true';

/** Endpoint placeholders for the backend integration. */
export const APPROVER_ENDPOINTS = {
  /** GET ?q= */
  searchDirectoryUsers: '/api/directory/users',
  /** GET (?roleIds=) current approvers, PUT draft approvers. */
  blueprintApprovers: (blueprintId: string) => `/api/blueprints/${encodeURIComponent(blueprintId)}/approvers`,
} as const;
