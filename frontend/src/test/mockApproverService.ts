import {
  MOCK_DIRECTORY_USERS, MOCK_FALLBACK_APPROVER_PAIRS, MOCK_ROLE_APPROVERS_BY_NAME, TECHNICAL_OWNERS,
} from '@/test/approverData';
import type { ApproverService, GetRoleApproversResponse } from '@/services/approverService';
import type { Approver } from '@/types/blueprint';

export function createMockApproverService({
  latencyMs = [0, 0],
  shouldFail = () => false,
  users = MOCK_DIRECTORY_USERS,
}: {
  latencyMs?: readonly [number, number];
  shouldFail?: () => boolean;
  users?: Approver[];
} = {}): ApproverService & { getRoleApprovers: NonNullable<ApproverService['getRoleApprovers']> } {
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
  const normalize = (name: string) => name.replace(/^dbx-[a-z]+-/, '');
  const byName = new Map(Object.entries(MOCK_ROLE_APPROVERS_BY_NAME)
    .map(([name, approvers]) => [normalize(name), approvers]));
  return {
    canSaveDraft: true,
    async listTechnicalApprovers() {
      await simulate();
      return structuredClone([...TECHNICAL_OWNERS]);
    },
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
        let hash = 0;
        for (const char of role.roleName) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        result[role.roleId] = structuredClone(byName.get(normalize(role.roleName))
          ?? MOCK_FALLBACK_APPROVER_PAIRS[hash % MOCK_FALLBACK_APPROVER_PAIRS.length]);
      }
      return result;
    },
    async saveApproversDraft() {
      await simulate();
      return { success: true, savedAt: new Date().toISOString() };
    },
  };
}
