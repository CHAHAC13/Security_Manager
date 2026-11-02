import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Toast } from '@/components/ui/Toast';
import { ApplyToAllModal } from './ApplyToAllModal';
import { ApproverTable } from './ApproverTable';
import { ValidationBanner } from './ValidationBanner';
import { useApprovers } from '@/hooks/useApprovers';
import { rolesRequiringApproval } from '@/lib/permissions';
import {
  DEFAULT_APPROVER_RULES, applyToAll, approverRowId, approversFor, describeRoleScope, filterApproverRoles, incompleteRoles,
  setRoleApprovers, validateApprovers, type ApplyToAllOptions, type ApproverRole, type ApproverRules, type RoleFilter,
} from '@/lib/approvers';
import { cn } from '@/lib/utils';
import { approverService, type ApproverService } from '@/services/approverService';
import { permissionsService, type PermissionsService } from '@/services/permissionsService';
import type { ApproverType, BlueprintApproversData, BlueprintObjectsData, RoleApprovers, RoleAssignment } from '@/types/blueprint';

interface Props {
  /** All role assignments from Permissions; only changed/new roles require approval. */
  roles: RoleAssignment[];
  objectsData: BlueprintObjectsData;
  data: BlueprintApproversData;
  onChange: (data: BlueprintApproversData) => void;
  blueprintId: string;
  onBack: () => void;
  onReadyChange: (ready: boolean) => void;
  service?: ApproverService;
  permissions?: PermissionsService;
  rules?: ApproverRules;
}

const FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Missing approvers' },
  { value: 'new', label: 'New' },
  { value: 'existing', label: 'Existing' },
];

export function BlueprintApproversForm({
  roles, objectsData, data, onChange, blueprintId, onBack, onReadyChange,
  service = approverService, permissions = permissionsService, rules = DEFAULT_APPROVER_RULES,
}: Props) {
  const loadScopeObjects = useCallback(() => permissions.getSelectedObjects(objectsData), [permissions, objectsData]);
  const approvalRoles = useMemo(() => rolesRequiringApproval(roles), [roles]);
  const { objects, loading, error, retry } = useApprovers(approvalRoles, data, onChange, blueprintId, service, loadScopeObjects);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [modal, setModal] = useState<{ initial?: RoleApprovers; type?: ApproverType } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const approverRoles = useMemo<ApproverRole[]>(() => approvalRoles.map((role) => ({
    id: role.id, roleName: role.roleName, status: role.status, scope: describeRoleScope(role.scopeObjectId, objects),
  })), [approvalRoles, objects]);
  const validation = useMemo(() => validateApprovers(approverRoles, data, rules), [approverRoles, data, rules]);
  const incomplete = useMemo(() => incompleteRoles(approverRoles, data, rules), [approverRoles, data, rules]);
  const visibleRoles = useMemo(() => filterApproverRoles(approverRoles, data, query, filter, rules), [approverRoles, data, query, filter, rules]);
  const completeCount = approverRoles.length - incomplete.length;
  const ready = !loading && !error && roles.length > 0 && incomplete.length === 0;
  useEffect(() => { onReadyChange(ready); return () => onReadyChange(false); }, [onReadyChange, ready]);

  function scrollToRole(roleId: string) {
    if (!visibleRoles.some((role) => role.id === roleId)) { setFilter('all'); setQuery(''); }
    requestAnimationFrame(() => {
      const row = document.getElementById(approverRowId(roleId));
      row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      (row?.querySelector<HTMLElement>('input:not([disabled])') ?? row)?.focus();
    });
  }

  function apply(options: ApplyToAllOptions) {
    const result = applyToAll(data, approvalRoles.map((role) => role.id), options, rules);
    onChange(result.data);
    setModal(null);
    const count = result.updatedRoleIds.length;
    setToast(`Approvers applied to ${count} ${count === 1 ? 'role' : 'roles'}`);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex items-center gap-1 text-xs text-slate-500">
            <li>Blueprints</li>
            <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
            <li>Create Blueprint</li>
            <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
            <li aria-current="page" className="font-medium text-slate-700">Approvers</li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Users className="h-4 w-4 text-sky-600" aria-hidden="true" />Assign Approvers</h2>
            <p className="mt-1 text-sm text-slate-500">Only new roles and roles with permission or Request Manager changes require a Technical/System Owner and a Domain/Business Owner.</p>
          </div>
          {!loading && !error && approverRoles.length > 0 && (
            <div className="flex items-center gap-3">
              <p role="status" aria-live="polite" className={cn('text-sm font-medium', incomplete.length ? 'text-amber-700' : 'text-emerald-700')}>
                {completeCount} of {approverRoles.length} roles complete
              </p>
              <Button type="button" onClick={() => setModal({})}>Apply to All Roles</Button>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div role="status" aria-label="Loading approvers" className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          {[0, 1, 2].map((row) => (
            <div key={row} className="grid animate-pulse grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="h-4 rounded bg-slate-200" /><div className="h-8 rounded bg-slate-100" />
              <div className="h-8 rounded bg-slate-100" /><div className="h-4 w-20 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <span>{error}</span><Button type="button" onClick={retry}>Retry</Button>
        </div>
      )}

      {!loading && !error && approverRoles.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="mb-4 text-sm text-slate-500">
            {roles.length ? 'No changes require approval. Continue to Deployment, or return to Permissions to make changes.'
              : 'This blueprint has no roles yet. Add role assignments before assigning approvers.'}
          </p>
          <Button type="button" onClick={onBack}>Back to Permissions</Button>
        </div>
      )}

      {!loading && !error && approverRoles.length > 0 && (
        <>
          <ValidationBanner incompleteRoles={incomplete} totalRoles={approverRoles.length} onSelectRole={scrollToRole} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search roles by name" className="w-full sm:w-72" />
            <div role="group" aria-label="Filter roles" className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    filter === item.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                  )}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {visibleRoles.length ? (
            <ApproverTable roles={visibleRoles} data={data} validation={validation} service={service} rules={rules}
              onRoleChange={(roleId, entry) => onChange(setRoleApprovers(data, roleId, entry))}
              onCopyToAll={approverRoles.length > 1 ? (roleId, type) => setModal({ initial: approversFor(data, roleId), type }) : undefined} />
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No roles match the current search or filter.</p>
          )}
        </>
      )}

      {modal && (
        <ApplyToAllModal data={data} roleIds={approvalRoles.map((role) => role.id)} service={service} rules={rules}
          initial={modal.initial} type={modal.type} onApply={apply} onClose={() => setModal(null)} />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}
