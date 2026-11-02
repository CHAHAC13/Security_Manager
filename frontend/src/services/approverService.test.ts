import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApproverService, createMockApproverService } from './approverService';
import { MOCK_APPROVER_SAMPLE_ROLES } from '@/data/approverData';
import { TECHNICAL_OWNERS } from '@/config/approverConfig';
import apiClient from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

const service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });

describe('mock approver service', () => {
  it('searches directory users by name, email or department', async () => {
    expect((await service.searchDirectoryUsers('laura')).map((user) => user.displayName)).toEqual(['Laura Ross']);
    expect((await service.searchDirectoryUsers('ross')).map((user) => user.displayName)).toEqual(['Laura Ross', 'Sofia Rossi']);
    expect((await service.searchDirectoryUsers('clinical data')).length).toBe(2);
    expect(await service.searchDirectoryUsers('zzzz')).toEqual([]);
  });

  describe('HTTP approver service integration contract', () => {
    const http = createHttpApproverService();
    beforeEach(() => vi.clearAllMocks());

    it('passes business directory queries and abort signals to the API', async () => {
      const users = [{ id: 'api-business', displayName: 'Business Owner', email: 'business@example.com' }];
      const controller = new AbortController();
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: users });
      expect(await http.searchDirectoryUsers('Business', controller.signal)).toEqual(users);
      expect(apiClient.get).toHaveBeenCalledWith('/api/directory/users', { params: { q: 'Business' }, signal: controller.signal });
    });

    it('loads API-prefilled owners and saves both owner types without altering API identities', async () => {
      const approvers = {
        'role-1': {
          technical: [{ ...TECHNICAL_OWNERS[0], id: 'api-technical-id' }],
          business: [{ id: 'api-business', displayName: 'Business Owner', email: 'business@example.com' }],
        },
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: approvers });
      expect(await http.getRoleApprovers({
        blueprintId: 'draft with space', roles: [{ roleId: 'role-1', roleName: 'existing-role' }],
      })).toEqual(approvers);
      expect(apiClient.get).toHaveBeenCalledWith('/api/blueprints/draft%20with%20space/approvers', { params: { roleIds: 'role-1' } });
      const saved = { success: true, savedAt: '2026-11-02T10:00:00.000Z' };
      vi.mocked(apiClient.put).mockResolvedValueOnce({ data: saved });
      expect(await http.saveApproversDraft('draft with space', approvers)).toEqual(saved);
      expect(apiClient.put).toHaveBeenCalledWith('/api/blueprints/draft%20with%20space/approvers', { approvers });
    });

    it('propagates API errors without falling back to mock users or owners', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('API unavailable'));
      vi.mocked(apiClient.put).mockRejectedValue(new Error('Save unavailable'));
      await expect(http.searchDirectoryUsers('Business')).rejects.toThrow('API unavailable');
      await expect(http.getRoleApprovers({ blueprintId: 'draft', roles: [{ roleId: 'role', roleName: 'role' }] })).rejects.toThrow('API unavailable');
      await expect(http.saveApproversDraft('draft', {})).rejects.toThrow('Save unavailable');
    });
  });

  it('returns current approvers of the specified existing roles', async () => {
    const result = await service.getRoleApprovers({
      blueprintId: 'draft-1',
      roles: MOCK_APPROVER_SAMPLE_ROLES.filter((role) => role.status === 'EXISTING').map((role) => ({ roleId: role.id, roleName: role.roleName })),
    });
    expect(result['role-clinops'].technical.map((user) => user.displayName)).toEqual(['Jisun Yoon']);
    expect(result['role-clinops'].business.map((user) => user.displayName)).toEqual(['Anne Croteau']);
    expect(result['role-clinops-cdm'].technical.map((user) => user.displayName)).toEqual(['Sreeram Koneru']);
    expect(result['role-clinops-cdm'].business.map((user) => user.displayName)).toEqual(['Kevin Traylor']);
  });

  it('saves drafts and reports a timestamp', async () => {
    const result = await service.saveApproversDraft('draft-1', {});
    expect(result.success).toBe(true);
    expect(Number.isNaN(Date.parse(result.savedAt))).toBe(false);
  });

  it('supports a toggleable simulated error', async () => {
    let fail = true;
    const flaky = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => fail });
    await expect(flaky.searchDirectoryUsers('laura')).rejects.toThrow(/simulated mock error/);
    fail = false;
    await expect(flaky.searchDirectoryUsers('laura')).resolves.toHaveLength(1);
  });
});
