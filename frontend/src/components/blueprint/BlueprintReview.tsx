import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Pencil, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MOCK_PERMISSION_METADATA } from '@/data/permissionsData';
import { APPROVER_TYPE_LABELS } from '@/lib/approvers';
import { DEPLOYMENT_ENVIRONMENTS } from '@/lib/deployment';
import { getBlueprintReviewIssues } from '@/lib/blueprintReview';
import { permissionChanges, requestManagerChanges, rolesRequiringApproval } from '@/lib/permissions';
import type {
  BlueprintFormData,
  BlueprintStep,
  ObjectOption,
  ProposedCatalog,
  RoleAssignment,
  SchemaOption,
} from '@/types/blueprint';

interface Props {
  data: BlueprintFormData;
  confirmingSubmission: boolean;
  submitting: boolean;
  onEdit: (step: BlueprintStep) => void;
  onCancelSubmit: () => void;
  onSubmit: () => void;
}

interface ScopeObject extends ObjectOption {
  source?: 'existing' | 'new';
  catalogId?: string;
}

interface ScopeSchema extends SchemaOption {
  source?: 'existing' | 'new';
  objects: ScopeObject[];
}

interface ScopeCatalog {
  id: string;
  name: string;
  source?: 'existing' | 'new';
  schemas: ScopeSchema[];
}

const formatCode = (value: string) => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function getObjectScope(data: BlueprintFormData['objects']): ScopeCatalog[] {
  const selectedSchemaIds = new Set(data.selectedSchemaIds);
  const selectedObjectIds = new Set(data.selectedObjectIds);
  const schemas = new Map<string, SchemaOption & { source?: 'existing' | 'new' }>();

  for (const schema of data.selectedSchemas ?? []) {
    if (selectedSchemaIds.has(schema.id)) {
      schemas.set(JSON.stringify([schema.catalogId, schema.id]), { ...schema, source: 'existing' });
    }
  }
  for (const schema of data.proposedSchemas) {
    if (selectedSchemaIds.has(schema.id)) {
      schemas.set(JSON.stringify([schema.catalogId, schema.id]), { ...schema, source: 'new' });
    }
  }

  const objects = new Map<string, ScopeObject>();
  for (const object of data.selectedObjects) {
    if (selectedObjectIds.has(object.id)) {
      const catalogId = object.catalogId
        ?? data.selectedSchemas?.find((schema) => schema.id === object.schemaId)?.catalogId
        ?? data.proposedSchemas.find((schema) => schema.id === object.schemaId)?.catalogId
        ?? data.selectedCatalogId;
      objects.set(JSON.stringify([catalogId, object.schemaId, object.id]), { ...object, catalogId });
    }
  }
  for (const object of data.proposedObjects) {
    if (selectedObjectIds.has(object.id)) {
      objects.set(JSON.stringify([object.catalogId, object.schemaId, object.id]), object);
    }
  }

  const catalogIds = new Set<string>();
  if (data.selectedCatalogId) catalogIds.add(data.selectedCatalogId);
  schemas.forEach((schema) => catalogIds.add(schema.catalogId));

  const selectedCatalog = data.selectedCatalog;
  const proposedCatalogs = new Map<string, ProposedCatalog>(data.proposedCatalogs.map((catalog) => [catalog.id, catalog]));
  const selectedSchemas = [...schemas.values()];
  const selectedObjects = [...objects.values()];

  return [...catalogIds].map((catalogId) => {
    const proposedCatalog = proposedCatalogs.get(catalogId);
    const catalogName = proposedCatalog?.name
      ?? (selectedCatalog?.id === catalogId ? selectedCatalog.name : catalogId);
    return {
      id: catalogId,
      name: catalogName,
      source: proposedCatalog ? 'new' : 'existing',
      schemas: selectedSchemas.filter((schema) => schema.catalogId === catalogId).map((schema) => ({
        ...schema,
        source: schema.source,
        objects: selectedObjects.filter((object) => object.schemaId === schema.id
          && (!object.catalogId || object.catalogId === schema.catalogId)).map((object) => ({
          ...object,
          source: object.source ?? 'existing',
        })),
      })),
    };
  });
}

function EditAction({ step, title, onEdit }: { step: BlueprintStep; title: string; onEdit: (step: BlueprintStep) => void }) {
  return (
    <Button type="button" variant="ghost" aria-label={`Edit ${title}`} onClick={() => onEdit(step)} icon={<Pencil className="h-3.5 w-3.5" />}>
      Edit
    </Button>
  );
}

function Section({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: BlueprintStep;
  onEdit: (step: BlueprintStep) => void;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`review-${step}-heading`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h2 id={`review-${step}-heading`} className="text-sm font-semibold text-slate-900">{title}</h2>
        <EditAction step={step} title={title} onEdit={onEdit} />
      </div>
      {children}
    </section>
  );
}

function SourceBadge({ source }: { source?: 'existing' | 'new' }) {
  if (!source) return null;
  return <Badge variant={source === 'new' ? 'emerald' : 'slate'}>{source === 'new' ? 'New' : 'Existing'}</Badge>;
}

function ScopeTree({ catalogs }: { catalogs: ScopeCatalog[] }) {
  if (!catalogs.length) return <p className="text-sm text-slate-500">No object scope selected.</p>;
  return (
    <ul className="space-y-3">
      {catalogs.map((catalog) => (
        <li key={catalog.id} className="rounded-lg border border-slate-200 p-3">
          <details open={catalogs.length === 1}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />
            <span className="break-all font-mono">{catalog.name}</span><SourceBadge source={catalog.source} />
          </summary>
          {catalog.schemas.length > 0 ? (
            <ul className="mt-3 space-y-2 border-l border-slate-200 pl-4">
              {catalog.schemas.map((schema) => (
                <li key={schema.id}>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                    <span className="break-all font-mono">{schema.name}</span><SourceBadge source={schema.source} />
                  </div>
                  {schema.objects.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l border-slate-200 pl-4">
                      {schema.objects.map((object) => (
                        <li key={object.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="break-all font-mono">{object.name}</span>
                          <span className="text-xs text-slate-400">{formatCode(object.kind)}</span>
                          <SourceBadge source={object.source} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-slate-500">No selected schemas.</p>}
          </details>
        </li>
      ))}
    </ul>
  );
}

function permissionPath(role: RoleAssignment, objectId: string, scope: ScopeCatalog[]): string {
  for (const catalog of scope) {
    if (objectId === JSON.stringify(['catalog', catalog.id])) return catalog.name;
    for (const schema of catalog.schemas) {
      if (objectId === JSON.stringify(['schema', catalog.id, schema.id])) return `${catalog.name} > ${schema.name}`;
      const object = schema.objects.find((item) => objectId === JSON.stringify(['object', catalog.id, schema.id, item.id]));
      if (object) return `${catalog.name} > ${schema.name} > ${object.name}`;
    }
  }
  const objects = new Map(role.objectPermissions.map((permission) => [permission.objectId, permission]));
  const current = objects.get(objectId);
  if (!current) return 'Unavailable resource';
  const path = [current.objectName];
  const visited = new Set([current.objectId]);
  let parentId = current.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = objects.get(parentId);
    if (!parent) break;
    path.unshift(parent.objectName);
    parentId = parent.parentId;
  }
  return path.join(' > ');
}

function PermissionAssignments({ role, scope }: { role: RoleAssignment; scope: ScopeCatalog[] }) {
  const levelNames: Record<string, string> = { CATALOG: 'Catalog', SCHEMA: 'Schema' };
  const assignments = role.objectPermissions.filter((permission) => permission.permissions.length > 0);
  if (!assignments.length) return <p className="text-sm text-slate-500">No privileges configured.</p>;
  return (
    <ul className="space-y-2">
      {assignments.map((permission) => (
        <li key={permission.objectId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="blue">{levelNames[permission.objectType] ?? 'Object'}</Badge>
            <span className="break-all text-sm font-medium text-slate-800">{permissionPath(role, permission.objectId, scope)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {permission.permissions.map((privilege) => <Badge key={privilege}>{privilege}</Badge>)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RoleSummaries({ roles, scope }: { roles: RoleAssignment[]; scope: ScopeCatalog[] }) {
  if (!roles.length) return <p className="text-sm text-slate-500">No new or changed roles require approval.</p>;
  return (
    <div className="space-y-3">
      {roles.map((role, index) => {
        const formType = MOCK_PERMISSION_METADATA.formTypes.find((form) => form.code === role.requestManager.formType)?.label
          ?? formatCode(role.requestManager.formType);
        const changes = permissionChanges(role);
        const requestChanges = requestManagerChanges(role);
        return (
          <details key={role.id} open={index === 0} className="overflow-hidden rounded-lg border border-slate-200">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 bg-slate-50 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500" />
              <span className="break-all font-mono text-sm font-semibold text-slate-900">{role.roleName || 'Untitled role'}</span>
              <Badge variant={role.status === 'NEW' ? 'emerald' : 'blue'}>{role.status === 'NEW' ? 'New' : 'Existing'}</Badge>
              {role.status === 'EXISTING' && <Badge variant="blue">Permission or Request Manager changes</Badge>}
            </summary>
            <div className="space-y-5 border-t border-slate-200 p-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Role Name</dt><dd className="mt-1 break-all font-mono text-slate-900">{role.roleName || 'Not configured'}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Role Type</dt><dd className="mt-1 text-slate-900">{role.roleTypeCode ? formatCode(role.roleTypeCode) : 'Not configured'}</dd></div>
              </dl>
              {(changes.length > 0 || requestChanges.length > 0) && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Changes</h3>
                  <ul className="space-y-1 text-sm text-slate-800">
                    {changes.map((change) => (
                      <li key={`${change.objectId}-${change.changeType}-${change.privilege}`} className="break-words">
                        <strong>{change.changeType === 'GRANT' ? 'Grant' : 'Revoke'}</strong> {change.privilege} — {permissionPath(role, change.objectId, scope)}
                      </li>
                    ))}
                    {requestChanges.map((key) => (
                      <li key={key}>Request Manager {key === 'enabled' ? 'availability' : key === 'formType' ? 'form type' : 'display name'} changed.</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Permissions</h3>
                <PermissionAssignments role={role} scope={scope} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Request Manager</h3>
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">Available</dt><dd className="mt-1 text-slate-800">{role.requestManager.enabled ? 'Yes' : 'No'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Form Type</dt><dd className="mt-1 text-slate-800">{role.requestManager.enabled ? formType || 'Not configured' : '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Display Name</dt><dd className="mt-1 break-words text-slate-800">{role.requestManager.enabled ? role.requestManager.displayName || 'Not configured' : '—'}</dd></div>
                </dl>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function formatScheduledDateTime(isoValue: string | null, localValue: string, timeZone: string): string {
  if (!isoValue) return localValue || 'Not configured';
  const date = new Date(isoValue);
  if (!Number.isFinite(date.getTime())) return 'Invalid schedule';
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date)} (${timeZone})`;
}

export function BlueprintReview({
  data,
  confirmingSubmission,
  submitting,
  onEdit,
  onCancelSubmit,
  onSubmit,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const issues = getBlueprintReviewIssues(data);
  const scope = getObjectScope(data.objects);
  const approvalRoles = rolesRequiringApproval(data.permissions.roleAssignments);
  const permissionAssignments = approvalRoles.reduce((count, role) =>
    count + role.objectPermissions.filter((permission) => permission.permissions.length > 0).length, 0);
  const requestManagerRoles = approvalRoles.filter((role) => role.requestManager.enabled).length;
  const checks: { step: BlueprintStep; label: string }[] = [
    { step: 1, label: 'Blueprint details complete' },
    { step: 2, label: 'Object scope configured' },
    { step: 3, label: 'Roles and permissions configured' },
    { step: 4, label: 'Required approvers assigned' },
    { step: 5, label: 'Deployment strategy configured' },
  ];

  useEffect(() => {
    if (confirmingSubmission) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [confirmingSubmission]);

  return (
    <div className="space-y-5">
      <Section title="Blueprint Details" step={1} onEdit={onEdit}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {([
            ['Blueprint Name', data.setup.name],
            ['Version', data.setup.version],
            ['Description', data.setup.description],
            ['Business Justification', data.setup.businessJustification],
          ] as const).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{value || 'Not provided'}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Object Scope" step={2} onEdit={onEdit}>
        <ScopeTree catalogs={scope} />
      </Section>

      <Section title="Roles & Permissions" step={3} onEdit={onEdit}>
        <p className="mb-3 text-sm text-slate-500">Showing new roles and roles with permission or Request Manager changes.</p>
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Role and permission summary">
          <Badge variant="blue">Roles: {approvalRoles.length}</Badge>
          <Badge variant="blue">Permission Assignments: {permissionAssignments}</Badge>
          <Badge variant="blue">Request Manager Enabled Roles: {requestManagerRoles}</Badge>
        </div>
        <RoleSummaries roles={approvalRoles} scope={scope} />
      </Section>

      <Section title="Approvers" step={4} onEdit={onEdit}>
        {!approvalRoles.length
          ? <p className="text-sm text-slate-500">No new or changed roles require approvers.</p>
          : <ul className="space-y-3">
            {approvalRoles.map((role) => {
              const roleApprovers = data.approvers.approvers[role.id];
              return (
                <li key={role.id} className="rounded-lg border border-slate-200 p-3">
                  <details open={approvalRoles.length === 1}>
                  <summary className="cursor-pointer break-all font-mono text-sm font-semibold text-slate-900">{role.roleName || 'Untitled role'}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(['technical', 'business'] as const).map((type) => (
                      <div key={type}>
                        <p className="text-xs font-medium text-slate-500">{APPROVER_TYPE_LABELS[type]}</p>
                        {roleApprovers?.[type].length
                          ? <ul className="mt-1 space-y-1">{roleApprovers[type].map((person) => <li key={person.id} className="break-words text-sm text-slate-800">{person.displayName}{person.email ? <span className="ml-1 text-xs text-slate-500">({person.email})</span> : null}</li>)}</ul>
                          : <p className="mt-1 text-sm text-slate-500">None assigned</p>}
                      </div>
                    ))}
                  </div>
                  </details>
                </li>
              );
            })}
          </ul>}
      </Section>

      <Section title="Deployment Strategy" step={5} onEdit={onEdit}>
        <div className="space-y-3">
          {DEPLOYMENT_ENVIRONMENTS.map(({ key, label }) => {
            const config = data.deployment.environments[key];
            const strategy = config.strategy === 'immediate' ? 'Immediate'
              : config.strategy === 'scheduled' ? 'Scheduled' : 'Not configured';
            return (
              <div key={key} className="grid gap-1 rounded-lg border border-slate-100 p-3 sm:grid-cols-[120px_1fr]">
                <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">Strategy</dt><dd className="mt-1 text-slate-800">{strategy}</dd></div>
                  <div><dt className="text-xs text-slate-500">Date / Time</dt><dd className="mt-1 text-slate-800">{config.strategy === 'scheduled' ? formatScheduledDateTime(config.scheduledAt, config.scheduledDateTime, data.deployment.timeZone) : '—'}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Notification Settings</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            <li>Notify Requestor on Deployment Success/Failure: <strong>{data.deployment.notifyRequestor ? 'Enabled' : 'Disabled'}</strong></li>
            <li>Notify Approvers on Deployment Success/Failure: <strong>{data.deployment.notifyApprovers ? 'Enabled' : 'Disabled'}</strong></li>
          </ul>
        </div>
      </Section>

      <section aria-labelledby="review-validation-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="review-validation-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-sky-600" aria-hidden="true" />Validation Summary
        </h2>
        {issues.length === 0 ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Blueprint is ready for submission.</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {checks.map((check) => <li key={check.step} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{check.label}</li>)}
            </ul>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-medium text-amber-900">Resolve these issues before submitting:</p>
            <ul className="space-y-1.5">
              {issues.map((issue, index) => (
                <li key={`${issue.step}-${index}`}>
                  <button type="button" onClick={() => onEdit(issue.step)} className="flex w-full items-start gap-2 text-left text-sm text-amber-900 underline decoration-amber-400 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {confirmingSubmission && (
        <dialog ref={dialog} aria-labelledby="submit-blueprint-heading" aria-describedby="submit-blueprint-description"
          onCancel={(event) => { event.preventDefault(); onCancelSubmit(); }}
          className="fixed inset-0 z-50 m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 p-6 shadow-xl backdrop:bg-slate-900/40">
          <h2 id="submit-blueprint-heading" className="text-base font-semibold text-slate-900">Submit Blueprint for Approval?</h2>
          <p id="submit-blueprint-description" className="mt-2 text-sm text-slate-600">
            You are about to submit this Security Blueprint for approval. Please confirm that the configuration has been reviewed.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" onClick={onCancelSubmit} disabled={submitting}>Cancel</Button>
            <Button type="button" variant="primary" onClick={onSubmit} disabled={submitting || issues.length > 0}>
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          </div>
        </dialog>
      )}
    </div>
  );
}
