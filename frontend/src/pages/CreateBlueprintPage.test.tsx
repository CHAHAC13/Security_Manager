import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CreateBlueprintPage } from './CreateBlueprintPage';
import { HomePage } from './HomePage';
import { createMockPermissionsService, PermissionsValidationError, type PermissionsService } from '@/services/permissionsService';
import { createHttpApproverService, type ApproverService } from '@/services/approverService';
import { createMockApproverService } from '@/test/mockApproverService';
import type { BlueprintFormData, BlueprintObjectsData } from '@/types/blueprint';
import { objects, objectsData } from '@/test/permissionFixtures';
import { createRole } from '@/lib/permissions';
import { createDeploymentData, localScheduleToUtc } from '@/lib/deployment';

vi.mock('@/components/blueprint/BlueprintObjectsForm', () => ({
  BlueprintObjectsForm: ({ onChange }: { onChange: (data: BlueprintObjectsData) => void }) => (
    <div>
      <button onClick={() => onChange(objectsData)}>Select test objects</button>
      <button onClick={() => onChange({ ...objectsData, selectedObjectIds: [], selectedObjects: [] })}>Remove test object</button>
    </div>
  ),
}));

async function enterPermissions(overrides: Partial<PermissionsService> = {}, approverService?: ApproverService) {
  const service: PermissionsService = {
    ...createMockPermissionsService(),
    getSelectedObjects: async (data) => data.selectedObjectIds.length ? objects : objects.slice(0, 2),
    getExistingRolesForObjects: async () => [],
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={['/blueprint-editor/create']}>
      <Routes>
        <Route path="/blueprint-editor/create" element={<CreateBlueprintPage service={service} approverService={approverService} />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/Blueprint Name/), 'Review test blueprint');
  await userEvent.type(screen.getByLabelText(/Description/), 'Test blueprint description');
  await userEvent.type(screen.getByLabelText(/Business Justification/), 'Required for the integration test');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Select test objects' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('button', { name: '+ Create Role Assignment' });
  return service;
}

async function addRole() {
  await userEvent.click(screen.getByRole('button', { name: '+ Create Role Assignment' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
  const scopes = screen.getAllByRole('combobox', { name: 'Role scope *' });
  await userEvent.selectOptions(scopes[scopes.length - 1], 'c1');
  const types = screen.getAllByRole('combobox', { name: 'Role Type *' });
  await userEvent.selectOptions(types[types.length - 1], 'user');
}

describe('wizard permissions integration', () => {
  it('does not save or submit through the unavailable approver API', async () => {
    const baseline = {
      ...createRole('existing-group', objects, 'dev', 'user'),
      status: 'EXISTING' as const, mode: 'UPDATE_EXISTING' as const, roleName: 'existing-group',
    };
    baseline.objectPermissions = baseline.objectPermissions.map((permission) => ({
      ...permission, originalPermissions: permission.objectId === 't1' ? ['SELECT'] : [],
      permissions: permission.objectId === 't1' ? ['SELECT'] : [],
    }));
    const save = vi.fn<PermissionsService['savePermissionsDraft']>().mockResolvedValue(undefined);
    await enterPermissions({ getExistingRolesForObjects: async () => [baseline], savePermissionsDraft: save }, createHttpApproverService());
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/No changes require approval/);
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Saving approver assignments is unavailable');
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Next: Deployment' }));
    await screen.findByRole('heading', { name: 'Deployment Strategy' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Review & Submit Blueprint' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit for Approval' }).disabled).toBe(true);
    expect(screen.getByText(/Submitting approver assignments is unavailable/)).toBeTruthy();
  }, 15000);

  it('validates Deployment, preserves draft state, supports review edits, and confirms submission', async () => {
    const baseline = {
      ...createRole('existing-group', objects, 'dev', 'user'),
      status: 'EXISTING' as const, mode: 'UPDATE_EXISTING' as const, roleName: 'existing-group',
    };
    baseline.objectPermissions = baseline.objectPermissions.map((permission) => ({
      ...permission,
      originalPermissions: permission.objectId === 't1' ? ['SELECT'] : [],
      permissions: permission.objectId === 't1' ? ['SELECT'] : [],
    }));
    const save = vi.fn<PermissionsService['savePermissionsDraft']>().mockResolvedValue(undefined);
    await enterPermissions({
      getExistingRolesForObjects: async () => [baseline], savePermissionsDraft: save,
    }, createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/No changes require approval/);
    await userEvent.click(screen.getByRole('button', { name: 'Next: Deployment' }));
    expect(await screen.findByRole('heading', { name: 'Deployment Strategy' })).toBeTruthy();
    expect(screen.getByText('Step 5 of 6: Deployment. Set the deployment schedule for Dev, Stg and Prd environments.')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Stg Deployment Strategy'), 'scheduled');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Select a deployment date and time.')).toBeTruthy();
    expect(screen.queryByText('Review & Submit — coming soon')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].deployment.environments.stg).toEqual({ strategy: 'scheduled', scheduledDateTime: '', scheduledAt: null });
    expect(save.mock.calls[0][0].deployment.timeZone).toBe(createDeploymentData().timeZone);
    fireEvent.change(screen.getByLabelText('Stg Date / Time'), { target: { value: '2030-07-12T12:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/Prd cannot deploy before Stg/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Prd Deployment Strategy'), 'scheduled');
    fireEvent.change(screen.getByLabelText('Prd Date / Time'), { target: { value: '2030-07-12T13:00' } });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notify Requestor on Deployment Success/Failure' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notify Approvers on Deployment Success/Failure' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText(/No changes require approval/);
    await userEvent.click(screen.getByRole('button', { name: 'Next: Deployment' }));
    await screen.findByRole('heading', { name: 'Deployment Strategy' });
    expect(screen.getByLabelText<HTMLInputElement>('Stg Date / Time').value).toBe('2030-07-12T12:00');
    expect(screen.getByLabelText<HTMLInputElement>('Prd Date / Time').value).toBe('2030-07-12T13:00');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Notify Requestor/ }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Notify Approvers/ }).checked).toBe(true);
    save.mockRejectedValueOnce(new Error('Draft unavailable'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Draft unavailable')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Prd Date / Time').value).toBe('2030-07-12T13:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    const saved = save.mock.calls[2][0].deployment;
    expect(saved).toEqual({
      ...createDeploymentData(), notifyRequestor: true, notifyApprovers: true,
      environments: {
        dev: { strategy: 'immediate', scheduledDateTime: '', scheduledAt: null },
        stg: { strategy: 'scheduled', scheduledDateTime: '2030-07-12T12:00', scheduledAt: localScheduleToUtc('2030-07-12T12:00') },
        prd: { strategy: 'scheduled', scheduledDateTime: '2030-07-12T13:00', scheduledAt: localScheduleToUtc('2030-07-12T13:00') },
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Review & Submit Blueprint' })).toBeTruthy();
    expect(screen.getByText('Blueprint is ready for submission.')).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'Deployment Strategy' });
    expect(within(summary).getAllByText('Immediate')).toHaveLength(1);
    expect(within(summary).getAllByText('Scheduled')).toHaveLength(2);
    expect(within(summary).getAllByText(/2030/)).toHaveLength(2);
    expect(within(summary).getByText(/Notify Requestor on Deployment Success\/Failure:/)).toBeTruthy();
    expect(within(summary).getByText(/Notify Approvers on Deployment Success\/Failure:/)).toBeTruthy();
    expect(screen.queryByText('existing-group')).toBeNull();
    expect(screen.getByText('Roles: 0')).toBeTruthy();
    expect(screen.getByText('Permission Assignments: 0')).toBeTruthy();
    expect(screen.getByText('No new or changed roles require approvers.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Blueprint Details' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Object Scope' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Blueprint Details' }));
    const nameInput = screen.getByLabelText(/Blueprint Name/);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated review test blueprint');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/No changes require approval/);
    await userEvent.click(screen.getByRole('button', { name: 'Next: Deployment' }));
    await screen.findByRole('heading', { name: 'Deployment Strategy' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Review & Submit Blueprint' })).toBeTruthy();
    expect(screen.getByText('Updated review test blueprint')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    expect(save.mock.calls[3][0].deployment).toEqual(saved);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Deployment Strategy' });
    await userEvent.selectOptions(screen.getByLabelText('Prd Deployment Strategy'), 'immediate');
    expect(screen.getByLabelText<HTMLInputElement>('Prd Date / Time').value).toBe('');
    await userEvent.selectOptions(screen.getByLabelText('Stg Deployment Strategy'), 'immediate');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Review & Submit Blueprint' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Deployment Strategy' })).getAllByText('Immediate')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Submit for Approval' }));
    expect(await screen.findByRole('dialog', { name: 'Submit Blueprint for Approval?' })).toBeTruthy();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Submit Blueprint for Approval?' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Submit Blueprint for Approval?' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Submit for Approval' }));
    const confirmation = screen.getByRole('dialog', { name: 'Submit Blueprint for Approval?' });
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Submit for Approval' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Submit Blueprint for Approval?' })).toBeNull());
    expect(await screen.findByText('Blueprint submitted successfully. Status: Pending Approval.')).toBeTruthy();
  }, 15000);

  it('lets unchanged roles continue to Deployment and removes approval data when edits are reverted', async () => {
    const baseline = {
      ...createRole('existing-group', objects, 'dev', 'user'),
      status: 'EXISTING' as const, mode: 'UPDATE_EXISTING' as const,
      roleName: 'existing-group',
    };
    baseline.objectPermissions = baseline.objectPermissions.map((object) => ({
      ...object, originalPermissions: object.objectId === 't1' ? ['SELECT'] : [],
      permissions: object.objectId === 't1' ? ['SELECT'] : [],
    }));
    const approvers = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const lookup = vi.spyOn(approvers, 'getRoleApprovers');
    const saveApprovers = vi.spyOn(approvers, 'saveApproversDraft');
    const save = vi.fn().mockResolvedValue(undefined);
    await enterPermissions({ getExistingRolesForObjects: async () => [baseline], savePermissionsDraft: save }, approvers);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/No changes require approval/);
    expect(lookup).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Next: Deployment' }));
    expect(await screen.findByRole('heading', { name: 'Deployment Strategy' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText(/No changes require approval/);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await userEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('1 of 1 roles complete');
    expect(lookup).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await userEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledTimes(2));
    const payload = save.mock.calls[1][0] as BlueprintFormData;
    expect(payload.permissions.roleAssignments).toHaveLength(1);
    expect(payload.approvers).toEqual({ approvers: {}, prefilledRoleIds: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/No changes require approval/);
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledTimes(3));
    expect(saveApprovers.mock.calls[1][1]).toEqual({});
    expect(saveApprovers.mock.calls[2][1]).toEqual({});
    expect(lookup).toHaveBeenCalledOnce();
  }, 15000);

  it('blocks invalid Next and advances to Approvers only after valid service validation', async () => {
    const validate = vi.fn().mockResolvedValue({ valid: true });
    await enterPermissions({ validateRoleName: validate });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Create at least one role assignment.')).toBeTruthy();
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Assign Approvers' })).toBeTruthy();
    expect(validate).toHaveBeenCalledOnce();
  }, 15000);

  it('saves incomplete drafts, sends complete wizard state and shows saving/saved states', async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await enterPermissions({ savePermissionsDraft: save });
    await addRole();
    fireEvent.change(screen.getByLabelText('Role Name *'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving...' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Back' }).disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Role Name *').matches(':disabled')).toBe(true);
    const payload = save.mock.calls[0][0] as BlueprintFormData;
    expect(payload.setup.environment).toBe('dev');
    expect(payload.objects.selectedObjectIds).toEqual(['table']);
    expect(payload.permissions.roleAssignments[0].roleName).toBe('');
    await act(async () => finish());
    expect(await screen.findByText(/Draft saved through the permissions service/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save Draft' }).disabled).toBe(false);
  });

  it('shows save errors and mapped field errors and supports retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Draft service unavailable')).mockResolvedValue(undefined);
    await enterPermissions({ savePermissionsDraft: save });
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Draft service unavailable')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText(/Draft saved through/)).toBeTruthy();
  });

  it('preserves edits on Back and reconciles removed objects before the next save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await enterPermissions({ savePermissionsDraft: save });
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: USE CATALOG' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove test object' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await userEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    expect(screen.queryByText('study')).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'odx: USE CATALOG' }).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const payload = save.mock.calls[0][0] as BlueprintFormData;
    expect(payload.permissions.roleAssignments[0].objectPermissions.map((object) => object.objectId)).toEqual(['c1', 's1']);
  });

  it('keeps the default dev environment for role names and validation without a Setup selector', async () => {
    const service = createMockPermissionsService();
    const validate = vi.fn().mockResolvedValue({ valid: true });
    render(<MemoryRouter><CreateBlueprintPage service={{
      ...service, getSelectedObjects: async () => objects,
      getExistingRolesForObjects: async () => [], validateRoleName: validate,
    }} /></MemoryRouter>);
    expect(screen.queryByLabelText('Environment')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select test objects' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await addRole();
    expect(screen.getByLabelText<HTMLInputElement>('Role Name *').value).toBe('dbx-dev-gpd-user-odx');
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(validate).toHaveBeenCalledWith('dbx-dev-gpd-user-odx', 'dev');
  });

  it('reconciles scope when saving directly from Objects without revisiting Permissions', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await enterPermissions({ savePermissionsDraft: save });
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove test object' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const payload = save.mock.calls[0][0] as BlueprintFormData;
    expect(payload.permissions.roleAssignments[0].objectPermissions.map((object) => object.objectId)).toEqual(['c1', 's1']);
  });

  it('gates Approvers Next on complete roles, saves approver drafts and keeps approvers across Back/Next', async () => {
    const approvers = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const saveApprovers = vi.spyOn(approvers, 'saveApproversDraft');
    const savePermissions = vi.fn().mockResolvedValue(undefined);
    await enterPermissions({ validateRoleName: async () => ({ valid: true }), savePermissionsDraft: savePermissions }, approvers);
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('0 of 1 roles complete');
    const next = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Next: Deployment' });
    expect(next().disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Draft saved through the permissions and approver services/)).toBeTruthy();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }));
    await userEvent.type(screen.getByRole('combobox'), 'Grace');
    await screen.findByRole('option', {}, { timeout: 2000 });
    await userEvent.keyboard('{Enter}');
    await screen.findByText('1 of 1 roles complete');
    await waitFor(() => expect(next().disabled).toBe(false));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('1 of 1 roles complete')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }).checked).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledTimes(2));
    const [, saved] = saveApprovers.mock.calls[1];
    const roleId = Object.keys(saved)[0];
    expect(saved[roleId].technical.map((user) => user.email)).toEqual(['Jisun.Yoon@Pfizer.com']);
    expect((savePermissions.mock.calls[1][0] as BlueprintFormData).approvers.approvers[roleId].business[0].displayName).toBe('Grace Okafor');

    await waitFor(() => expect(next().disabled).toBe(false));
    await userEvent.click(next());
    expect(await screen.findByRole('heading', { name: 'Deployment Strategy' })).toBeTruthy();
    expect(screen.getByText(/Step 5 of 6/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('1 of 1 roles complete');
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }).checked).toBe(true);
    await userEvent.click(next());
    await screen.findByRole('heading', { name: 'Deployment Strategy' });
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledTimes(3));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Review & Submit Blueprint' })).toBeTruthy();
    expect(screen.getByText(/Step 6 of 6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit for Approval' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Deployment Strategy' })).toBeTruthy();
  }, 15000);

  it('renders server save errors next to role fields', async () => {
    await enterPermissions({ savePermissionsDraft: async (payload) => {
      throw new PermissionsValidationError('Server rejected draft', {
        roles: { [payload.permissions.roleAssignments[0].id]: { roleName: 'Server field error' } },
      });
    } });
    await addRole();
    await userEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Server field error')).toBeTruthy();
    expect(screen.getByText('Server rejected draft')).toBeTruthy();
  });
});
