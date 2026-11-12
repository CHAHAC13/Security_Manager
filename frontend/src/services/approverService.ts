import apiClient from '@/lib/apiClient';
import { APPROVER_ENDPOINTS } from '@/config/approverConfig';
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
  canSaveDraft: boolean;
  listTechnicalApprovers(): Promise<Approver[]>;
  searchDirectoryUsers(query: string, signal?: AbortSignal): Promise<SearchDirectoryUsersResponse>;
  getRoleApprovers?(request: GetRoleApproversRequest): Promise<GetRoleApproversResponse>;
  saveApproversDraft(blueprintId: string, approvers: RoleApproversMap): Promise<SaveApproversDraftResponse>;
}

interface ApiApprover {
  id: string;
  display_name: string;
  email: string;
  department?: string | null;
}

function mapApiApprover(item: ApiApprover): Approver {
  return {
    id: item.id,
    displayName: item.display_name,
    email: item.email,
    ...(item.department ? { department: item.department } : {}),
  };
}

export function createHttpApproverService(): ApproverService {
  return {
    canSaveDraft: false,
    async listTechnicalApprovers() {
      const { data } = await apiClient.get<{ items: ApiApprover[] }>(
        APPROVER_ENDPOINTS.technicalApprovers,
      );
      return data.items.map(mapApiApprover);
    },
    async searchDirectoryUsers(query, signal) {
      const users: Approver[] = [];
      let page = 1;
      let hasNext: boolean;
      do {
        const { data } = await apiClient.get<{ items: ApiApprover[]; pagination: { has_next: boolean } }>(
          APPROVER_ENDPOINTS.businessApprovers,
          { params: { search: query, page, page_size: 100 }, signal },
        );
        if (typeof data.pagination?.has_next !== 'boolean') {
          throw new Error('Business approver search returned invalid pagination.');
        }
        users.push(...data.items.map(mapApiApprover));
        hasNext = data.pagination.has_next;
        if (hasNext && data.items.length === 0) {
          throw new Error('Business approver search returned an empty page with more results.');
        }
        page += 1;
      } while (hasNext);
      return users;
    },
    async saveApproversDraft() {
      throw new Error('Saving approver assignments is unavailable until the draft API is implemented.');
    },
  };
}

export const approverService: ApproverService = createHttpApproverService();
