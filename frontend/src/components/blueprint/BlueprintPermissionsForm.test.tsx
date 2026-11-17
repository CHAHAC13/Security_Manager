import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintPermissionsForm, type PermissionsFormHandle } from './BlueprintPermissionsForm';
import { createMockPermissionsService, type PermissionsService } from '@/services/permissionsService';
import { createRole, refreshRole } from '@/lib/permissions';
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

async function addRole(expand = true) {
  await userEvent.click(await screen.findByRole('button', { name: 'Create Role Assignment' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
  const scopes = screen.getAllByRole('combobox', { name: 'Role scope *' });
  await userEvent.selectOptions(scopes[scopes.length - 1], 'c1');
  const types = screen.getAllByRole('combobox', { name: 'Role Type *' });
  await userEvent.selectOptions(types[types.length - 1], 'user');
  if (expand) {
    const groups = screen.getAllByRole('rowgroup', { name: /^Role assignment:/ });
    await userEvent.click(within(groups[groups.length - 1]).getByRole('button', { name: /access for/ }));
  }
}

function paginatedRoles(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const role = createRole(`role-${index}`, objects, 'dev', 'user');
    role.roleName = `dbx-dev-gpd-user-role${index}`;
    role.roleNameManuallyEdited = true;
    role.objectPermissions[0].permissions = ['USE CATALOG'];
    return role;
  });
}

describe('role assignment matrix', () => {
  it('paginates complete groups and preserves grants and expanded access across pages', async () => {
    const roles = paginatedRoles(6);
    const editor = renderEditor({}, { roleAssignments: roles, discoveredRoleIds: [] });
    const first = await screen.findByRole('rowgroup', { name: `Role assignment: ${roles[0].roleName}` });
    expect(screen.getAllByRole('rowgroup', { name: /^Role assignment:/ })).toHaveLength(5);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous role groups page' }).disabled).toBe(true);
    await userEvent.click(within(first).getByRole('button', { name: /access for/ }));
    await userEvent.click(within(first).getByRole('checkbox', { name: 'study: SELECT' }));
    const edited = structuredClone(editor.data());
    await userEvent.click(screen.getByRole('button', { name: 'Next role groups page' }));
    expect(screen.getAllByRole('rowgroup', { name: /^Role assignment:/ })).toHaveLength(1);
    expect(screen.getByText('Role group 06')).toBeTruthy();
    expect(screen.getByText('Role groups 6-6 of 6 | Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next role groups page' }).disabled).toBe(true);
    expect(editor.data()).toEqual(edited);
    await userEvent.click(screen.getByRole('button', { name: 'Previous role groups page' }));
    const restored = screen.getByRole('rowgroup', { name: `Role assignment: ${roles[0].roleName}` });
    expect(within(restored).getByRole('button', { name: /access for/ }).getAttribute('aria-expanded')).toBe('true');
    expect(within(restored).getByRole<HTMLInputElement>('checkbox', { name: 'study: SELECT' }).checked).toBe(true);
  });

  it('opens the page of an added role and returns to a valid page when its last role is removed', async () => {
    const editor = renderEditor({}, { roleAssignments: paginatedRoles(5), discoveredRoleIds: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Create Role Assignment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
    expect(screen.getByText('Role groups 6-6 of 6 | Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Role Name *' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(editor.data().roleAssignments).toHaveLength(5);
    expect(screen.getByText('Role groups 1-5 of 5 | Page 1 of 1')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next role groups page' }).disabled).toBe(true);
  });

  it('opens off-page validation errors and also navigates to server errors', async () => {
    const roles = paginatedRoles(6);
    roles[5].roleName = '';
    const editor = renderEditor({}, { roleAssignments: roles, discoveredRoleIds: [] });
    await screen.findByRole('rowgroup', { name: `Role assignment: ${roles[0].roleName}` });
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Role groups 6-6 of 6 | Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Role Name *' }).getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Role Name *' })));
    await act(async () => {
      editor.ref.current?.setServerErrors({ roles: { [roles[0].id]: { roleName: 'Name already taken' } } });
    });
    expect(screen.getByText('Role groups 1-5 of 6 | Page 1 of 2')).toBeTruthy();
    expect(screen.getByText('Name already taken')).toBeTruthy();
  });

  it('creates a new role with an empty name and role type', async () => {
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Create Role Assignment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
    expect(screen.getByLabelText<HTMLInputElement>('Role Name *').value).toBe('');
    expect(screen.getByLabelText<HTMLSelectElement>('Role Type *').value).toBe('');
    expect(screen.getByLabelText<HTMLSelectElement>('Role scope *').value).toBe('');
    expect(screen.getByPlaceholderText('dbx-<env>-gpd-<role>-<catalog>')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /access for/ })).toBeNull();
  });
  it('validates a read-only long existing name and permits removing its final grant', async () => {
    const selected = [{ ...objects[0], objectName: 'gpdip_iconfirecrest_share_prod' }];
    const roles = await createMockPermissionsService().getExistingRolesForObjects(selected, 'dev');
    const validateName = vi.fn();
    const editor = renderEditor({
      getSelectedObjects: async () => selected,
      getExistingRolesForObjects: async () => roles,
      validateRoleName: validateName,
    });
    await screen.findByRole('rowgroup', { name: `Role assignment: ${roles[0].roleName}` });
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
  it('keeps role identities and catalog grants visible while expanding descendants independently', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const editor = renderEditor({ getExistingRolesForObjects: async () => roles.slice(0, 1) });
    const existing = await screen.findByRole('rowgroup', { name: `Role assignment: ${roles[0].roleName}` });
    expect(within(existing).getAllByRole('row')).toHaveLength(1);
    expect(within(existing).getByRole('rowheader').getAttribute('rowspan')).toBe(String(objects.length));
    expect(within(existing).getByRole('checkbox', { name: 'odx: USE CATALOG' })).toBeTruthy();
    expect(within(existing).queryByRole('checkbox', { name: 'study: SELECT' })).toBeNull();
    await addRole(false);
    expect(screen.getByRole('textbox', { name: 'Role Name *' })).toBeTruthy();
    const created = screen.getAllByRole('rowgroup', { name: /^Role assignment:/ })[1];
    const trigger = within(existing).getByRole('button', { name: /Schema and object access for/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const before = structuredClone(editor.data());
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(existing).getAllByRole('row')).toHaveLength(objects.length);
    expect(within(created).getAllByRole('row')).toHaveLength(1);
    expect(editor.data()).toEqual(before);
    await userEvent.click(within(existing).getByRole('checkbox', { name: 'study: SELECT' }));
    const edited = structuredClone(editor.data());
    trigger.focus();
    await userEvent.keyboard(' ');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(within(existing).queryByRole('checkbox', { name: 'study: SELECT' })).toBeNull();
    expect(within(existing).getByText('+0 granted, -1 revoked')).toBeTruthy();
    expect(within(existing).getByRole('checkbox', { name: 'odx: USE CATALOG' })).toBeTruthy();
    expect(editor.data()).toEqual(edited);
    await userEvent.click(trigger);
    expect(within(existing).getByRole<HTMLInputElement>('checkbox', { name: 'study: SELECT' }).checked).toBe(false);
  });

  it('places scoped objects and their privileges in the configuration table', async () => {
    renderEditor();
    await addRole();
    const table = screen.getByRole('table', { name: 'Role permissions configuration matrix' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Level / Scope', 'Role Name', 'Object', 'Privileges', 'Request Manager', 'Form Type', 'Display Name', 'Actions',
    ]);
    expect(screen.queryByRole('region', { name: 'Permissions by resource' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Configuration Matrix' }).tabIndex).toBe(0);
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
    expect(screen.getByText('Pending addition')).toBeTruthy();
    expect(screen.getByText('+1 granted, -0 revoked')).toBeTruthy();
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'cdm: CREATE TABLE' })[0]);
    expect(screen.queryByText(/granted, .*revoked/)).toBeNull();
  });

  it('keeps Request Manager settings in role-wide columns and clears inactive fields', async () => {
    const editor = renderEditor();
    await addRole();
    fireEvent.change(screen.getByLabelText('Role Name *'), { target: { value: 'dbx-dev-gpd-user-custom' } });
    expect(screen.getByRole('rowgroup', { name: 'Role assignment: dbx-dev-gpd-user-custom' })).toBeTruthy();
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
    await userEvent.selectOptions(screen.getByLabelText('Role scope *'), 's1');
    expect(screen.queryByRole('checkbox', { name: 'odx: USE CATALOG' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Role Name *').value).toBe('dbx-dev-gpd-user-odx-cdm');
    await userEvent.selectOptions(screen.getByLabelText('Level *'), 'OBJECT');
    await userEvent.selectOptions(screen.getByLabelText('Role scope *'), 't1');
    expect(screen.queryByRole('checkbox', { name: 'cdm: USE SCHEMA' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'study: SELECT' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'contacts: SELECT' })).toBeNull();
  });

  it('keeps schema-scope grants visible and only collapses their children, with no accordion for leaf roles', async () => {
    const schema = refreshRole({ ...createRole('schema-role', objects, 'dev', 'user'), level: 'SCHEMA', scopeObjectId: 's1' }, objects, 'dev');
    const leaf = refreshRole({ ...createRole('leaf-role', objects, 'dev', 'user'), level: 'OBJECT', scopeObjectId: 't1' }, objects, 'dev');
    renderEditor({
      getSelectedObjects: async () => [objects[2], objects[1], objects[0], ...objects.slice(3)],
    }, { roleAssignments: [schema, leaf], discoveredRoleIds: [] });
    const schemaGroup = await screen.findByRole('rowgroup', { name: `Role assignment: ${schema.roleName}` });
    expect(within(schemaGroup).getByRole('checkbox', { name: 'cdm: USE SCHEMA' })).toBeTruthy();
    expect(within(schemaGroup).queryByRole('checkbox', { name: 'study: SELECT' })).toBeNull();
    const leafGroup = screen.getByRole('rowgroup', { name: `Role assignment: ${leaf.roleName}` });
    expect(within(leafGroup).getByRole('checkbox', { name: 'study: SELECT' })).toBeTruthy();
    expect(within(leafGroup).queryByRole('button', { name: /access for/ })).toBeNull();
    await userEvent.click(within(schemaGroup).getByRole('button', { name: `Object access for ${schema.roleName}` }));
    expect(within(schemaGroup).getByRole('checkbox', { name: 'study: SELECT' })).toBeTruthy();
  });

  it('does not infer inherited child permissions from edited catalog grants', async () => {
    const editor = renderEditor();
    await addRole();
    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: USE CATALOG' }));
    expect(screen.queryByText(/Inherited from catalog:/)).toBeNull();
    expect(screen.queryByRole('region', { name: /^Inherited permissions for/ })).toBeNull();
    expect(editor.data().roleAssignments[0].objectPermissions.find((item) => item.objectId === 's1')?.permissions).toEqual([]);
  });

  it('shows existing identity as text, tracks revokes and confirms removal from the blueprint', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const editor = renderEditor({ getExistingRolesForObjects: async () => [roles[0]] });
    await screen.findByRole('rowgroup', { name: `Role assignment: ${roles[0].roleName}` });
    expect(screen.queryByRole('textbox', { name: 'Role Name *' })).toBeNull();
    expect(screen.queryByLabelText('Level *')).toBeNull();
    expect(screen.queryByLabelText('Role Type *')).toBeNull();
    expect(screen.queryByLabelText('Role scope *')).toBeNull();
    expect(screen.queryByText(/\/32/)).toBeNull();
    expect(screen.getByText('Catalog', { exact: true })).toBeTruthy();
    expect(screen.getByText('User', { exact: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /access for/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    expect(screen.getByText('Pending removal')).toBeTruthy();
    expect(screen.getByText('+0 granted, -1 revoked')).toBeTruthy();
    expect(editor.data().roleAssignments[0].objectPermissions.find((item) => item.objectId === 't1')?.originalPermissions).toEqual(['SELECT']);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Remove from blueprint' }));
    expect(editor.data().roleAssignments).toHaveLength(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('This does not delete the Databricks role.'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from blueprint' }));
    expect(editor.data().roleAssignments).toHaveLength(0);
  });

  it('keeps role settings shared while editing different object rows', async () => {
    renderEditor();
    await addRole();
    const group = screen.getByRole('rowgroup', { name: /^Role assignment:/ });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.selectOptions(screen.getByLabelText('Form Type *'), 'regular');
    await userEvent.type(screen.getByLabelText('Display Name *'), 'Shared role');
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'contacts: SELECT' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'study: SELECT' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'contacts: SELECT' }).checked).toBe(true);
    expect(screen.getAllByLabelText('Display Name *')).toHaveLength(1);
    expect(screen.getByLabelText<HTMLInputElement>('Display Name *').value).toBe('Shared role');
  });

  it('validates missing grants and Request Manager fields and focuses the invalid table field', async () => {
    const editor = renderEditor();
    await addRole(false);
    const trigger = screen.getByRole('button', { name: /access for/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Select at least one privilege for this role.')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'study: SELECT' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Select a form type.')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Form Type *'), 'regular');
    await userEvent.type(screen.getByLabelText('Display Name *'), 'Users');
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });
  });

  it('surfaces service role name errors in the role column', async () => {
    const role = createRole('r', objects, 'dev', 'user');
    role.objectPermissions[0].permissions = ['USE CATALOG'];
    const editor = renderEditor({ validateRoleName: async () => ({ valid: false, message: 'Name taken' }) }, { roleAssignments: [role], discoveredRoleIds: [] });
    await screen.findByRole('rowgroup', { name: `Role assignment: ${role.roleName}` });
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    expect(screen.getByText('Name taken')).toBeTruthy();
  });

  it('searches and attaches existing roles with their original grants visible', async () => {
    const editor = renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Create Role Assignment' }));
    await userEvent.selectOptions(screen.getByLabelText('Assignment mode'), 'existing');
    await userEvent.type(screen.getByLabelText('Search existing Databricks roles'), 'support');
    const selector = await screen.findByLabelText<HTMLSelectElement>('Existing role');
    await waitFor(() => expect(selector.options.length).toBeGreaterThan(1));
    await userEvent.selectOptions(selector, selector.options[1].value);
    await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
    expect(screen.getByRole('rowgroup', { name: /^Role assignment:/ })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'odx: USE CATALOG' }).checked).toBe(true);
    expect(editor.data().roleAssignments[0].status).toBe('EXISTING');
  });

  it('offers only an uncovered new leaf-object shortcut and preselects that object', async () => {
    const editor = renderEditor();
    const warning = await screen.findByRole('note', { name: 'No role coverage: contacts' });
    expect(screen.getAllByRole('button', { name: 'Create role for this object' })).toHaveLength(1);
    await userEvent.click(within(warning).getByRole('button', { name: 'Create role for this object' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add role assignment' }));
    expect(editor.data().roleAssignments[0]).toMatchObject({ level: 'OBJECT', scopeObjectId: 'v1', roleName: '', roleTypeCode: '' });
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

  it('includes system schemas and their descendants in discovery and the editable table rows', async () => {
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

  it('preserves discovered privileges outside local options and permits undoing pending removals', async () => {
    const roles = await createMockPermissionsService().getExistingRolesForObjects(objects, 'dev');
    const role = roles[0];
    const originals = ['EXECUTE', 'READ VOLUME', 'SELECT', 'USE SCHEMA'];
    role.objectPermissions[0] = { ...role.objectPermissions[0], originalPermissions: [...originals], permissions: [...originals] };
    const editor = renderEditor({ getExistingRolesForObjects: async () => [role] });
    await screen.findByRole('rowgroup', { name: `Role assignment: ${role.roleName}` });
    for (const privilege of originals) {
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: `odx: ${privilege}` }).checked).toBe(true);
    }
    expect(screen.queryByText(/Unsupported/)).toBeNull();
    expect(screen.queryByText('Pending removal')).toBeNull();
    expect(screen.queryByText('Removed')).toBeNull();
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });

    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: READ VOLUME' }));
    expect(screen.getByText('Pending removal')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'odx: READ VOLUME' }).disabled).toBe(false);
    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: READ VOLUME' }));
    expect(screen.queryByText('Pending removal')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: SELECT' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'odx: USE SCHEMA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore original permissions for odx' }));
    expect(screen.queryByText('Pending removal')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore original permissions for odx' })).toBeNull();
    expect(editor.data().roleAssignments[0].objectPermissions[0].permissions).toEqual(originals);
    expect(editor.data().roleAssignments[0].objectPermissions[0].originalPermissions).toEqual(originals);
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });
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

  it('renders partial role groups as they arrive, keeps edits and blocks Next until loading finishes', async () => {
    const [first, second] = paginatedRoles(2);
    let finish!: () => void;
    const editor = renderEditor({
      getExistingRolesForObjects: (_objects, _environment, onProgress) => new Promise((resolve) => {
        onProgress?.([first]);
        finish = () => resolve([first, second]);
      }),
    });
    const group = await screen.findByRole('rowgroup', { name: `Role assignment: ${first.roleName}` });
    expect(screen.getByRole('status', { name: 'Loading more role groups' }).textContent).toContain('1 found so far');
    expect(screen.queryByRole('status', { name: 'Loading permissions' })).toBeNull();
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(false); });
    fireEvent.change(within(group).getByRole('textbox', { name: /Role Name/ }), { target: { value: 'edited-while-loading' } });
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading more role groups' })).toBeNull());
    expect(editor.data().roleAssignments.map((role) => role.id)).toEqual([first.id, second.id]);
    expect(editor.data().roleAssignments[0].roleName).toBe('edited-while-loading');
  });
});
