import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApproverService, approverService } from './approverService';
import { createMockApproverService } from '@/test/mockApproverService';
import { MOCK_APPROVER_SAMPLE_ROLES } from '@/test/approverData';
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

    it('loads technical owners and maps API records to frontend approvers', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          count: 1,
          items: [{
            id: 'api-technical',
            display_name: 'Owner, Technical',
            first_name: 'Technical',
            last_name: 'Owner',
            email: 'technical@example.com',
            job_title: null,
            department: 'Engineering',
            approver_type: 'TECHNICAL',
          }],
        },
      });
      expect(await http.listTechnicalApprovers()).toEqual([{
        id: 'api-technical',
        displayName: 'Owner, Technical',
        email: 'technical@example.com',
        department: 'Engineering',
      }]);
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/approvers/technical');
    });

    it('passes business directory queries and abort signals to the API', async () => {
      const users = [{
        id: 'api-business',
        display_name: 'Owner, Business',
        first_name: 'Business',
        last_name: 'Owner',
        email: 'business@example.com',
        job_title: 'Manager',
        department: 'Governance',
        approver_type: 'BUSINESS',
      }];
      const controller = new AbortController();
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { items: users, pagination: { has_next: false } } });
      expect(await http.searchDirectoryUsers('Business', controller.signal)).toEqual([{
        id: 'api-business',
        displayName: 'Owner, Business',
        email: 'business@example.com',
        department: 'Governance',
      }]);
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/approvers/business', {
        params: { search: 'Business', page: 1, page_size: 100 },
        signal: controller.signal,
      });
    });

    it('loads all matching business owners across API pages', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: { items: [{ id: '1', display_name: 'First', email: 'first@example.com' }], pagination: { has_next: true } } })
        .mockResolvedValueOnce({ data: { items: [{ id: '2', display_name: 'Second', email: 'second@example.com' }], pagination: { has_next: false } } });
      expect((await http.searchDirectoryUsers('Owner')).map((owner) => owner.id)).toEqual(['1', '2']);
      expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/v1/approvers/business', {
        params: { search: 'Owner', page: 2, page_size: 100 },
        signal: undefined,
      });
    });

    it('surfaces invalid pagination instead of returning partial results', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { items: [], pagination: { has_next: true } } });
      await expect(http.searchDirectoryUsers('Owner')).rejects.toThrow(/empty page/);
    });

    it('does not pretend role assignments or draft persistence are available', async () => {
      expect(approverService.getRoleApprovers).toBeUndefined();
      expect(approverService.canSaveDraft).toBe(false);
      await expect(approverService.saveApproversDraft('draft', {})).rejects.toThrow(/unavailable/);
      expect(apiClient.put).not.toHaveBeenCalled();
    });

    it('propagates API errors without falling back to mock users or owners', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('API unavailable'));
      vi.mocked(apiClient.put).mockRejectedValue(new Error('Save unavailable'));
      await expect(http.listTechnicalApprovers()).rejects.toThrow('API unavailable');
      await expect(http.searchDirectoryUsers('Business')).rejects.toThrow('API unavailable');
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
