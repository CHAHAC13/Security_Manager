import { AlertTriangle, CheckCircle2, Copy, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ApproverCell } from './ApproverCell';
import {
  APPROVER_TYPES, APPROVER_TYPE_LABELS, DEFAULT_APPROVER_RULES, addApprover, approverRowId, approversFor, removeApprover,
  type ApproverRole, type ApproverRules, type RoleApproverValidation,
} from '@/lib/approvers';
import { cn } from '@/lib/utils';
import type { ApproverService } from '@/services/approverService';
import type { ApproverType, BlueprintApproversData, RoleApprovers } from '@/types/blueprint';

interface Props {
  roles: ApproverRole[];
  data: BlueprintApproversData;
  validation: Record<string, RoleApproverValidation>;
  service: ApproverService;
  onRoleChange: (roleId: string, entry: RoleApprovers) => void;
  /** Copies only the chosen owner type; omitted when there is only one role. */
  onCopyToAll?: (roleId: string, type: ApproverType) => void;
  rules?: ApproverRules;
}

/** Roles × approver types grid. Collapses to stacked cards below the lg breakpoint. */
export function ApproverTable({ roles, data, validation, service, onRoleChange, onCopyToAll, rules = DEFAULT_APPROVER_RULES }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="block w-full text-sm lg:table">
        <caption className="sr-only">Approver assignments per role</caption>
        <thead className="hidden border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 lg:table-header-group">
          <tr>
            <th scope="col" className="w-[30%] px-4 py-3">Role Name</th>
            <th scope="col" className="px-4 py-3">{APPROVER_TYPE_LABELS.technical} <span className="text-rose-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></th>
            <th scope="col" className="px-4 py-3">{APPROVER_TYPE_LABELS.business} <span className="text-rose-600" aria-hidden="true">*</span><span className="sr-only">(required)</span></th>
            <th scope="col" className="w-36 px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="block divide-y divide-slate-100 lg:table-row-group">
          {roles.map((role) => {
            const entry = approversFor(data, role.id);
            const result = validation[role.id];
            const name = role.roleName || '(unnamed role)';
            return (
              <tr key={role.id} id={approverRowId(role.id)} tabIndex={-1}
                className={cn('block scroll-mt-24 p-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400 lg:table-row lg:p-0', !result?.complete && 'bg-rose-50/30')}>
                <th scope="row" className="block pb-3 text-left align-top font-normal lg:table-cell lg:px-4 lg:py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono text-xs font-medium text-slate-900">{name}</span>
                    <Badge pill variant={role.status === 'NEW' ? 'blue' : 'slate'}>{role.status === 'NEW' ? 'New' : 'Existing'}</Badge>
                    {role.scope && (
                      <span className="group relative inline-flex">
                        <span tabIndex={0} role="img" aria-label={`Scope: ${role.scope}`}
                          className="rounded text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500">
                          <Info className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span role="tooltip"
                          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] text-white shadow group-focus-within:block group-hover:block">
                          Scope: {role.scope}
                        </span>
                      </span>
                    )}
                  </div>
                </th>
                {APPROVER_TYPES.map((type) => (
                  <td key={type} className="block pb-3 align-top lg:table-cell lg:px-4 lg:py-3">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 lg:hidden">
                      {APPROVER_TYPE_LABELS[type]} <span className="text-rose-600">*</span>
                    </span>
                    <ApproverCell contextLabel={name} type={type} approvers={entry[type]} service={service} rules={rules}
                      error={result?.errors[type]}
                      onAdd={(approver) => {
                        const outcome = addApprover(entry, type, approver, rules);
                        if (outcome.added) onRoleChange(role.id, outcome.entry);
                      }}
                      onRemove={(approverId) => onRoleChange(role.id, removeApprover(entry, type, approverId))} />
                    {onCopyToAll && entry[type].length > 0 && (
                      <button type="button" onClick={() => onCopyToAll(role.id, type)}
                        aria-label={`Copy ${APPROVER_TYPE_LABELS[type]}s of ${name} to all roles`}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline">
                        <Copy className="h-3 w-3" aria-hidden="true" />Copy to all
                      </button>
                    )}
                  </td>
                ))}
                <td className="block align-top lg:table-cell lg:px-4 lg:py-3">
                  {result?.complete ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Complete
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />Incomplete
                    </span>
                  )}
                  {result?.warnings.map((warning) => (
                    <p key={warning} className="mt-1 text-[11px] text-amber-700">⚠ {warning}</p>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
