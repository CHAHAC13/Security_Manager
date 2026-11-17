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

export const APPROVER_ENDPOINTS = {
  /** GET ?search=&page=1&page_size=100 */
  businessApprovers: '/api/v1/approvers/business',
  /** GET */
  technicalApprovers: '/api/v1/approvers/technical',
} as const;

/** Placeholder Domain/Business Owners shown until the directory search is enabled again. */
export const DUMMY_BUSINESS_OWNERS = [
  { id: 'dummy-business-1', displayName: 'Alex Morgan', email: 'alex.morgan@example.com', department: 'Clinical Data' },
  { id: 'dummy-business-2', displayName: 'Priya Sharma', email: 'priya.sharma@example.com', department: 'Commercial Analytics' },
  { id: 'dummy-business-3', displayName: 'Daniel Okafor', email: 'daniel.okafor@example.com', department: 'Finance' },
  { id: 'dummy-business-4', displayName: 'Mei Chen', email: 'mei.chen@example.com', department: 'R&D Operations' },
] as const;
