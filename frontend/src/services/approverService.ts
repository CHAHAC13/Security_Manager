import apiClient from '@/lib/apiClient';
import {
  APPROVER_ENDPOINTS, MOCK_ERROR_DEFAULT, MOCK_LATENCY_MS, USE_MOCK,
} from '@/config/approverConfig';
import {
  MOCK_DIRECTORY_USERS, MOCK_FALLBACK_APPROVER_PAIRS, MOCK_ROLE_APPROVERS_BY_NAME,
} from '@/data/approverData';
import type { Approver, RoleApproversMap } from '@/types/blueprint';

/* ── Request / response contracts ── */

export interface RoleApproverLookup {
  roleId: string;
  roleName: string;
}

export interface GetRoleApproversRequest {
  /** Draft/blueprint identifier the lookup is made for. */
  blueprintId: string;
  /** Existing roles whose current approvers should be returned. */
  roles: RoleApproverLookup[];
}

/** `{ [roleId]: { technical, business } }` — roles without approvers may be omitted. */
export type GetRoleApproversResponse = RoleApproversMap;

export type SearchDirectoryUsersResponse = Approver[];

export interface SaveApproversDraftRequest {
  approvers: RoleApproversMap;
}

export interface SaveApproversDraftResponse {
  success: boolean;
  /** ISO-8601 timestamp. */
  savedAt: string;
}

export interface ApproverService {
  searchDirectoryUsers(query: string, signal?: AbortSignal): Promise<SearchDirectoryUsersResponse>;
  getRoleApprovers(request: GetRoleApproversRequest): Promise<GetRoleApproversResponse>;
  saveApproversDraft(blueprintId: string, approvers: RoleApproversMap): Promise<SaveApproversDraftResponse>;
}

/* ── Mock implementation ── */

let mockErrorEnabled = MOCK_ERROR_DEFAULT;

/** Toggle simulated failures of the default mock service (e.g. from the browser console in dev). */
export function setMockApproverError(enabled: boolean) {
  mockErrorEnabled = enabled;
}

export interface MockApproverServiceOptions {
  latencyMs?: readonly [number, number];
  shouldFail?: () => boolean;
  users?: Approver[];
}

function stableIndex(value: string, size: number) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % size;
}

/** Strips the `dbx-<env>-` prefix so a mock lookup matches the same role in any environment. */
function environmentAgnostic(roleName: string) {
  return roleName.replace(/^dbx-[a-z]+-/, '');
}

export function createMockApproverService({
  latencyMs = MOCK_LATENCY_MS,
  shouldFail = () => mockErrorEnabled,
  users = MOCK_DIRECTORY_USERS,
}: MockApproverServiceOptions = {}): ApproverService {
  async function simulate(signal?: AbortSignal) {
    const [min, max] = latencyMs;
    const delay = min + Math.random() * Math.max(0, max - min);
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
    if (shouldFail()) throw new Error('Approver service is unavailable (simulated mock error).');
  }
  const byName = new Map(Object.entries(MOCK_ROLE_APPROVERS_BY_NAME)
    .map(([name, approvers]) => [environmentAgnostic(name), approvers]));

  return {
    async searchDirectoryUsers(query, signal) {
      await simulate(signal);
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      return structuredClone(users.filter((item) => {
        const haystack = `${item.displayName} ${item.email} ${item.department ?? ''}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      }));
    },
    async getRoleApprovers({ roles }) {
      await simulate();
      const result: GetRoleApproversResponse = {};
      for (const role of roles) {
        // Deterministic demo data for roles without explicit fixtures, not real ownership.
        result[role.roleId] = structuredClone(byName.get(environmentAgnostic(role.roleName))
          ?? MOCK_FALLBACK_APPROVER_PAIRS[stableIndex(role.roleName, MOCK_FALLBACK_APPROVER_PAIRS.length)]);
      }
      return result;
    },
    async saveApproversDraft(_blueprintId, approvers) {
      await simulate();
      structuredClone(approvers);
      return { success: true, savedAt: new Date().toISOString() };
    },
  };
}

/* ── HTTP implementation (activate with USE_MOCK = false) ── */

export function createHttpApproverService(): ApproverService {
  return {
    async searchDirectoryUsers(query, signal) {
      const { data } = await apiClient.get<SearchDirectoryUsersResponse>(
        APPROVER_ENDPOINTS.searchDirectoryUsers, { params: { q: query }, signal },
      );
      return data;
    },
    async getRoleApprovers({ blueprintId, roles }) {
      const { data } = await apiClient.get<GetRoleApproversResponse>(
        APPROVER_ENDPOINTS.blueprintApprovers(blueprintId),
        { params: { roleIds: roles.map((role) => role.roleId).join(',') } },
      );
      return data;
    },
    async saveApproversDraft(blueprintId, approvers) {
      const body: SaveApproversDraftRequest = { approvers };
      const { data } = await apiClient.put<SaveApproversDraftResponse>(
        APPROVER_ENDPOINTS.blueprintApprovers(blueprintId), body,
      );
      return data;
    },
  };
}

export const approverService: ApproverService = USE_MOCK ? createMockApproverService() : createHttpApproverService();
