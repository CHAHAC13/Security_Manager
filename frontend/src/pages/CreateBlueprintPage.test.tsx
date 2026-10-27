import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CreateBlueprintPage } from './CreateBlueprintPage';
import { createMockPermissionsService, PermissionsValidationError, type PermissionsService } from '@/services/permissionsService';
import type { BlueprintFormData, BlueprintObjectsData } from '@/types/blueprint';
import { objects, objectsData } from '@/test/permissionFixtures';

vi.mock('@/components/blueprint/BlueprintObjectsForm', () => ({
  BlueprintObjectsForm: ({ onChange }: { onChange: (data: BlueprintObjectsData) => void }) => (
    <div>
      <button onClick={() => onChange(objectsData)}>Select test objects</button>
      <button onClick={() => onChange({ ...objectsData, selectedObjectIds: [], selectedObjects: [] })}>Remove test object</button>
    </div>
  ),
}));

async function enterPermissions(overrides: Partial<PermissionsService> = {}) {
  const service: PermissionsService = {
    ...createMockPermissionsService(),
    getSelectedObjects: async (data) => data.selectedObjectIds.length ? objects : objects.slice(0, 2),
    getExistingRolesForObjects: async () => [],
    ...overrides,
  };
  render(<MemoryRouter><CreateBlueprintPage service={service} /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Select test objects' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('button', { name: '+ Create Role Assignment' });
  return service;
}

async function addRole() {
  await userEvent.click(screen.getByRole('button', { name: '+ Create Role Assignment' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
}

describe('wizard permissions integration', () => {
  it('blocks invalid Next and advances to Approvers only after valid service validation', async () => {
    const validate = vi.fn().mockResolvedValue({ valid: true });
    await enterPermissions({ validateRoleName: validate });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Create at least one role assignment.')).toBeTruthy();
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Approvers — coming soon')).toBeTruthy();
    expect(validate).toHaveBeenCalledOnce();
  });

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
