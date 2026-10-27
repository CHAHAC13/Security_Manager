import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintPermissionsForm, type PermissionsFormHandle } from './BlueprintPermissionsForm';
import { createMockPermissionsService, type PermissionsService } from '@/services/permissionsService';
import { createRole } from '@/lib/permissions';
import { INITIAL_PERMISSIONS_DATA } from '@/types/blueprint';
import { objects, objectsData } from '@/test/permissionFixtures';

function renderEditor(overrides: Partial<PermissionsService> = {}, initial = INITIAL_PERMISSIONS_DATA) {
  const service = {
    ...createMockPermissionsService(),
    getSelectedObjects: async () => structuredClone(objects),
    getExistingRolesForObjects: async () => [],
    ...overrides,
  };
  const ref = createRef<PermissionsFormHandle>();
  const onBack = vi.fn();
  let current = initial;
  function Harness() {
    const [data, setData] = useState(initial);
    current = data;
    return <BlueprintPermissionsForm ref={ref} data={data} objectsData={objectsData} environment="dev"
      onChange={setData} onBack={onBack} onReadyChange={() => {}} service={service} />;
  }
  render(<Harness />);
  return { ref, data: () => current, onBack };
}

async function addRole() {
  await userEvent.click(await screen.findByRole('button', { name: '+ Create Role Assignment' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
}

describe('role assignment cards', () => {
  it('validates a read-only long existing name and permits removing its final grant', async () => {
    const selected = [{ ...objects[0], objectName: 'gpdip_iconfirecrest_share_prod' }];
    const roles = await createMockPermissionsService().getExistingRolesForObjects(selected, 'dev');
    const validateName = vi.fn();
    const editor = renderEditor({
      getSelectedObjects: async () => selected,
      getExistingRolesForObjects: async () => roles,
      validateRoleName: validateName,
    });
    await userEvent.click(await screen.findByRole('button', { name: `Role assignment: ${roles[0].roleName}` }));
    expect(screen.queryByRole('textbox', { name: 'Role Name *' })).toBeNull();
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });
    await userEvent.click(screen.getByRole('checkbox', { name: 'gpdip_iconfirecrest_share_prod: USE CATALOG' }));
    expect(screen.getByText('+0 granted, -1 revoked')).toBeTruthy();
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });
    expect(validateName).not.toHaveBeenCalled();
    expect(editor.data().roleAssignments[0].roleName).toBe(roles[0].roleName);
    expect(editor.data().roleAssignments[0].objectPermissions[0].originalPermissions).toEqual(['USE CATALOG']);
    expect(editor.data().roleAssignments[0].objectPermissions[0].permissions).toEqual([]);
  });
  it('starts existing cards collapsed and newly created cards expanded, with Expand All / Collapse All', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    renderEditor({ getExistingRolesForObjects: async () => roles.slice(0, 1) });
    const existing = await screen.findByRole('button', { name: `Role assignment: ${roles[0].roleName}` });
    expect(existing.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/\+0 granted, -0 revoked/)).toBeNull();
    await addRole();
    const created = screen.getByRole('textbox', { name: 'Role Name *' });
    expect(created).toBeTruthy();
    expect(existing.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    expect(screen.getAllByRole('button', { name: /^Role assignment:/ }).every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Role Name *' })).toBeNull();
  });

  it('shows inline privileges only inside scoped cards, with no table or resource-first section', async () => {
    renderEditor();
    await addRole();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Permissions by resource' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Objects & Permissions' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'cdm: USE SCHEMA' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'study: SELECT' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'lookup: EXECUTE' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'cdm: SELECT' })).toBeNull();
    expect(screen.queryByRole('button', { name: /: permissions for / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create role for cdm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create role for odx' })).toBeNull();
  });

  it('edits exactly one role/object pair and hides the summary again when changes are undone', async () => {
    const editor = renderEditor();
    await addRole();
    await addRole();
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'cdm: CREATE TABLE' })[0]);
    const [first, second] = editor.data().roleAssignments;
    expect(first.objectPermissions.find((item) => item.objectId === 's1')?.permissions).toEqual(['CREATE TABLE']);
    expect(first.objectPermissions.find((item) => item.objectId === 't1')?.permissions).toEqual([]);
    expect(second.objectPermissions.every((item) => item.permissions.length === 0)).toBe(true);
    expect(screen.getByText('Added')).toBeTruthy();
    expect(screen.getByText('+1 granted, -0 revoked')).toBeTruthy();
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'cdm: CREATE TABLE' })[0]);
    expect(screen.queryByText(/granted, .*revoked/)).toBeNull();
  });

  it('keeps Request Manager radios inside the card and clears inactive fields', async () => {
    const editor = renderEditor();
    await addRole();
    fireEvent.change(screen.getByLabelText('Role Name *'), { target: { value: 'dbx-dev-gpd-user-custom' } });
    expect(screen.getByRole('button', { name: 'Role assignment: dbx-dev-gpd-user-custom' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Available in Request Manager' })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'No' }).checked).toBe(true);
    expect(screen.queryByLabelText('Form Type *')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.selectOptions(screen.getByLabelText('Form Type *'), 'regular');
    await userEvent.type(screen.getByLabelText('Display Name *'), 'Users');
    await userEvent.click(screen.getByRole('radio', { name: 'No' }));
    expect(screen.queryByLabelText('Display Name *')).toBeNull();
    expect(editor.data().roleAssignments[0].requestManager).toMatchObject({ enabled: false, formType: '', displayName: '' });
  });

  it('limits schema/object roles to their scope and regenerates automatic names', async () => {
    renderEditor();
    await addRole();
    await userEvent.selectOptions(screen.getByLabelText('Level *'), 'SCHEMA');
    expect(screen.queryByRole('checkbox', { name: 'odx: USE CATALOG' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Role Name *').value).toBe('dbx-dev-gpd-user-odx-cdm');
    await userEvent.selectOptions(screen.getByLabelText('Level *'), 'OBJECT');
    expect(screen.queryByRole('checkbox', { name: 'cdm: USE SCHEMA' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'study: SELECT' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'contacts: SELECT' })).toBeNull();
  });

  it('shows catalog inheritance without copying child grants', async () => {
    const editor = renderEditor();
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: USE CATALOG' }));
    expect(screen.getAllByText(/Inherited from catalog: USE CATALOG/).length).toBeGreaterThan(0);
    expect(editor.data().roleAssignments[0].objectPermissions.find((item) => item.objectId === 's1')?.permissions).toEqual([]);
  });

  it('shows existing identity as text, tracks revokes and confirms removal from the blueprint', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const editor = renderEditor({ getExistingRolesForObjects: async () => [roles[0]] });
    await userEvent.click(await screen.findByRole('button', { name: `Role assignment: ${roles[0].roleName}` }));
    expect(screen.queryByRole('textbox', { name: 'Role Name *' })).toBeNull();
    expect(screen.queryByLabelText('Level *')).toBeNull();
    expect(screen.queryByLabelText('Role Type *')).toBeNull();
    expect(screen.queryByLabelText('Role scope *')).toBeNull();
    expect(screen.queryByText(/\/32/)).toBeNull();
    expect(screen.getByText('Catalog · User')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    expect(screen.getByText('Removed')).toBeTruthy();
    expect(screen.getByText('+0 granted, -1 revoked')).toBeTruthy();
    expect(editor.data().roleAssignments[0].objectPermissions.find((item) => item.objectId === 't1')?.originalPermissions).toEqual(['SELECT']);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remove from blueprint' }));
    expect(editor.data().roleAssignments).toHaveLength(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('This does not delete the Databricks role.'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from blueprint' }));
    expect(editor.data().roleAssignments).toHaveLength(0);
  });

  it('keeps checkbox edits when collapsing with Escape and returns focus to the card header', async () => {
    renderEditor();
    await addRole();
    const trigger = screen.getByRole('button', { name: /^Role assignment:/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.querySelector('svg')?.classList.contains('rotate-180')).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.keyboard('{Escape}');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    await userEvent.click(trigger);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'study: SELECT' }).checked).toBe(true);
  });

  it('validates missing grants and Request Manager fields and expands invalid cards', async () => {
    const editor = renderEditor();
    await addRole();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Select at least one privilege for this role.')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Select a form type.')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Form Type *'), 'regular');
    await userEvent.type(screen.getByLabelText('Display Name *'), 'Users');
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });
  });

  it('surfaces service role name errors in an expanded card', async () => {
    const role = createRole('r', objects, 'dev', 'user');
    role.objectPermissions[0].permissions = ['USE CATALOG'];
    const editor = renderEditor({ validateRoleName: async () => ({ valid: false, message: 'Name taken' }) }, { roleAssignments: [role], discoveredRoleIds: [] });
    await screen.findByRole('button', { name: `Role assignment: ${role.roleName}` });
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Name taken')).toBeTruthy();
  });

  it('searches and attaches existing roles as collapsed cards with their original grants', async () => {
    const editor = renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: '+ Create Role Assignment' }));
    await userEvent.selectOptions(screen.getByLabelText('Assignment mode'), 'existing');
    await userEvent.type(screen.getByLabelText('Search existing Databricks roles'), 'support');
    const selector = await screen.findByLabelText<HTMLSelectElement>('Existing role');
    await waitFor(() => expect(selector.options.length).toBeGreaterThan(1));
    await userEvent.selectOptions(selector, selector.options[1].value);
    await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
    const trigger = screen.getByRole('button', { name: /^Role assignment:/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(trigger);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'odx: USE CATALOG' }).checked).toBe(true);
    expect(editor.data().roleAssignments[0].status).toBe('EXISTING');
  });

  it('offers only an uncovered new leaf-object shortcut and preselects that object', async () => {
    const editor = renderEditor();
    const warning = await screen.findByRole('note', { name: 'No role coverage: contacts' });
    expect(screen.getAllByRole('button', { name: 'Create role for this object' })).toHaveLength(1);
    await userEvent.click(within(warning).getByRole('button', { name: 'Create role for this object' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
    expect(editor.data().roleAssignments[0]).toMatchObject({ level: 'OBJECT', scopeObjectId: 'v1', roleName: 'dbx-dev-gpd-user-odx-contacts' });
    expect(screen.queryByRole('note', { name: 'No role coverage: contacts' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'contacts: SELECT' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'study: SELECT' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('note', { name: 'No role coverage: contacts' })).toBeTruthy();
  });

  it('treats a parent-scoped role as coverage for a new object', async () => {
    renderEditor();
    await screen.findByRole('note', { name: 'No role coverage: contacts' });
    await addRole();
    expect(screen.queryByRole('note', { name: 'No role coverage: contacts' })).toBeNull();
  });

  it('includes system schemas and their descendants in discovery and the editable card tree', async () => {
    const selected = [
      ...objects,
      { ...objects[1], objectId: 'sys', objectName: 'INFORMATION_SCHEMA' },
      { ...objects[2], objectId: 'sys-table', objectName: 'system_tables', parentId: 'sys' },
    ];
    const discovery = vi.fn().mockResolvedValue([]);
    const editor = renderEditor({ getSelectedObjects: async () => selected, getExistingRolesForObjects: discovery });
    await addRole();
    expect(discovery.mock.calls[0][0]).toEqual(selected);
    expect(screen.getByText('INFORMATION_SCHEMA')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'system_tables: SELECT' }));
    expect(editor.data().roleAssignments[0].objectPermissions).toHaveLength(selected.length);
    expect(editor.data().roleAssignments[0].objectPermissions.find((object) => object.objectId === 'sys-table')?.permissions).toEqual(['SELECT']);
  });

  it('shows unsupported original privileges inline so they can be explicitly removed', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const role = roles[0];
    role.objectPermissions[0] = { ...role.objectPermissions[0], originalPermissions: ['LEGACY'], permissions: ['LEGACY'] };
    renderEditor({ getExistingRolesForObjects: async () => [role] });
    await userEvent.click(await screen.findByRole('button', { name: `Role assignment: ${role.roleName}` }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: LEGACY' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'odx: LEGACY' }).disabled).toBe(true);
    expect(screen.getByText('Removed')).toBeTruthy();
  });

  it('shows empty and load/retry states', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Load failed')).mockResolvedValue([]);
    const editor = renderEditor({ getSelectedObjects: load });
    expect(screen.getByRole('status', { name: 'Loading permissions' })).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('Load failed');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('No objects have been selected.');
    await userEvent.click(screen.getByRole('button', { name: 'Back to Objects' }));
    expect(editor.onBack).toHaveBeenCalledOnce();
  });
});
