import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintReview } from './BlueprintReview';
import { createDeploymentData } from '@/lib/deployment';
import { INITIAL_APPROVERS_DATA, INITIAL_PERMISSIONS_DATA, INITIAL_SETUP_DATA } from '@/types/blueprint';
import type { BlueprintFormData } from '@/types/blueprint';
import { objectsData } from '@/test/permissionFixtures';
import { createRole } from '@/lib/permissions';
import { getBlueprintReviewIssues } from '@/lib/blueprintReview';
import { selectedPermissionObjects } from '@/services/permissionsService';

describe('BlueprintReview', () => {
  it('renders selected scope from multiple catalogs and routes edits and validation issues to their steps', () => {
    const data: BlueprintFormData = {
      setup: {
        ...INITIAL_SETUP_DATA,
        name: 'Review test',
        description: 'Configured scope test',
        businessJustification: 'Required access',
      },
      objects: {
        ...objectsData,
        selectedSchemaIds: ['sch', 'new-schema', 'other-schema'],
        selectedObjectIds: ['table', 'new-object', 'analytics-summary'],
        selectedSchemas: [
          ...(objectsData.selectedSchemas ?? []),
          { id: 'other-schema', name: 'reporting', catalogId: 'analytics' },
        ],
        selectedObjects: [
          ...objectsData.selectedObjects,
          { id: 'new-object', name: 'created_table', schemaId: 'new-schema', catalogId: 'new-catalog', kind: 'table', source: 'new' },
          { id: 'analytics-summary', name: 'summary', schemaId: 'other-schema', catalogId: 'analytics', kind: 'view', source: 'existing' },
          { id: 'unselected-object', name: 'not_in_blueprint', schemaId: 'sch', catalogId: 'cat', kind: 'table', source: 'existing' },
        ],
        proposedCatalogs: [{ id: 'new-catalog', name: 'new_catalog', source: 'new' }],
        proposedSchemas: [{ id: 'new-schema', name: 'curated', catalogId: 'new-catalog', source: 'new' }],
        proposedObjects: [{
          id: 'new-object', name: 'created_table', schemaId: 'new-schema', catalogId: 'new-catalog',
          kind: 'table', source: 'new',
        }],
      },
      permissions: INITIAL_PERMISSIONS_DATA,
      approvers: INITIAL_APPROVERS_DATA,
      deployment: createDeploymentData(),
    };
    const onEdit = vi.fn();

    render(
      <BlueprintReview
        data={data}
        confirmingSubmission={false}
        submitting={false}
        onEdit={onEdit}
        onCancelSubmit={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('odx')).toBeTruthy();
    expect(screen.getByText('new_catalog')).toBeTruthy();
    expect(screen.getByText('analytics')).toBeTruthy();
    expect(screen.getByText('reporting')).toBeTruthy();
    expect(screen.getByText('created_table')).toBeTruthy();
    expect(screen.getByText('summary')).toBeTruthy();
    expect(screen.queryByText('not_in_blueprint')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Object Scope' }));
    expect(onEdit).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Create at least one role assignment.' }));
    expect(onEdit).toHaveBeenCalledWith(3);
  });

  it('shows only changed roles and their approvers, and updates when changes are reverted', () => {
    const objects = selectedPermissionObjects(objectsData);
    const role = {
      ...createRole('changed', objects, 'dev', 'user'),
      status: 'EXISTING' as const,
      mode: 'UPDATE_EXISTING' as const,
      roleName: 'changed-role',
      level: 'OBJECT' as const,
      scopeObjectId: objects[2].objectId,
      objectPermissions: [{
        objectId: objects[2].objectId, objectName: objects[2].objectName,
        objectType: objects[2].objectType, parentId: objects[2].parentId,
        originalPermissions: ['SELECT'], permissions: ['MODIFY'],
      }],
    };
    const unchanged = { ...role, id: 'unchanged', roleName: 'unchanged-role', objectPermissions: [
      { ...role.objectPermissions[0], originalPermissions: ['SELECT'], permissions: ['SELECT'] },
    ] };
    const data: BlueprintFormData = {
      setup: { ...INITIAL_SETUP_DATA, name: 'Test', description: 'Description', businessJustification: 'Reason' },
      objects: objectsData,
      permissions: { ...INITIAL_PERMISSIONS_DATA, roleAssignments: [unchanged, role] },
      approvers: {
        ...INITIAL_APPROVERS_DATA,
        approvers: {
          changed: {
            technical: [{ id: 'a', displayName: 'Changed Technical', email: 'a@example.com' }],
            business: [{ id: 'b', displayName: 'Changed Business', email: 'b@example.com' }],
          },
          unchanged: {
            technical: [{ id: 'c', displayName: 'Unchanged Technical', email: 'c@example.com' }],
            business: [{ id: 'd', displayName: 'Unchanged Business', email: 'd@example.com' }],
          },
        },
      },
      deployment: createDeploymentData(),
    };
    const renderReview = (value: BlueprintFormData) => <BlueprintReview data={value} confirmingSubmission={false} submitting={false}
      onEdit={vi.fn()} onCancelSubmit={vi.fn()} onSubmit={vi.fn()} />;
    const { rerender } = render(renderReview(data));

    const rolesSection = screen.getByRole('region', { name: 'Roles & Permissions' });
    const approversSection = screen.getByRole('region', { name: 'Approvers' });
    const changedDetails = within(rolesSection).getAllByText('changed-role')[0].closest('details');
    expect(changedDetails?.open).toBe(true);
    expect(within(changedDetails!).getByText('Grant').parentElement?.textContent).toContain('Grant MODIFY — odx > cdm > study');
    expect(within(changedDetails!).getByText('Revoke').parentElement?.textContent).toContain('Revoke SELECT — odx > cdm > study');
    expect(within(changedDetails!).getByText('odx > cdm > study')).toBeTruthy();
    expect(within(rolesSection).queryByText('unchanged-role')).toBeNull();
    expect(within(rolesSection).getByText('Roles: 1')).toBeTruthy();
    expect(within(rolesSection).getByText('Permission Assignments: 1')).toBeTruthy();
    expect(within(approversSection).getByText('changed-role')).toBeTruthy();
    expect(within(approversSection).getByText('Changed Technical')).toBeTruthy();
    expect(within(approversSection).getByText('Changed Business')).toBeTruthy();
    expect(within(approversSection).queryByText('unchanged-role')).toBeNull();
    expect(within(approversSection).queryByText('Unchanged Technical')).toBeNull();

    rerender(renderReview({ ...data, permissions: { ...data.permissions, roleAssignments: [unchanged, {
      ...role, objectPermissions: [{ ...role.objectPermissions[0], permissions: ['SELECT'] }],
    }] } }));
    expect(within(rolesSection).getByText('Roles: 0')).toBeTruthy();
    expect(within(rolesSection).getByText('No new or changed roles require approval.')).toBeTruthy();
    expect(within(approversSection).getByText('No new or changed roles require approvers.')).toBeTruthy();
    expect(within(approversSection).queryByText('changed-role')).toBeNull();
  });

  it('includes new roles and existing roles with only Request Manager changes', () => {
    const objects = selectedPermissionObjects(objectsData);
    const newRole = { ...createRole('new', objects, 'dev', 'user'), roleName: 'new-role' };
    const existingRole = {
      ...createRole('request-manager', objects, 'dev', 'user'),
      status: 'EXISTING' as const, mode: 'UPDATE_EXISTING' as const, roleName: 'request-manager-role',
      requestManager: { enabled: true, formType: 'regular', displayName: 'Access',
        originalValues: { enabled: false, formType: '', displayName: '' } },
    };
    const data: BlueprintFormData = {
      setup: INITIAL_SETUP_DATA, objects: objectsData,
      permissions: { ...INITIAL_PERMISSIONS_DATA, roleAssignments: [newRole, existingRole] },
      approvers: INITIAL_APPROVERS_DATA, deployment: createDeploymentData(),
    };
    render(<BlueprintReview data={data} confirmingSubmission={false} submitting={false}
      onEdit={vi.fn()} onCancelSubmit={vi.fn()} onSubmit={vi.fn()} />);
    const rolesSection = screen.getByRole('region', { name: 'Roles & Permissions' });
    const approversSection = screen.getByRole('region', { name: 'Approvers' });
    expect(within(rolesSection).getByText('Roles: 2')).toBeTruthy();
    expect(within(rolesSection).getByText('Request Manager Enabled Roles: 1')).toBeTruthy();
    expect(within(rolesSection).getAllByText('new-role').length).toBeGreaterThan(0);
    expect(within(rolesSection).getAllByText('request-manager-role').length).toBeGreaterThan(0);
    expect(within(approversSection).getByText('new-role')).toBeTruthy();
    expect(within(approversSection).getByText('request-manager-role')).toBeTruthy();
  });

  it('allows a full revocation for an existing role but still checks new roles and object details', () => {
    const role = {
      ...createRole('existing', selectedPermissionObjects(objectsData), 'dev', 'user'),
      status: 'EXISTING' as const,
      mode: 'UPDATE_EXISTING' as const,
      objectPermissions: [{ objectId: 't', objectName: 'study', objectType: 'TABLE' as const,
        originalPermissions: ['SELECT'], permissions: [] }],
    };
    const person = { id: 'person', displayName: 'Person', email: 'person@example.com' };
    const data: BlueprintFormData = {
      setup: { ...INITIAL_SETUP_DATA, name: 'Test', description: 'Description', businessJustification: 'Reason' },
      objects: objectsData,
      permissions: { ...INITIAL_PERMISSIONS_DATA, roleAssignments: [role] },
      approvers: { ...INITIAL_APPROVERS_DATA, approvers: { existing: { technical: [person], business: [person] } } },
      deployment: createDeploymentData(),
    };
    expect(getBlueprintReviewIssues(data).some((issue) => issue.message.startsWith('No privileges'))).toBe(false);
    const newRole = { ...role, status: 'NEW' as const, mode: 'CREATE_NEW' as const };
    expect(getBlueprintReviewIssues({ ...data, permissions: { ...data.permissions, roleAssignments: [newRole] } })
      .some((issue) => issue.message.startsWith('No privileges'))).toBe(true);
    expect(getBlueprintReviewIssues({ ...data, objects: { ...objectsData, selectedObjects: [] } })
      .some((issue) => issue.message.includes('selected objects'))).toBe(true);
  });
});
