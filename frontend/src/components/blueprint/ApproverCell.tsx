import type { KeyboardEvent } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { UserPickerTypeahead } from './UserPickerTypeahead';
import { TECHNICAL_OWNERS } from '@/config/approverConfig';
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

/** Selected approvers with fixed technical choices or business directory search. */
export function ApproverCell({ contextLabel, type, approvers, service, onAdd, onRemove, error, rules = DEFAULT_APPROVER_RULES }: Props) {
  const typeLabel = APPROVER_TYPE_LABELS[type];
  const atMax = approvers.length >= rules.maxPerType;

  function onChipKeyDown(event: KeyboardEvent<HTMLButtonElement>, approverId: string) {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      onRemove(approverId);
    }
  }

  return (
    <div className="space-y-2">
      {type === 'business' && approvers.length > 0 && (
        <ul aria-label={`${typeLabel}s for ${contextLabel}`} className="flex flex-wrap gap-1.5">
          {approvers.map((approver) => (
            <li key={approver.id}
              title={`${approver.email}${approver.department ? ` · ${approver.department}` : ''}`}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-sky-800">
              {approver.displayName}
              <button
                type="button"
                aria-label={`Remove ${approver.displayName} as ${typeLabel} for ${contextLabel}`}
                onClick={() => onRemove(approver.id)}
                onKeyDown={(event) => onChipKeyDown(event, approver.id)}
                className="rounded-full p-0.5 text-sky-600 hover:bg-sky-100 hover:text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {type === 'technical' ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">Select {typeLabel}s for {contextLabel}</legend>
          {TECHNICAL_OWNERS.map((owner) => {
            const selected = approvers.find((person) => person.email.toLowerCase() === owner.email.toLowerCase());
            return (
              <label key={owner.id} className="flex items-start gap-2 break-all text-xs text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={Boolean(selected)} disabled={!selected && atMax}
                  onChange={() => selected ? onRemove(selected.id) : onAdd(owner)} />
                {owner.email}
              </label>
            );
          })}
        </fieldset>
      ) : <UserPickerTypeahead
        label={`Search directory for ${typeLabel} of ${contextLabel}`}
        service={service}
        excludeIds={approvers.map((approver) => approver.id)}
        onSelect={onAdd}
        disabled={atMax}
        placeholder={atMax ? `Maximum of ${rules.maxPerType} reached` : 'Search Directory'}
      />}
      {error && (
        <p className="flex items-start gap-1 text-xs text-rose-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}
