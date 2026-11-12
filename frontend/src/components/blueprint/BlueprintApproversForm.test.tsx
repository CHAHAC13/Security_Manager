import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintApproversForm } from './BlueprintApproversForm';
import { createHttpApproverService, type ApproverService } from '@/services/approverService';
import { createMockApproverService } from '@/test/mockApproverService';
import apiClient from '@/lib/apiClient';
import { createMockPermissionsService } from '@/services/permissionsService';
import { MOCK_APPROVER_SAMPLE_ROLES, TECHNICAL_OWNERS } from '@/test/approverData';
import { objects, objectsData } from '@/test/permissionFixtures';
import { INITIAL_APPROVERS_DATA } from '@/types/blueprint';
import type { BlueprintApproversData, RoleAssignment } from '@/types/blueprint';

const roles: RoleAssignment[] = MOCK_APPROVER_SAMPLE_ROLES.map((role, index) => ({
  id: role.id, roleName: role.roleName, status: role.status,
  mode: role.status === 'NEW' ? 'CREATE_NEW' : 'UPDATE_EXISTING',
  level: 'SCHEMA', scopeObjectId: index === 2 ? 't1' : 's1', roleTypeCode: 'user', roleNameManuallyEdited: false,
  objectPermissions: [{
    objectId: 't1', objectName: 'study', objectType: 'TABLE', originalPermissions: [], permissions: ['SELECT'],
  }],
  requestManager: { enabled: false, formType: '', displayName: '', originalValues: { enabled: false, formType: '', displayName: '' } },
}));

const NEW_ROLE = 'dbx-prd-gpd-user-odx-clinops-veevaquality';

function setup({ service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false }), roleList = roles, initial = INITIAL_APPROVERS_DATA }: {
  service?: ApproverService; roleList?: RoleAssignment[]; initial?: BlueprintApproversData;
} = {}) {
  const onReady = vi.fn();
  const onBack = vi.fn();
  let latest: BlueprintApproversData = initial;
  const permissions = { ...createMockPermissionsService(), getSelectedObjects: async () => objects };
  function Harness({ roleList }: { roleList: RoleAssignment[] }) {
    const [data, setData] = useState(initial);
    return <BlueprintApproversForm roles={roleList} objectsData={objectsData} data={data} blueprintId="draft-1"
      onChange={(value) => { latest = value; setData(value); }} onBack={onBack} onReadyChange={onReady}
      service={service} permissions={permissions} />;
  }
  const view = render(<Harness roleList={roleList} />);
  return { onReady, onBack, service, latest: () => latest, rerenderRoles: (next: RoleAssignment[]) => view.rerender(<Harness roleList={next} />) };
}

function row(roleName: string) {
  return screen.getByText(roleName, { selector: 'span' }).closest('tr') as HTMLElement;
}

async function addViaKeyboard(input: HTMLElement, query: string) {
  await userEvent.type(input, query);
  await screen.findByRole('option', {}, { timeout: 2000 });
  await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}');
}

describe('BlueprintApproversForm', () => {
  it('uses the owner APIs without inventing existing assignments', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (url === '/api/v1/approvers/technical') {
        return { data: { items: [{ id: 'api-tech', display_name: 'Technical Owner', email: 'technical@example.com' }] } };
      }
      if (url === '/api/v1/approvers/business') {
        return { data: { items: [{ id: 'api-biz', display_name: 'Business Owner', email: 'business@example.com' }], pagination: { has_next: false } } };
      }
      throw new Error(`Unexpected API request: ${url}`);
    });
    try {
      const { latest, onReady } = setup({ roleList: [roles[0]], service: createHttpApproverService() });
      await screen.findByText('0 of 1 roles complete');
      expect(screen.queryByText(/Current owner assignments for existing roles are unavailable/)).toBeNull();
      expect(screen.queryByText(/Approver selections are temporary/)).toBeNull();
      expect(latest().approvers[roles[0].id]).toBeUndefined();
      await userEvent.click(screen.getByRole('checkbox', { name: 'technical@example.com' }));
      await addViaKeyboard(screen.getByRole('combobox'), 'Business');
      expect(latest().approvers[roles[0].id]).toEqual({
        technical: [{ id: 'api-tech', displayName: 'Technical Owner', email: 'technical@example.com' }],
        business: [{ id: 'api-biz', displayName: 'Business Owner', email: 'business@example.com' }],
      });
      expect(get).toHaveBeenCalledWith('/api/v1/approvers/technical');
      expect(get).toHaveBeenCalledWith('/api/v1/approvers/business', expect.objectContaining({
        params: { search: 'Business', page: 1, page_size: 100 },
      }));
      await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    } finally {
      get.mockRestore();
    }
  });

  it('excludes unchanged roles from prefill, validation, counters and bulk copies', async () => {
    const unchanged = { ...roles[0], id: 'unchanged', roleName: 'unchanged-group', objectPermissions: [] };
    const base = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const getRoleApprovers = vi.fn(base.getRoleApprovers);
    const { latest } = setup({ roleList: [...roles, unchanged], service: { ...base, getRoleApprovers } });
    await screen.findByText('2 of 3 roles complete');
    expect(screen.queryByText('unchanged-group')).toBeNull();
    expect(getRoleApprovers.mock.calls[0][0].roles.map((role) => role.roleId)).toEqual(['role-clinops', 'role-clinops-cdm']);
    await userEvent.click(screen.getByRole('button', { name: 'Copy Technical/System Owners of dbx-env-gpd-user-odx-clinops to all roles' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Approvers applied to 2 roles')).toBeTruthy();
    expect(latest().approvers.unchanged).toBeUndefined();
  });

  it('allows continuing without directory lookups when all existing roles are unchanged', async () => {
    const base = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const getRoleApprovers = vi.fn(base.getRoleApprovers);
    const { onReady } = setup({ roleList: [{ ...roles[0], objectPermissions: [] }], service: { ...base, getRoleApprovers } });
    expect(await screen.findByText(/No changes require approval/)).toBeTruthy();
    expect(getRoleApprovers).not.toHaveBeenCalled();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply to All Roles' })).toBeNull();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  });

  it('prunes approvers when a permission edit is reverted and includes Request Manager-only edits', async () => {
    const { latest, rerenderRoles, onReady } = setup({ roleList: [roles[0]] });
    await screen.findByText('1 of 1 roles complete');
    rerenderRoles([{ ...roles[0], objectPermissions: [] }]);
    await screen.findByText(/No changes require approval/);
    expect(latest()).toEqual({ approvers: {}, prefilledRoleIds: [] });
    expect(onReady).toHaveBeenLastCalledWith(true);
    rerenderRoles([{
      ...roles[0], objectPermissions: [],
      requestManager: { ...roles[0].requestManager, enabled: true, formType: 'regular', displayName: 'Updated group' },
    }]);
    await screen.findByText('1 of 1 roles complete');
    expect(screen.getByText(roles[0].roleName)).toBeTruthy();
  });

  it('pre-populates existing roles and reports incomplete roles', async () => {
    const { onReady } = setup();
    await screen.findByText('2 of 3 roles complete');
    const clinops = row('dbx-env-gpd-user-odx-clinops');
    expect(within(clinops).getByRole<HTMLInputElement>('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }).checked).toBe(true);
    expect(within(clinops).getByText('Anne Croteau')).toBeTruthy();
    expect(within(row('dbx-env-gpd-user-odx-clinops-cdm')).getByRole<HTMLInputElement>('checkbox', { name: 'Sreeram.Koneru@pfizer.com' }).checked).toBe(true);
    const newRow = row(NEW_ROLE);
    expect(within(newRow).getByText('New')).toBeTruthy();
    expect(within(newRow).getByText('At least one Technical/System Owner is required')).toBeTruthy();
    expect(within(newRow).getByText('At least one Domain/Business Owner is required')).toBeTruthy();
    expect(within(newRow).getByText('Incomplete')).toBeTruthy();
    expect(within(clinops).getByRole('img', { name: 'Scope: odx.cdm' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /1 of 3 roles are missing required approvers/ })).toBeTruthy();
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it('offers only two non-searchable technical owners and searches business owners with duplicate prevention', async () => {
    const service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const search = vi.spyOn(service, 'searchDirectoryUsers');
    const { onReady, latest } = setup({ service });
    await screen.findByText('2 of 3 roles complete');
    const newRow = row(NEW_ROLE);
    expect(within(newRow).getAllByRole('checkbox').map((input) => input.closest('label')?.textContent))
      .toEqual(['Jisun.Yoon@Pfizer.com', 'Sreeram.Koneru@pfizer.com']);
    expect(within(newRow).queryByRole('combobox', { name: /Technical/ })).toBeNull();
    const technical = within(newRow).getByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' });
    technical.focus();
    await userEvent.keyboard(' ');
    await userEvent.click(within(newRow).getByRole('checkbox', { name: 'Sreeram.Koneru@pfizer.com' }));
    expect(latest().approvers['role-veevaquality'].technical).toHaveLength(2);
    await userEvent.click(technical);
    await userEvent.click(technical);
    expect(latest().approvers['role-veevaquality'].technical).toHaveLength(2);
    expect(search).not.toHaveBeenCalled();
    const business = within(newRow).getByRole('combobox', { name: /Domain\/Business Owner/ });
    await addViaKeyboard(business, 'Rafael');
    await userEvent.type(business, 'Rafael');
    const option = await screen.findByRole('option', { name: /Rafael Moreno \(Already added\)/ }, { timeout: 2000 });
    expect(option.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Enter}{Escape}{Escape}');
    expect(latest().approvers['role-veevaquality'].business).toHaveLength(1);
    expect(await screen.findByText('3 of 3 roles complete')).toBeTruthy();
    expect(screen.queryByText(/missing required approvers/)).toBeNull();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  });

  it('uses the fetched technical-owner allowlist for choices and validation', async () => {
    const base = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const technicalOwners = [
      { id: 'api-1', displayName: 'Technical Owner One', email: 'one@example.com' },
      { id: 'api-2', displayName: 'Technical Owner Two', email: 'two@example.com' },
      { id: 'api-3', displayName: 'Technical Owner Three', email: 'three@example.com' },
    ];
    const service = { ...base, listTechnicalApprovers: async () => technicalOwners };
    const { latest } = setup({ service, roleList: [roles[2]] });
    await screen.findByText('0 of 1 roles complete');
    const newRow = row(NEW_ROLE);
    expect(within(newRow).getAllByRole('checkbox').map((input) => input.getAttribute('aria-label') ?? input.closest('label')?.textContent))
      .toEqual(['one@example.com', 'two@example.com', 'three@example.com']);
    await userEvent.click(within(newRow).getByRole('checkbox', { name: /three@example\.com/ }));
    expect(latest().approvers['role-veevaquality'].technical).toEqual([technicalOwners[2]]);
  });

  it('unchecks technical owners with the keyboard and shows the inline required message', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    const remove = within(row('dbx-env-gpd-user-odx-clinops')).getByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' });
    remove.focus();
    await userEvent.keyboard(' ');
    expect(latest().approvers['role-clinops'].technical).toEqual([]);
    expect(within(row('dbx-env-gpd-user-odx-clinops')).getByText('At least one Technical/System Owner is required')).toBeTruthy();
    expect(screen.getByText('1 of 3 roles complete')).toBeTruthy();
  });

  it('shows empty-search and directory error states in the typeahead', async () => {
    let fail = false;
    const service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => fail });
    setup({ service });
    await screen.findByText('2 of 3 roles complete');
    const input = within(row(NEW_ROLE)).getByRole('combobox');
    await userEvent.type(input, 'q');
    expect(screen.getByText('Type at least 2 characters to search.')).toBeTruthy();
    await userEvent.type(input, 'zzz');
    expect(await screen.findByText('No users found', {}, { timeout: 2000 })).toBeTruthy();
    fail = true;
    await userEvent.clear(input);
    await userEvent.type(input, 'Ross');
    expect(await screen.findByText(/simulated mock error/, {}, { timeout: 2000 })).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('option', { name: /Laura Ross/ }, { timeout: 2000 })).toBeTruthy();
  });

  it('filters roles by search text and chips', async () => {
    setup();
    await screen.findByText('2 of 3 roles complete');
    await userEvent.click(screen.getByRole('button', { name: 'Missing approvers' }));
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Existing' }));
    expect(screen.getAllByRole('rowheader')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByPlaceholderText('Search roles by name'), 'veeva');
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
  });

  it('applies approvers to all roles, confirming before replacing and showing a toast', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    await userEvent.click(screen.getByRole('button', { name: 'Apply to All Roles' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('combobox', { name: /Technical/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Replace existing' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/remove existing approvers from 1 role/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm replace' }));
    expect(await screen.findByText('Approvers applied to 2 roles')).toBeTruthy();
    expect(Object.values(latest().approvers).map((entry) => entry.technical.map((user) => user.displayName)))
      .toEqual([['Jisun Yoon'], ['Jisun Yoon'], ['Jisun Yoon']]);
    expect(latest().approvers['role-clinops'].business.map((user) => user.displayName)).toEqual(['Anne Croteau']);
  });

  it('copies only technical owners to all roles that are missing them', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Technical/System Owners of dbx-env-gpd-user-odx-clinops to all roles' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Only roles missing approvers' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Approvers applied to 1 role')).toBeTruthy();
    expect(latest().approvers['role-veevaquality'].technical.map((user) => user.displayName)).toEqual(['Jisun Yoon']);
    expect(latest().approvers['role-clinops-cdm'].technical.map((user) => user.displayName)).toEqual(['Sreeram Koneru']);
    expect(latest().approvers['role-veevaquality'].business).toEqual([]);
    expect(latest().approvers['role-clinops-cdm'].business.map((user) => user.displayName)).toEqual(['Kevin Traylor']);
  });

  it('warns when the same person is both technical and business owner', async () => {
    setup();
    await screen.findByText('2 of 3 roles complete');
    const business = within(row('dbx-env-gpd-user-odx-clinops')).getByRole('combobox');
    await addViaKeyboard(business, 'Jisun');
    expect(screen.getByText(/Jisun Yoon is assigned as both/)).toBeTruthy();
    expect(within(row('dbx-env-gpd-user-odx-clinops')).getByText('Complete')).toBeTruthy();
  });

  it('replaces technical owners across filtered-out roles without changing business owners', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    const before = structuredClone(latest().approvers);
    await userEvent.click(screen.getByRole('button', { name: 'Existing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy Technical/System Owners of dbx-env-gpd-user-odx-clinops to all roles' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Replace existing' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm replace' }));
    expect(await screen.findByText('Approvers applied to 2 roles')).toBeTruthy();
    expect(latest().approvers['role-veevaquality']).toEqual({ technical: [TECHNICAL_OWNERS[0]], business: [] });
    for (const id of ['role-clinops', 'role-clinops-cdm']) {
      expect(latest().approvers[id].business).toEqual(before[id].business);
      expect(latest().approvers[id].technical).toEqual([TECHNICAL_OWNERS[0]]);
    }
  });

  it('copies business owners independently without changing technical owners', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    const before = structuredClone(latest().approvers);
    await userEvent.click(screen.getByRole('button', { name: 'Copy Domain/Business Owners of dbx-env-gpd-user-odx-clinops to all roles' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' })).toBeNull();
    expect(within(dialog).getByRole('combobox', { name: /Domain\/Business/ })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Replace existing' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm replace' }));
    expect(await screen.findByText('Approvers applied to 2 roles')).toBeTruthy();
    for (const id of ['role-clinops', 'role-clinops-cdm']) {
      expect(latest().approvers[id].technical).toEqual(before[id].technical);
      expect(latest().approvers[id].business).toEqual(before['role-clinops'].business);
    }
    expect(latest().approvers['role-veevaquality'].technical).toEqual([]);
  });

  it('prefills API business owners, allows editing, and matches technical choices independently of API IDs', async () => {
    const owner = { id: 'api-owner', displayName: 'API Business Owner', email: 'business@example.com' };
    const replacement = { id: 'replacement', displayName: 'Replacement Owner', email: 'replacement@example.com' };
    const apiTechnical = { ...TECHNICAL_OWNERS[0], id: 'api-technical', email: TECHNICAL_OWNERS[0].email.toUpperCase() };
    const getRoleApprovers = vi.fn<NonNullable<ApproverService['getRoleApprovers']>>().mockResolvedValue({
      'role-clinops': { technical: [apiTechnical], business: [owner] },
      'role-clinops-cdm': { technical: [TECHNICAL_OWNERS[1]], business: [owner] },
    });
    const { latest } = setup({
      service: { ...createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false, users: [replacement] }), getRoleApprovers },
    });
    await screen.findByText('2 of 3 roles complete');
    expect(getRoleApprovers).toHaveBeenCalledWith({
      blueprintId: 'draft-1',
      roles: roles.filter((role) => role.status === 'EXISTING').map((role) => ({ roleId: role.id, roleName: role.roleName })),
    });
    const existing = row('dbx-env-gpd-user-odx-clinops');
    const choice = within(existing).getByRole<HTMLInputElement>('checkbox', { name: 'Jisun.Yoon@Pfizer.com' });
    expect(choice.checked).toBe(true);
    await userEvent.click(choice);
    expect(latest().approvers['role-clinops'].technical).toEqual([]);
    await userEvent.click(choice);
    await userEvent.click(within(existing).getByRole('button', { name: /Remove API Business Owner/ }));
    await addViaKeyboard(within(existing).getByRole('combobox'), 'Replacement');
    expect(latest().approvers['role-clinops'].business).toEqual([replacement]);
    expect(getRoleApprovers).toHaveBeenCalledOnce();
    expect(latest().approvers['role-veevaquality']).toBeUndefined();
  });

  it('removes obsolete draft technical owners instead of rendering chips above the two choices', async () => {
    const unsupported = { id: 'old-owner', displayName: 'Previous Technical Owner', email: 'old@example.com' };
    const business = { id: 'business', displayName: 'Business Owner', email: 'business@example.com' };
    const { onReady, latest } = setup({
      roleList: [roles[0]],
      initial: {
        approvers: { 'role-clinops': { technical: [unsupported], business: [business] } },
        prefilledRoleIds: ['role-clinops'],
      },
    });
    await screen.findByText('At least one Technical/System Owner is required');
    expect(screen.queryByText('Previous Technical Owner')).toBeNull();
    expect(screen.queryByRole('list', { name: /Technical\/System Owners/ })).toBeNull();
    expect(latest().approvers['role-clinops']).toEqual({ technical: [], business: [business] });
    expect(onReady).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }));
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  });

  it('shows an error with retry when current approvers cannot be loaded', async () => {
    const base = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const getRoleApprovers = vi.fn<NonNullable<ApproverService['getRoleApprovers']>>()
      .mockRejectedValueOnce(new Error('Directory unavailable'))
      .mockImplementation((request) => base.getRoleApprovers(request));
    setup({ service: { ...base, getRoleApprovers } });
    expect(await screen.findByText('Directory unavailable')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('2 of 3 roles complete')).toBeTruthy();
  });

  it('does not refetch approvers for roles that were already prefilled', async () => {
    const base = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const getRoleApprovers = vi.fn(base.getRoleApprovers);
    setup({
      service: { ...base, getRoleApprovers },
      initial: { approvers: {}, prefilledRoleIds: ['role-clinops', 'role-clinops-cdm'] },
    });
    expect(await screen.findByText('0 of 3 roles complete')).toBeTruthy();
    expect(getRoleApprovers).not.toHaveBeenCalled();
  });

  it('shows an empty state linking back to Permissions when there are no roles', async () => {
    const { onBack } = setup({ roleList: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Back to Permissions' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('scrolls to an incomplete role from the validation banner', async () => {
    setup();
    await screen.findByText('2 of 3 roles complete');
    await userEvent.click(screen.getByRole('button', { name: 'Missing approvers' }));
    await userEvent.type(screen.getByPlaceholderText('Search roles by name'), 'nothing-matches');
    await act(async () => {
      within(screen.getByRole('region', { name: /missing required approvers/ })).getByRole('button', { name: NEW_ROLE }).click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(document.activeElement).toBe(within(row(NEW_ROLE)).getAllByRole('checkbox')[0]);
  });
});
