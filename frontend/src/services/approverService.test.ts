import { describe, expect, it } from 'vitest';
import { createMockApproverService } from './approverService';
import { MOCK_APPROVER_SAMPLE_ROLES } from '@/data/approverData';

const service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });

describe('mock approver service', () => {
  it('searches directory users by name, email or department', async () => {
    expect((await service.searchDirectoryUsers('laura')).map((user) => user.displayName)).toEqual(['Laura Ross']);
    expect((await service.searchDirectoryUsers('ross')).map((user) => user.displayName)).toEqual(['Laura Ross', 'Sofia Rossi']);
    expect((await service.searchDirectoryUsers('clinical data')).length).toBe(2);
    expect(await service.searchDirectoryUsers('zzzz')).toEqual([]);
  });

  it('returns current approvers of the specified existing roles', async () => {
    const result = await service.getRoleApprovers({
      blueprintId: 'draft-1',
      roles: MOCK_APPROVER_SAMPLE_ROLES.filter((role) => role.status === 'EXISTING').map((role) => ({ roleId: role.id, roleName: role.roleName })),
    });
    expect(result['role-clinops'].technical.map((user) => user.displayName)).toEqual(['Sanjay Subramanian']);
    expect(result['role-clinops'].business.map((user) => user.displayName)).toEqual(['Anne Croteau']);
    expect(result['role-clinops-cdm'].technical.map((user) => user.displayName)).toEqual(['Laura Ross']);
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
