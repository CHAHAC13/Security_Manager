import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBlueprintPage } from './CreateBlueprintPage';
import { objectDiscoveryService } from '@/services/objectDiscoveryService';
import { createMockPermissionsService } from '@/services/permissionsService';
import { createMockApproverService, type ApproverService } from '@/services/approverService';

vi.mock('@/services/objectDiscoveryService', () => ({
  objectDiscoveryService: {
    catalogNameExists: vi.fn(),
    schemaNameExists: vi.fn(),
    objectNameExists: vi.fn(),
    getCatalogs: vi.fn(),
    getSchemas: vi.fn(),
    getObjects: vi.fn(),
  },
}));

const page = <T,>(items: T[]) => ({ items, nextCursor: null, totalItems: items.length, totalPages: items.length ? 1 : 0 });
const service = { ...createMockPermissionsService(), getExistingRolesForObjects: async () => [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(objectDiscoveryService.catalogNameExists).mockResolvedValue(false);
  vi.mocked(objectDiscoveryService.schemaNameExists).mockResolvedValue(false);
  vi.mocked(objectDiscoveryService.objectNameExists).mockResolvedValue(false);
  vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue(page([{ id: 'existing', name: 'existing' }]));
  vi.mocked(objectDiscoveryService.getSchemas).mockResolvedValue(page([{ id: 'existing_schema', name: 'existing_schema', catalogId: 'existing' }]));
  vi.mocked(objectDiscoveryService.getObjects).mockResolvedValue(page([{ id: 'existing_object', name: 'existing_object', schemaId: 'existing_schema', kind: 'table' }]));
});

async function setup(approverService?: ApproverService) {
  const user = userEvent.setup();
  render(<MemoryRouter><CreateBlueprintPage service={service} approverService={approverService} /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Next' }));
  return user;
}

describe('removing proposed resources', () => {
  it('disables the existing catalog picker during and after creation and removes the catalog and its children', async () => {
    const user = await setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const picker = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Catalog selection: Select a catalog' });
    expect(picker().disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    expect(picker().disabled).toBe(true);
    await user.type(screen.getByLabelText('Proposed catalog name'), 'new_cat');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/New proposed catalog:/)).toBeTruthy();
    expect(picker().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'new_cat' })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create New Catalog' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'new_schema');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'new_object');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: /new_object/ });
    await user.click(screen.getByRole('button', { name: 'Remove proposed catalog new_cat' }));
    expect(screen.getByRole('checkbox', { name: /new_object/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove proposed catalog new_cat' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(picker().disabled).toBe(false);
    expect(screen.queryByText(/New proposed catalog:/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'new_schema' })).toBeNull();
    await user.click(picker());
    expect(await screen.findByRole('button', { name: 'existing' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'new_cat' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'existing' }));
    expect(screen.queryByRole('button', { name: /Remove proposed catalog/ })).toBeNull();
  }, 20_000);

  it('removes only proposed objects and schemas, including deselected children, and allows re-adding names', async () => {
    const user = await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const save = vi.spyOn(service, 'savePermissionsDraft');
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(await screen.findByRole('button', { name: 'existing' }));
    await user.click(await screen.findByRole('checkbox', { name: 'existing_schema' }));
    await screen.findByRole('checkbox', { name: /existing_object/ });
    expect(screen.queryByRole('button', { name: /Remove proposed object existing_object/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove proposed schema existing_schema/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'draft_schema');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'draft_object');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: /draft_object/ });
    await user.click(screen.getByRole('button', { name: 'Remove proposed object draft_object' }));
    expect(screen.queryByRole('checkbox', { name: /draft_object/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'draft_object');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('checkbox', { name: /draft_object/ }));
    await user.click(screen.getByRole('button', { name: 'Remove proposed schema draft_schema' }));
    expect(screen.queryByRole('checkbox', { name: 'draft_schema' })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'existing_schema' }).checked).toBe(true);
    expect(await screen.findByRole('checkbox', { name: /existing_object/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const savedObjects = save.mock.calls[0][0].objects;
    expect(savedObjects.proposedSchemas).toEqual([]);
    expect(savedObjects.proposedObjects).toEqual([]);
    expect(savedObjects.selectedSchemaIds).toEqual(['existing_schema']);
    expect(savedObjects.selectedObjectIds).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'draft_schema');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'draft_object');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /draft_object/ })).checked).toBe(true);
  }, 20_000);

  it('clears removed objects and their scoped roles when returning to permissions', async () => {
    const user = await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    await user.type(screen.getByLabelText('Proposed catalog name'), 'perms_cat');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'perms_schema');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'perms_object');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const parentRole = await screen.findByRole('region', { name: 'Role assignment: Untitled role' });
    expect(within(parentRole).getByText('perms_object')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+ Create Role Assignment' }));
    await user.click(screen.getByRole('button', { name: 'Add role assignment' }));
    const roles = screen.getAllByRole('region', { name: 'Role assignment: Untitled role' });
    await user.selectOptions(within(roles[1]).getByLabelText('Level *'), 'OBJECT');
    const objectScope = within(roles[1]).getByLabelText<HTMLSelectElement>('Role scope *');
    await user.selectOptions(objectScope, objectScope.options[1].value);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Remove proposed object perms_object' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    expect(screen.getAllByRole('region', { name: /^Role assignment:/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Expand All' }));
    expect(screen.queryByText('perms_object')).toBeNull();
    expect(screen.getByText('perms_schema')).toBeTruthy();
  }, 20_000);

  it('does not transfer a removed catalog role or its grants to a replacement catalog', async () => {
    const user = await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    await user.type(screen.getByLabelText('Proposed catalog name'), 'old_catalog');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const oldRole = await screen.findByRole('region', { name: 'Role assignment: Untitled role' });
    await user.selectOptions(within(oldRole).getByLabelText('Role Type *'), 'user');
    await user.click(within(oldRole).getByRole('checkbox', { name: 'old_catalog: USE CATALOG' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Remove proposed catalog old_catalog' }));
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    await user.type(screen.getByLabelText('Proposed catalog name'), 'new_catalog');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const newRole = await screen.findByRole('region', { name: 'Role assignment: Untitled role' });
    expect(screen.getAllByRole('region', { name: /^Role assignment:/ })).toHaveLength(1);
    expect(within(newRole).getByLabelText<HTMLInputElement>('Role Name *').value).toBe('');
    expect(within(newRole).getByRole<HTMLInputElement>('checkbox', { name: 'new_catalog: USE CATALOG' }).checked).toBe(false);
    expect(screen.queryByText('old_catalog')).toBeNull();
  }, 20_000);

  it('confirms catalog replacement and removes old roles without transferring them', async () => {
    const user = await setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(await screen.findByRole('button', { name: 'existing' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: '+ Create Role Assignment' }));
    await user.click(screen.getByRole('button', { name: 'Add role assignment' }));
    await user.selectOptions(screen.getByLabelText('Role scope *'), screen.getByLabelText<HTMLSelectElement>('Role scope *').options[1].value);
    await user.selectOptions(screen.getByLabelText('Role Type *'), 'user');
    await user.clear(screen.getByLabelText('Role Name *'));
    await user.type(screen.getByLabelText('Role Name *'), 'dbx-dev-gpd-user-manual');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    await user.type(screen.getByLabelText('Proposed catalog name'), 'replacement');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Catalog selection: existing' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Proposed catalog name').value).toBe('replacement');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await screen.findByText(/New proposed catalog:/);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const role = await screen.findByRole('region', { name: 'Role assignment: Untitled role' });
    expect(screen.getAllByRole('region', { name: /^Role assignment:/ })).toHaveLength(1);
    expect(within(role).getByLabelText<HTMLInputElement>('Role Name *').value).toBe('');
    expect(screen.queryByText('dbx-dev-gpd-user-manual')).toBeNull();
  }, 20_000);

  it('clears saved approvers when switching between existing catalogs and saving from Objects', async () => {
    const approvers = createMockApproverService({ latencyMs: [0, 0], shouldFail: () => false });
    const saveApprovers = vi.spyOn(approvers, 'saveApproversDraft');
    const user = await setup(approvers);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue(page([
      { id: 'existing', name: 'existing' }, { id: 'new-existing', name: 'new-existing' },
    ]));
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(await screen.findByRole('button', { name: 'existing' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: '+ Create Role Assignment' }));
    await user.click(screen.getByRole('button', { name: 'Add role assignment' }));
    const scope = screen.getByLabelText<HTMLSelectElement>('Role scope *');
    await user.selectOptions(scope, scope.options[1].value);
    await user.selectOptions(screen.getByLabelText('Role Type *'), 'user');
    await user.click(screen.getByRole('checkbox', { name: 'existing: USE CATALOG' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('0 of 1 roles complete');
    await user.click(screen.getByRole('checkbox', { name: 'Jisun.Yoon@Pfizer.com' }));
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledOnce());
    expect(Object.keys(saveApprovers.mock.calls[0][1])).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Catalog selection: existing' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search catalogs' }), 'new-existing');
    await user.click(await screen.findByRole('button', { name: 'new-existing' }));
    saveApprovers.mockRejectedValueOnce(new Error('Approver save failed'));
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledTimes(2));
    expect(saveApprovers.mock.calls[1][1]).toEqual({});
    expect(await screen.findByText('Approver save failed')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(saveApprovers).toHaveBeenCalledTimes(3));
    expect(saveApprovers.mock.calls[2][1]).toEqual({});
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    expect(screen.queryByRole('region', { name: /^Role assignment:/ })).toBeNull();
  }, 20_000);
});
