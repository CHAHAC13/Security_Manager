import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintApproversForm } from './BlueprintApproversForm';
import { createMockApproverService, type ApproverService } from '@/services/approverService';
import { createMockPermissionsService } from '@/services/permissionsService';
import { MOCK_APPROVER_SAMPLE_ROLES } from '@/data/approverData';
import { objects, objectsData } from '@/test/permissionFixtures';
import { INITIAL_APPROVERS_DATA } from '@/types/blueprint';
import type { BlueprintApproversData, RoleAssignment } from '@/types/blueprint';

const roles: RoleAssignment[] = MOCK_APPROVER_SAMPLE_ROLES.map((role, index) => ({
  id: role.id, roleName: role.roleName, status: role.status,
  mode: role.status === 'NEW' ? 'CREATE_NEW' : 'UPDATE_EXISTING',
  level: 'SCHEMA', scopeObjectId: index === 2 ? 't1' : 's1', roleTypeCode: 'user', roleNameManuallyEdited: false,
  objectPermissions: [],
  requestManager: { enabled: false, formType: '', displayName: '', originalValues: { enabled: false, formType: '', displayName: '' } },
}));

const NEW_ROLE = 'dbx-prd-gpd-user-odx-clinops-veevaquality';

function setup({ service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false }), roleList = roles, initial = INITIAL_APPROVERS_DATA } = {}) {
  const onReady = vi.fn();
  const onBack = vi.fn();
  let latest: BlueprintApproversData = initial;
  const permissions = { ...createMockPermissionsService(), getSelectedObjects: async () => objects };
  function Harness() {
    const [data, setData] = useState(initial);
    return <BlueprintApproversForm roles={roleList} objectsData={objectsData} data={data} blueprintId="draft-1"
      onChange={(value) => { latest = value; setData(value); }} onBack={onBack} onReadyChange={onReady}
      service={service} permissions={permissions} />;
  }
  render(<Harness />);
  return { onReady, onBack, service, latest: () => latest };
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
  it('pre-populates existing roles and reports incomplete roles', async () => {
    const { onReady } = setup();
    await screen.findByText('2 of 3 roles complete');
    const clinops = row('dbx-env-gpd-user-odx-clinops');
    expect(within(clinops).getByText('Sanjay Subramanian')).toBeTruthy();
    expect(within(clinops).getByText('Anne Croteau')).toBeTruthy();
    expect(within(row('dbx-env-gpd-user-odx-clinops-cdm')).getByText('Laura Ross')).toBeTruthy();
    const newRow = row(NEW_ROLE);
    expect(within(newRow).getByText('New')).toBeTruthy();
    expect(within(newRow).getByText('At least one Technical/System Owner is required')).toBeTruthy();
    expect(within(newRow).getByText('At least one Domain/Business Owner is required')).toBeTruthy();
    expect(within(newRow).getByText('Incomplete')).toBeTruthy();
    expect(within(clinops).getByRole('img', { name: 'Scope: odx.cdm' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /1 of 3 roles are missing required approvers/ })).toBeTruthy();
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it('adds approvers with the keyboard, prevents duplicates and becomes ready when complete', async () => {
    const { onReady, latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    const newRow = row(NEW_ROLE);
    const [technical, business] = within(newRow).getAllByRole('combobox');
    await addViaKeyboard(technical, 'Hannah');
    expect(within(newRow).getByText('Hannah Becker')).toBeTruthy();
    await userEvent.type(technical, 'Hannah');
    const option = await screen.findByRole('option', { name: /Hannah Becker \(Already added\)/ }, { timeout: 2000 });
    expect(option.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Enter}{Escape}{Escape}');
    expect(latest().approvers['role-veevaquality'].technical).toHaveLength(1);
    await addViaKeyboard(business, 'Rafael');
    expect(await screen.findByText('3 of 3 roles complete')).toBeTruthy();
    expect(screen.queryByText(/missing required approvers/)).toBeNull();
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  });

  it('removes chips with the keyboard and shows the inline required message', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    const remove = screen.getByRole('button', { name: 'Remove Sanjay Subramanian as Technical/System Owner for dbx-env-gpd-user-odx-clinops' });
    remove.focus();
    await userEvent.keyboard('{Delete}');
    expect(latest().approvers['role-clinops'].technical).toEqual([]);
    expect(within(row('dbx-env-gpd-user-odx-clinops')).getByText('At least one Technical/System Owner is required')).toBeTruthy();
    expect(screen.getByText('1 of 3 roles complete')).toBeTruthy();
  });

  it('shows empty-search and directory error states in the typeahead', async () => {
    let fail = false;
    const service = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => fail });
    setup({ service });
    await screen.findByText('2 of 3 roles complete');
    const [input] = within(row(NEW_ROLE)).getAllByRole('combobox');
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
    const [technical] = within(dialog).getAllByRole('combobox');
    await addViaKeyboard(technical, 'Omar');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Replace existing' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/remove existing approvers from 2 roles/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm replace' }));
    expect(await screen.findByText('Approvers applied to 3 roles')).toBeTruthy();
    expect(Object.values(latest().approvers).map((entry) => entry.technical.map((user) => user.displayName)))
      .toEqual([['Omar Haddad'], ['Omar Haddad'], ['Omar Haddad']]);
    expect(latest().approvers['role-clinops'].business.map((user) => user.displayName)).toEqual(['Anne Croteau']);
  });

  it('copies a row to all roles that are missing approvers', async () => {
    const { latest } = setup();
    await screen.findByText('2 of 3 roles complete');
    await userEvent.click(screen.getByRole('button', { name: 'Copy approvers of dbx-env-gpd-user-odx-clinops to all roles' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Only roles missing approvers' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Approvers applied to 1 role')).toBeTruthy();
    expect(latest().approvers['role-veevaquality'].technical.map((user) => user.displayName)).toEqual(['Sanjay Subramanian']);
    expect(latest().approvers['role-clinops-cdm'].technical.map((user) => user.displayName)).toEqual(['Laura Ross']);
  });

  it('warns when the same person is both technical and business owner', async () => {
    setup();
    await screen.findByText('2 of 3 roles complete');
    const [, business] = within(row('dbx-env-gpd-user-odx-clinops')).getAllByRole('combobox');
    await addViaKeyboard(business, 'Sanjay');
    expect(screen.getByText(/Sanjay Subramanian is assigned as both/)).toBeTruthy();
    expect(within(row('dbx-env-gpd-user-odx-clinops')).getByText('Complete')).toBeTruthy();
  });

  it('shows an error with retry when current approvers cannot be loaded', async () => {
    const base = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const getRoleApprovers = vi.fn<ApproverService['getRoleApprovers']>()
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
    expect(document.activeElement).toBe(within(row(NEW_ROLE)).getAllByRole('combobox')[0]);
  });
});
