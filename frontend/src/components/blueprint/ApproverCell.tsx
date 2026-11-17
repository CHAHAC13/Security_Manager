import { AlertCircle } from 'lucide-react';
import { DUMMY_BUSINESS_OWNERS } from '@/config/approverConfig';
import { APPROVER_TYPE_LABELS, DEFAULT_APPROVER_RULES, type ApproverRules } from '@/lib/approvers';
import type { ApproverService } from '@/services/approverService';
import type { Approver, ApproverType } from '@/types/blueprint';

interface Props {
  /** Context used in accessible names, e.g. the role name. */
  contextLabel: string;
  type: ApproverType;
  approvers: Approver[];
  service: ApproverService;
  onAdd: (approver: Approver) => void;
  onRemove: (approverId: string) => void;
  error?: string;
  rules?: ApproverRules;
}

/** Selected approvers chosen from fixed technical owners or placeholder business owners. */
export function ApproverCell({ contextLabel, type, approvers, onAdd, onRemove, error, rules = DEFAULT_APPROVER_RULES }: Props) {
  const typeLabel = APPROVER_TYPE_LABELS[type];
  const atMax = approvers.length >= rules.maxPerType;
  const owners: readonly Approver[] = type === 'technical' ? rules.technicalOwners ?? [] : [
    ...DUMMY_BUSINESS_OWNERS,
    // Keep previously assigned owners (e.g. loaded from an existing role) visible and removable.
    ...approvers.filter((person) => !DUMMY_BUSINESS_OWNERS.some((owner) => owner.id === person.id)),
  ];

  return (
    <div className="space-y-2">
      <fieldset className="space-y-2">
        <legend className="sr-only">Select {typeLabel}s for {contextLabel}</legend>
        {owners.map((owner) => {
          const selected = approvers.find((person) => type === 'technical'
            ? person.email.toLowerCase() === owner.email.toLowerCase() : person.id === owner.id);
          return (
            <label key={owner.id} className="flex items-start gap-2 break-all text-xs text-slate-700"
              title={type === 'business' && owner.department ? `${owner.displayName} · ${owner.department}` : undefined}>
              <input type="checkbox" className="mt-0.5" checked={Boolean(selected)} disabled={!selected && atMax}
                onChange={() => selected ? onRemove(selected.id) : onAdd(owner)} />
              {type === 'business' ? `${owner.displayName} (${owner.email})` : owner.email}
            </label>
          );
        })}
      </fieldset>
      {error && (
        <p className="flex items-start gap-1 text-xs text-rose-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}
