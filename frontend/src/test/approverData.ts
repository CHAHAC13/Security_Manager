import type { Approver, RoleApprovers } from '@/types/blueprint';
export const TECHNICAL_OWNERS: readonly Approver[] = [
  { id: 'technical-jisun-yoon', displayName: 'Jisun Yoon', email: 'Jisun.Yoon@Pfizer.com' },
  { id: 'technical-sreeram-koneru', displayName: 'Sreeram Koneru', email: 'Sreeram.Koneru@pfizer.com' },
];

/** Mock corporate directory. Not a directory integration. */
export const MOCK_DIRECTORY_USERS: Approver[] = [
  ...TECHNICAL_OWNERS,
  { id: 'u-001', displayName: 'Sanjay Subramanian', email: 'sanjay.subramanian@example.com', department: 'Data Platform Engineering' },
  { id: 'u-002', displayName: 'Anne Croteau', email: 'anne.croteau@example.com', department: 'Clinical Operations' },
  { id: 'u-003', displayName: 'Laura Ross', email: 'laura.ross@example.com', department: 'Clinical Data Management' },
  { id: 'u-004', displayName: 'Kevin Traylor', email: 'kevin.traylor@example.com', department: 'Clinical Data Management' },
  { id: 'u-005', displayName: 'Priya Natarajan', email: 'priya.natarajan@example.com', department: 'Data Platform Engineering' },
  { id: 'u-006', displayName: 'Michael Chen', email: 'michael.chen@example.com', department: 'Cloud Infrastructure' },
  { id: 'u-007', displayName: 'Emily Dawson', email: 'emily.dawson@example.com', department: 'Quality Assurance' },
  { id: 'u-008', displayName: 'Rafael Moreno', email: 'rafael.moreno@example.com', department: 'Regulatory Affairs' },
  { id: 'u-009', displayName: 'Hannah Becker', email: 'hannah.becker@example.com', department: 'Veeva Quality Systems' },
  { id: 'u-010', displayName: 'Omar Haddad', email: 'omar.haddad@example.com', department: 'Information Security' },
  { id: 'u-011', displayName: 'Grace Okafor', email: 'grace.okafor@example.com', department: 'Clinical Operations' },
  { id: 'u-012', displayName: 'Daniel Novak', email: 'daniel.novak@example.com', department: 'Data Governance' },
  { id: 'u-013', displayName: 'Mei Tanaka', email: 'mei.tanaka@example.com', department: 'Biostatistics' },
  { id: 'u-014', displayName: 'Lucas Fischer', email: 'lucas.fischer@example.com', department: 'Data Platform Engineering' },
  { id: 'u-015', displayName: 'Sofia Rossi', email: 'sofia.rossi@example.com', department: 'Pharmacovigilance' },
];

function user(id: string): Approver {
  const found = MOCK_DIRECTORY_USERS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown mock directory user ${id}`);
  return found;
}

/** Current approvers of known existing roles, keyed by role name. */
export const MOCK_ROLE_APPROVERS_BY_NAME: Record<string, RoleApprovers> = {
  'dbx-env-gpd-user-odx-clinops': { technical: [TECHNICAL_OWNERS[0]], business: [user('u-002')] },
  'dbx-env-gpd-user-odx-clinops-cdm': { technical: [TECHNICAL_OWNERS[1]], business: [user('u-004')] },
};

/** Technical/business pairs used for deterministic demo prefill of other existing roles. */
export const MOCK_FALLBACK_APPROVER_PAIRS: RoleApprovers[] = [
  { technical: [TECHNICAL_OWNERS[0]], business: [user('u-011')] },
  { technical: [TECHNICAL_OWNERS[1]], business: [user('u-012')] },
  { technical: [...TECHNICAL_OWNERS], business: [user('u-007')] },
];

/** Sample roles matching the Step 4 specification, useful for tests and demos. */
export const MOCK_APPROVER_SAMPLE_ROLES = [
  { id: 'role-clinops', roleName: 'dbx-env-gpd-user-odx-clinops', status: 'EXISTING' },
  { id: 'role-clinops-cdm', roleName: 'dbx-env-gpd-user-odx-clinops-cdm', status: 'EXISTING' },
  { id: 'role-veevaquality', roleName: 'dbx-prd-gpd-user-odx-clinops-veevaquality', status: 'NEW' },
] as const;
