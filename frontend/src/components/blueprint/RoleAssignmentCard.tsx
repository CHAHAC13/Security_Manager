import { useRef } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ResourcePermissions } from './ResourcePermissions';
import { cn } from '@/lib/utils';
import { activeRequestManager, permissionChanges, refreshRole, requestManagerChanges, roleNamePrefix, scopeOptions } from '@/lib/permissions';
import type { PermissionEnvironment, PermissionMetadata, PermissionObject, RoleAssignment, RoleErrors, RoleField, RoleLevel } from '@/types/blueprint';

interface Props {
  role: RoleAssignment;
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
const levelLabels: Record<RoleLevel, string> = { CATALOG: 'Catalog', SCHEMA: 'Schema', OBJECT: 'Object' };

export function RoleAssignmentCard({ role, objects, metadata, environment, errors, expanded, onToggle, onChange, onRemove }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const changes = permissionChanges(role);
  const grants = changes.filter((change) => change.changeType === 'GRANT').length;
  const revokes = changes.filter((change) => change.changeType === 'REVOKE').length;
  const rmChanges = requestManagerChanges(role);
  const existing = role.status === 'EXISTING';
  const roleType = metadata.roleTypes.find((type) => type.code === role.roleTypeCode)?.label ?? role.roleTypeCode;
  const fieldId = (field: string) => `${role.id}-${field}`;
  const accessibility = (field: RoleField) => ({
    id: fieldId(field), 'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? fieldId(`${field}-error`) : undefined,
  });
  const error = (field: RoleField) => errors[field]
    ? <p id={fieldId(`${field}-error`)} className="mt-1 text-xs text-rose-700">{errors[field]}</p> : null;
  const updateScope = (patch: Partial<RoleAssignment>) => onChange(refreshRole({ ...role, ...patch }, objects, environment));
  return <section aria-label={`Role assignment: ${role.roleName || 'Untitled role'}`}
    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <h3 className="overflow-x-auto">
      <button ref={trigger} id={fieldId('trigger')} type="button" aria-label={`Role assignment: ${role.roleName || 'Untitled role'}`}
        aria-expanded={expanded} aria-controls={fieldId('body')} onClick={onToggle}
        className={cn('flex w-max min-w-full items-center gap-3 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500', expanded && 'bg-sky-50/50')}>
        <span className="min-w-32 max-w-80 flex-1 truncate font-mono text-xs font-semibold text-slate-900" title={role.roleName}>{role.roleName || 'Untitled role'}</span>
        <Badge variant={existing ? 'blue' : 'emerald'}>{existing ? 'Existing' : 'New'}</Badge>
        <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{levelLabels[role.level]} &middot; {roleType}</span>
        {(grants > 0 || revokes > 0) && <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">+{grants} granted, -{revokes} revoked</span>}
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} />
      </button>
    </h3>
    <div id={fieldId('body')} hidden={!expanded} className="space-y-5 border-t border-slate-200 p-4 sm:p-5"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
          trigger.current?.focus();
        }
      }}>
      {!existing && <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={fieldId('level')} className="text-xs font-medium text-slate-600">Level *</label>
          <select {...accessibility('level')} value={role.level}
            onChange={(event) => updateScope({ level: event.target.value as RoleLevel, scopeObjectId: '' })} className={inputClass}>
            <option value="CATALOG">Catalog</option><option value="SCHEMA">Schema</option><option value="OBJECT">Object</option>
          </select>{error('level')}
        </div>
        <div>
          <label htmlFor={fieldId('scopeObjectId')} className="text-xs font-medium text-slate-600">Role scope *</label>
          <select {...accessibility('scopeObjectId')} value={role.scopeObjectId}
            onChange={(event) => updateScope({ scopeObjectId: event.target.value })} className={inputClass}>
            <option value="">Select scope</option>
            {scopeOptions(role.level, objects).map((object) => <option key={object.objectId} value={object.objectId}>{object.objectName}</option>)}
          </select>{error('scopeObjectId')}
        </div>
        <div>
          <label htmlFor={fieldId('roleTypeCode')} className="text-xs font-medium text-slate-600">Role Type *</label>
          <select {...accessibility('roleTypeCode')} value={role.roleTypeCode}
            onChange={(event) => updateScope({ roleTypeCode: event.target.value })} className={inputClass}>
            <option value="">Select role type</option>
            {metadata.roleTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
          </select>{error('roleTypeCode')}
        </div>
        <div>
          <label htmlFor={fieldId('roleName')} className="text-xs font-medium text-slate-600">Role Name *</label>
          <input {...accessibility('roleName')} value={role.roleName}
            title={`Prefix: ${roleNamePrefix(environment, role.roleTypeCode)}. Generated names are not truncated.`}
            onChange={(event) => onChange({ ...role, roleName: event.target.value, roleNameManuallyEdited: true })} className={inputClass} />
          <span className={`mt-1 block text-right text-[10px] ${role.roleName.length > 32 ? 'text-rose-700' : 'text-slate-500'}`}>{role.roleName.length}/32</span>
          {error('roleName')}
        </div>
      </div>}
      {existing && <div className="space-y-2 text-xs text-slate-600">
        <p>Role Name</p>
        <p {...accessibility('roleName')} tabIndex={errors.roleName ? -1 : undefined} className="break-all font-mono text-slate-900">{role.roleName}</p>
        {error('roleName')}
        <p {...accessibility('scopeObjectId')} tabIndex={errors.scopeObjectId ? -1 : undefined}>Scope: {objects.find((object) => object.objectId === role.scopeObjectId)?.objectName || 'Unavailable'}</p>
        {error('scopeObjectId')}
        <div {...accessibility('level')} tabIndex={errors.level ? -1 : undefined}>{error('level')}</div>
        <div {...accessibility('roleTypeCode')} tabIndex={errors.roleTypeCode ? -1 : undefined}>{error('roleTypeCode')}</div>
      </div>}
      <section aria-label="Objects & Permissions" className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Objects &amp; Permissions</h4>
        <div {...accessibility('objectPermissions')} tabIndex={errors.objectPermissions ? -1 : undefined}>{error('objectPermissions')}</div>
        <ResourcePermissions objects={objects} role={role} metadata={metadata} onChange={onChange} />
      </section>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Request Manager</legend>
        {existing && rmChanges.length > 0 && <p className="text-xs text-amber-700">Changed: {rmChanges.map((field) => field === 'enabled' ? 'availability' : field === 'formType' ? 'form type' : 'display name').join(', ')}</p>}
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-slate-600">Available in Request Manager</legend>
          <div className="flex gap-5">
            {[true, false].map((enabled) => <label key={String(enabled)} className="flex items-center gap-2 text-xs text-slate-600">
              <input type="radio" name={fieldId('requestManager')} value={enabled ? 'yes' : 'no'}
                checked={role.requestManager.enabled === enabled}
                onChange={() => onChange({
                  ...role, requestManager: { ...role.requestManager, ...activeRequestManager({ ...role.requestManager, enabled }) },
                })} className="border-slate-300 text-sky-600" />
              {enabled ? 'Yes' : 'No'}
            </label>)}
          </div>
        </fieldset>
        {role.requestManager.enabled && <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldId('formType')} className="text-xs font-medium text-slate-600">Form Type *</label>
            <select {...accessibility('formType')} value={role.requestManager.formType}
              onChange={(event) => onChange({ ...role, requestManager: { ...role.requestManager, formType: event.target.value } })} className={inputClass}>
              <option value="">Select form type</option>
              {metadata.formTypes.map((form) => <option key={form.code} value={form.code}>{form.label}</option>)}
            </select>{error('formType')}
          </div>
          <div>
            <label htmlFor={fieldId('displayName')} className="text-xs font-medium text-slate-600">Display Name *</label>
            <input {...accessibility('displayName')} value={role.requestManager.displayName}
              onChange={(event) => onChange({ ...role, requestManager: { ...role.requestManager, displayName: event.target.value } })} className={inputClass} />
            {error('displayName')}
          </div>
        </div>}
      </fieldset>
      <Button type="button" onClick={onRemove} icon={<Trash2 className="h-3.5 w-3.5" />}>
        {existing ? 'Remove from blueprint' : 'Remove'}
      </Button>
    </div>
  </section>;
}
