import { createRef, useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import { permissionChanges } from '@/lib/permissions';
import { apiPermissionsService } from '@/services/permissionsService';
import { effectivePermissionResponse, objectsData } from '@/test/permissionFixtures';
import { INITIAL_PERMISSIONS_DATA, type BlueprintPermissionsData } from '@/types/blueprint';
import { BlueprintPermissionsForm, type PermissionsFormHandle } from './BlueprintPermissionsForm';

vi.mock('@/lib/apiClient', () => ({ default: { post: vi.fn() } }));

function renderApiEditor(initial = INITIAL_PERMISSIONS_DATA) {
  const ref = createRef<PermissionsFormHandle>();
  let current: BlueprintPermissionsData = initial;
  function Harness() {
    const [data, setData] = useState(initial);
    current = data;
    return <BlueprintPermissionsForm ref={ref} data={data} objectsData={objectsData} environment="dev"
      onChange={setData} onBack={() => {}} onReadyChange={() => {}} service={apiPermissionsService} />;
  }
  const view = render(<Harness />);
  return { ...view, data: () => current, ref };
}

async function expandAll() {
  await userEvent.click(await screen.findByRole('button', { name: 'Expand All' }));
}

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.post).mockResolvedValue({ data: effectivePermissionResponse });
});

describe('effective permissions from the API', () => {
  it('displays every principal with simple permission controls and no raw JSON panels', async () => {
    const editor = renderApiEditor();
    await expandAll();
    for (const principal of ['support-team', 'account users', 'inherited-only']) {
      expect(screen.getByRole('region', { name: `Role assignment: ${principal}` })).toBeTruthy();
      const header = screen.getByRole('button', { name: `Role assignment: ${principal}` });
      expect(within(header).getByText('Catalog', { exact: true })).toBeTruthy();
      expect(header.textContent).not.toContain('·');
    }
    expect(screen.queryByText(/Type not provided/)).toBeNull();
    const support = screen.getByRole('region', { name: 'Role assignment: support-team' });
    const schema = within(support).getByRole('region', { name: 'Inherited permissions for cdm' });
    expect(schema.textContent).toContain('EXECUTE');
    expect(schema.textContent).toContain('READ_VOLUME');
    expect(schema.textContent).toContain('SELECT');
    expect(schema.textContent).toContain('USE_SCHEMA');
    expect(schema.textContent).toContain('Inherited from CATALOG:');
    expect(schema.textContent).toContain('odx');
    expect(within(schema).queryByRole('checkbox')).toBeNull();
    expect(within(support).getByRole<HTMLInputElement>('checkbox', { name: 'odx: USE_CATALOG' }).checked).toBe(true);
    expect(within(support).getByRole<HTMLInputElement>('checkbox', { name: 'odx: READ_VOLUME' }).checked).toBe(true);
    expect(within(support).getByRole<HTMLInputElement>('checkbox', { name: 'cdm: USE_SCHEMA' }).checked).toBe(false);
    expect(within(support).getByRole<HTMLInputElement>('checkbox', { name: 'study: SELECT' }).checked).toBe(false);
    const account = screen.getByRole('region', { name: 'Role assignment: account users' });
    expect(within(account).getByRole<HTMLInputElement>('checkbox', { name: 'cdm: USE_SCHEMA' }).checked).toBe(true);
    expect(within(account).getByRole<HTMLInputElement>('checkbox', { name: 'study: SELECT' }).checked).toBe(true);
    const inheritedOnly = screen.getByRole('region', { name: 'Role assignment: inherited-only' });
    const metastore = within(inheritedOnly).getByRole('region', { name: 'Inherited permissions for odx' });
    expect(metastore.textContent).toContain('READ_METADATA');
    expect(metastore.textContent).toContain('METASTORE');
    expect(metastore.textContent).toContain('test-metastore');

    for (const role of editor.data().roleAssignments) {
      expect(role.objectPermissions.flatMap((object) => object.discoveredAssignments ?? []))
        .toEqual(effectivePermissionResponse.filter((item) => item.principal === role.roleName));
      expect(permissionChanges(role)).toEqual([]);
    }
    expect(screen.queryByText(/^API response for /)).toBeNull();
    expect(screen.queryByText('odx.cdm', { exact: true })).toBeNull();
    expect(screen.queryByText('odx.cdm.study', { exact: true })).toBeNull();
    expect(within(support).getByText('cdm', { exact: true })).toBeTruthy();
    expect(within(support).getByText('study', { exact: true })).toBeTruthy();
    expect(editor.container.querySelector('pre')).toBeNull();
    expect(screen.queryByText('Pending removal')).toBeNull();
    expect(screen.queryByText('Pending addition')).toBeNull();
    expect(screen.queryByText(/Unsupported/)).toBeNull();
    await act(async () => { expect(await editor.ref.current?.validate()).toBe(true); });
    expect(apiClient.post).toHaveBeenCalledExactlyOnceWith('/api/v1/discovery/privileges', {
      securables: [
        { securable_type: 'CATALOG', full_name: 'odx' },
        { securable_type: 'SCHEMA', full_name: 'odx.cdm' },
        { securable_type: 'TABLE', full_name: 'odx.cdm.study' },
      ], include_inherited: true,
    });
  });

  it('creates changes only for the clicked principal/resource and never mutates the API or inherited snapshots', async () => {
    const original = structuredClone(effectivePermissionResponse);
    const editor = renderApiEditor();
    await expandAll();
    const before = structuredClone(editor.data());
    await userEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    await expandAll();
    expect(editor.data()).toEqual(before);
    const support = screen.getByRole('region', { name: 'Role assignment: support-team' });
    await userEvent.click(within(support).getByRole('checkbox', { name: 'odx: SELECT' }));
    const supportData = editor.data().roleAssignments.find((role) => role.roleName === 'support-team')!;
    expect(permissionChanges(supportData)).toEqual([{
      objectId: supportData.objectPermissions[0].objectId, privilege: 'SELECT', changeType: 'REVOKE',
    }]);
    expect(editor.data().roleAssignments.filter((role) => role.roleName !== 'support-team')
      .flatMap(permissionChanges)).toEqual([]);
    expect(supportData.objectPermissions.slice(1)).toEqual(
      before.roleAssignments.find((role) => role.roleName === 'support-team')?.objectPermissions.slice(1),
    );
    expect(supportData.objectPermissions[0].discoveredAssignments).toEqual([effectivePermissionResponse[0]]);
    expect(effectivePermissionResponse).toEqual(original);
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    await userEvent.click(within(support).getByRole('button', { name: 'Restore original permissions for odx' }));
    expect(editor.data().roleAssignments.flatMap(permissionChanges)).toEqual([]);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('retains explicit edits and exact inheritance across revisits without adding any other changes', async () => {
    const first = renderApiEditor();
    await expandAll();
    const support = screen.getByRole('region', { name: 'Role assignment: support-team' });
    await userEvent.click(within(support).getByRole('checkbox', { name: 'study: MODIFY' }));
    const state = structuredClone(first.data());
    first.unmount();
    const returned = renderApiEditor(state);
    await expandAll();
    expect(returned.data()).toEqual(state);
    const role = returned.data().roleAssignments.find((item) => item.roleName === 'support-team')!;
    expect(permissionChanges(role)).toEqual([{
      objectId: role.objectPermissions[2].objectId, privilege: 'MODIFY', changeType: 'GRANT',
    }]);
    const card = screen.getByRole('region', { name: 'Role assignment: support-team' });
    expect(within(card).getByRole('region', { name: 'Inherited permissions for study' }).textContent).toContain('SELECT');
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });
});
