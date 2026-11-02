import { AlertTriangle } from 'lucide-react';
import type { ApproverRole } from '@/lib/approvers';

interface Props {
  incompleteRoles: ApproverRole[];
  totalRoles: number;
  onSelectRole: (roleId: string) => void;
}

/** Summary of roles still missing mandatory approvers, with click-to-scroll links. */
export function ValidationBanner({ incompleteRoles, totalRoles, onSelectRole }: Props) {
  if (!incompleteRoles.length) return null;
  return (
    <section aria-labelledby="approver-validation-heading" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <h3 id="approver-validation-heading" className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {incompleteRoles.length} of {totalRoles} {totalRoles === 1 ? 'role is' : 'roles are'} missing required approvers
      </h3>
      <p className="mt-1 text-xs">Every role needs at least one Technical/System Owner and one Domain/Business Owner before you can continue.</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {incompleteRoles.map((role) => (
          <li key={role.id}>
            <button type="button" onClick={() => onSelectRole(role.id)}
              className="rounded border border-rose-300 bg-white px-2 py-0.5 font-mono text-xs text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400">
              {role.roleName || '(unnamed role)'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
