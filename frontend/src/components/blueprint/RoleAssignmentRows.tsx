import { useId } from 'react';
import { ChevronDown, Database, Eye, FolderTree, Layers, SquareFunction, Table2, Trash2, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { ResourcePermissionCell } from './ResourcePermissionCell';
import { activeRequestManager, permissionChanges, refreshRole, requestManagerChanges, roleNamePrefix, scopeOptions, scopedObjects } from '@/lib/permissions';
import type { PermissionEnvironment, PermissionMetadata, PermissionObject, PermissionObjectType, RoleAssignment, RoleErrors, RoleField, RoleLevel } from '@/types/blueprint';

interface Props {
  role: RoleAssignment;
  groupNumber: number;
  objects: PermissionObject[];
  metadata: PermissionMetadata;
  environment: PermissionEnvironment;
  errors: RoleErrors;
  expanded: boolean;
  onToggle: () => void;
  onChange: (role: RoleAssignment) => void;
  onRemove: () => void;
}

const inputClass = 'mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500';
const cellClass = 'border-r border-slate-200 px-4 py-4 align-top';
const levelLabels: Record<RoleLevel, string> = { CATALOG: 'Catalog', SCHEMA: 'Schema', OBJECT: 'Object' };
type ResourceType = PermissionObjectType | RoleLevel;
const resourceTypes: Record<ResourceType, { variant: BadgeVariant; icon: LucideIcon }> = {
  CATALOG: { variant: 'blue', icon: Database },
  SCHEMA: { variant: 'amber', icon: FolderTree },
  OBJECT: { variant: 'slate', icon: Layers },
  TABLE: { variant: 'emerald', icon: Table2 },
  VIEW: { variant: 'emerald', icon: Eye },
  FUNCTION: { variant: 'slate', icon: SquareFunction },
};

function ResourceTypeBadge({ type, label = type }: { type: ResourceType; label?: string }) {
  const { variant, icon: Icon } = resourceTypes[type];
  return <Badge variant={variant} pill className="gap-1.5 whitespace-nowrap font-semibold">
    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
    {label}
  </Badge>;
}

export function RoleAssignmentRows({ role, groupNumber, objects, metadata, environment, errors, expanded, onToggle, onChange, onRemove }: Props) {
  const accessId = useId();
  const changes = permissionChanges(role);
  const grants = changes.filter((change) => change.changeType === 'GRANT').length;
  const revokes = changes.filter((change) => change.changeType === 'REVOKE').length;
  const rmChanges = requestManagerChanges(role);
  const existing = role.status === 'EXISTING';
  const roleType = metadata.roleTypes.find((type) => type.code === role.roleTypeCode)?.label ?? role.roleTypeCode;
  const scoped = scopedObjects(role, objects);
  const scope = scoped.find((object) => object.objectId === role.scopeObjectId);
  const descendants = scoped.filter((object) => object.objectId !== role.scopeObjectId);
  const rows: (PermissionObject | null)[] = scope ? [scope, ...descendants] : [null];
  const rowSpan = rows.length;
  const fieldId = (field: string) => `${role.id}-${field}`;
  const accessibility = (field: RoleField) => ({
    id: fieldId(field), 'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? fieldId(`${field}-error`) : undefined,
  });
  const error = (field: RoleField) => errors[field]
    ? <p id={fieldId(`${field}-error`)} className="mt-1 text-xs text-rose-700">{errors[field]}</p> : null;
  const updateScope = (patch: Partial<RoleAssignment>) => onChange(refreshRole({ ...role, ...patch }, objects, environment));

  return <tbody aria-label={`Role assignment: ${role.roleName || 'Untitled role'}`}
    className={`border-t-2 border-slate-300 first:border-t-0 ${groupNumber % 2 === 0 ? 'bg-sky-50/60' : 'bg-white'}`}>
    {rows.map((object, index) => <tr key={object?.objectId ?? 'no-scope'}
      id={index > 0 ? `${accessId}-${index}` : undefined} hidden={index > 0 && !expanded}
      className="border-b border-slate-200 last:border-b-0">
      {index === 0 && <>
        <td rowSpan={rowSpan} className={`${cellClass} border-l-4 border-l-sky-500`}>
          {existing ? <>
            <p {...accessibility('level')} tabIndex={errors.level ? -1 : undefined}>
              <ResourceTypeBadge type={role.level} label={levelLabels[role.level]} />
            </p>
            {error('level')}
            <p {...accessibility('scopeObjectId')} tabIndex={errors.scopeObjectId ? -1 : undefined} className="mt-2 break-all text-slate-500">
              Scope: {objects.find((item) => item.objectId === role.scopeObjectId)?.objectName || 'Unavailable'}
            </p>
            {error('scopeObjectId')}
          </> : <div className="space-y-3">
            <div>
              <label htmlFor={fieldId('level')} className="font-medium text-slate-600">Level *</label>
              <select {...accessibility('level')} value={role.level}
                onChange={(event) => updateScope({ level: event.target.value as RoleLevel, scopeObjectId: '' })} className={inputClass}>
                <option value="CATALOG">Catalog</option><option value="SCHEMA">Schema</option><option value="OBJECT">Object</option>
              </select>{error('level')}
            </div>
            <div>
              <label htmlFor={fieldId('scopeObjectId')} className="font-medium text-slate-600">Role scope *</label>
              <select {...accessibility('scopeObjectId')} value={role.scopeObjectId}
                onChange={(event) => updateScope({ scopeObjectId: event.target.value })} className={inputClass}>
                <option value="">Select scope</option>
                {scopeOptions(role.level, objects).map((item) => <option key={item.objectId} value={item.objectId}>{item.objectName}</option>)}
              </select>{error('scopeObjectId')}
            </div>
          </div>}
        </td>
        <th scope="rowgroup" rowSpan={rowSpan} className={`${cellClass} text-left font-normal`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Role group {String(groupNumber).padStart(2, '0')}</span>
            <Badge variant={existing ? 'blue' : 'emerald'}>{existing ? 'Existing' : 'New'}</Badge>
          </div>
          {existing ? <>
            <p {...accessibility('roleName')} tabIndex={errors.roleName ? -1 : undefined} className="break-all font-mono font-semibold text-slate-900">{role.roleName}</p>
            {error('roleName')}
            <p {...accessibility('roleTypeCode')} tabIndex={errors.roleTypeCode ? -1 : undefined} className="mt-2 text-slate-500">{roleType}</p>
            {error('roleTypeCode')}
          </> : <div className="space-y-3">
            <div>
              <label htmlFor={fieldId('roleTypeCode')} className="font-medium text-slate-600">Role Type *</label>
              <select {...accessibility('roleTypeCode')} value={role.roleTypeCode}
                onChange={(event) => updateScope({ roleTypeCode: event.target.value })} className={inputClass}>
                <option value="">Select role type</option>
                {metadata.roleTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
              </select>{error('roleTypeCode')}
            </div>
            <div>
              <label htmlFor={fieldId('roleName')} className="font-medium text-slate-600">Role Name *</label>
              <input {...accessibility('roleName')} value={role.roleName}
                placeholder={role.level === 'CATALOG' ? 'dbx-<env>-gpd-<role>-<catalog>' : undefined}
                title={`Prefix: ${roleNamePrefix(environment, role.roleTypeCode)}. Generated names are not truncated.`}
                onChange={(event) => onChange({ ...role, roleName: event.target.value, roleNameManuallyEdited: true })}
                className={`${inputClass} font-mono`} />
              <div className="mt-1 flex justify-between gap-2 text-[10px]">
                <span className="text-slate-500">{role.roleNameManuallyEdited ? 'Custom name' : 'Auto-generated (editable)'}</span>
                <span className={role.roleName.length > 32 ? 'text-rose-700' : 'text-slate-500'}>{role.roleName.length}/32</span>
              </div>
              {error('roleName')}
            </div>
          </div>}
          {(grants > 0 || revokes > 0) && <p className="mt-3 text-[10px] font-medium text-sky-700">+{grants} granted, -{revokes} revoked</p>}
          <div {...accessibility('objectPermissions')} tabIndex={errors.objectPermissions ? -1 : undefined}>{error('objectPermissions')}</div>
        </th>
      </>}
      <td className={cellClass}>
        {object ? <div className="space-y-2">
          <p className="break-all font-mono font-medium text-slate-900">{object.objectName}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ResourceTypeBadge type={object.objectType} />
            <Badge variant={object.status === 'NEW' ? 'emerald' : 'slate'}>{object.status === 'NEW' ? 'New' : 'Existing'}</Badge>
          </div>
          {object.parentId && <p className="break-all text-[10px] text-slate-400">In {objects.find((item) => item.objectId === object.parentId)?.objectName}</p>}
          {index === 0 && descendants.length > 0 && <button type="button"
            aria-label={`${role.level === 'CATALOG' ? 'Schema and object' : 'Object'} access for ${role.roleName || 'Untitled role'}`}
            aria-expanded={expanded} aria-controls={descendants.map((_, childIndex) => `${accessId}-${childIndex + 1}`).join(' ')}
            onClick={onToggle}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-left text-[11px] font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            <span>
              {role.level === 'CATALOG' ? 'Schema & object access' : 'Object access'}
              <span className="mt-0.5 block text-[10px] font-normal text-sky-700">{descendants.length} {descendants.length === 1 ? 'resource' : 'resources'}</span>
            </span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          </button>}
        </div> : <p className="text-slate-400">Select a role scope to view objects.</p>}
      </td>
      <td className={cellClass}>
        {object ? <ResourcePermissionCell object={object} role={role} metadata={metadata} onChange={onChange} />
          : <span className="text-slate-400">No scope selected</span>}
      </td>
      {index === 0 && <>
        <td rowSpan={rowSpan} className={cellClass}>
          <fieldset>
            <legend className="sr-only">Available in Request Manager</legend>
            <div className="flex flex-wrap gap-3">
              {[true, false].map((enabled) => <label key={String(enabled)} className="flex items-center gap-1.5 text-slate-600">
                <input type="radio" name={fieldId('requestManager')} value={enabled ? 'yes' : 'no'}
                  checked={role.requestManager.enabled === enabled}
                  onChange={() => onChange({
                    ...role, requestManager: { ...role.requestManager, ...activeRequestManager({ ...role.requestManager, enabled }) },
                  })} className="border-slate-300 text-sky-600" />
                {enabled ? 'Yes' : 'No'}
              </label>)}
            </div>
          </fieldset>
          {existing && rmChanges.length > 0 && <p className="mt-3 text-[10px] text-amber-700">Changed: {rmChanges.map((field) => field === 'enabled' ? 'availability' : field === 'formType' ? 'form type' : 'display name').join(', ')}</p>}
        </td>
        <td rowSpan={rowSpan} className={cellClass}>
          {role.requestManager.enabled ? <>
            <label htmlFor={fieldId('formType')} className="sr-only">Form Type *</label>
            <select {...accessibility('formType')} value={role.requestManager.formType}
              onChange={(event) => onChange({ ...role, requestManager: { ...role.requestManager, formType: event.target.value } })} className={inputClass}>
              <option value="">Select form type</option>
              {metadata.formTypes.map((form) => <option key={form.code} value={form.code}>{form.label}</option>)}
            </select>{error('formType')}
          </> : <span className="text-slate-400">Not applicable</span>}
        </td>
        <td rowSpan={rowSpan} className={cellClass}>
          {role.requestManager.enabled ? <>
            <label htmlFor={fieldId('displayName')} className="sr-only">Display Name *</label>
            <input {...accessibility('displayName')} value={role.requestManager.displayName}
              onChange={(event) => onChange({ ...role, requestManager: { ...role.requestManager, displayName: event.target.value } })} className={inputClass} />
            {error('displayName')}
          </> : <span className="text-slate-400">Not applicable</span>}
        </td>
        <td rowSpan={rowSpan} className="px-3 py-4 align-top">
          <button type="button" onClick={onRemove} aria-label={existing ? 'Remove from blueprint' : 'Remove'}
            title={existing ? 'Remove from blueprint' : 'Remove'}
            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </td>
      </>}
    </tr>)}
  </tbody>;
}
