import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ApproverCell } from './ApproverCell';
import {
  APPROVER_TYPES, APPROVER_TYPE_LABELS, DEFAULT_APPROVER_RULES, addApprover, emptyRoleApprovers, removeApprover, rolesLosingApprovers, validateRoleApprovers,
  type ApplyToAllOptions, type ApproverRules,
} from '@/lib/approvers';
import type { ApproverService } from '@/services/approverService';
import type { ApproverType, BlueprintApproversData, RoleApprovers } from '@/types/blueprint';

interface Props {
  data: BlueprintApproversData;
  roleIds: string[];
  service: ApproverService;
  onApply: (options: ApplyToAllOptions) => void;
  onClose: () => void;
  /** Pre-selected approvers, e.g. from a row's "Copy to all". */
  initial?: RoleApprovers;
  type?: ApproverType;
  rules?: ApproverRules;
}

export function ApplyToAllModal({ data, roleIds, service, onApply, onClose, initial, type, rules = DEFAULT_APPROVER_RULES }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<RoleApprovers>(() => structuredClone(initial ?? emptyRoleApprovers()));
  const [mode, setMode] = useState<ApplyToAllOptions['mode']>('add');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const options: ApplyToAllOptions = {
    technical: type === 'business' ? [] : selection.technical,
    business: type === 'technical' ? [] : selection.business,
    mode, onlyMissing,
  };
  const empty = !options.technical.length && !options.business.length;
  const technicalError = options.technical.length ? validateRoleApprovers(options, rules).errors.technical : undefined;

  function update(next: RoleApprovers) {
    setSelection(next);
    setConfirming(false);
  }

  function submit() {
    if (empty || technicalError) return;
    if (mode === 'replace' && !confirming) {
      const affected = rolesLosingApprovers(data, roleIds, options, rules);
      if (affected.length) { setConfirming(true); return; }
    }
    onApply(options);
  }

  const losing = confirming ? rolesLosingApprovers(data, roleIds, options, rules).length : 0;

  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="apply-all-heading"
      className="w-full max-w-xl space-y-5 overflow-visible rounded-xl border border-slate-200 p-6 shadow-xl backdrop:bg-slate-900/40">
      <div>
        <h3 id="apply-all-heading" className="text-base font-semibold text-slate-900">
          {type ? `Apply ${APPROVER_TYPE_LABELS[type]}s to All Roles` : 'Apply Approvers to All Roles'}
        </h3>
        <p className="mt-1 text-xs text-slate-500">Selected approvers are applied to {roleIds.length} {roleIds.length === 1 ? 'role' : 'roles'} in this blueprint.</p>
        {type && <p className="mt-1 text-xs text-slate-500">Other owner assignments will not change.</p>}
      </div>
      {(type ? [type] : APPROVER_TYPES).map((type) => (
        <div key={type}>
          <p className="mb-1 text-xs font-semibold text-slate-600">{APPROVER_TYPE_LABELS[type]}</p>
          <ApproverCell contextLabel="all roles" type={type} approvers={selection[type]} service={service} rules={rules}
            error={type === 'technical' ? technicalError : undefined}
            onAdd={(approver) => { const outcome = addApprover(selection, type, approver, rules); if (outcome.added) update(outcome.entry); }}
            onRemove={(id) => update(removeApprover(selection, type, id))} />
        </div>
      ))}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-600">Mode</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="apply-mode" value="add" checked={mode === 'add'}
            onChange={() => { setMode('add'); setConfirming(false); }} />
          Add to existing
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="apply-mode" value="replace" checked={mode === 'replace'}
            onChange={() => { setMode('replace'); setConfirming(false); }} />
          Replace existing
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={onlyMissing} onChange={(event) => { setOnlyMissing(event.target.checked); setConfirming(false); }} />
        Only roles missing approvers
      </label>
      {confirming && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>This will remove existing approvers from {losing} {losing === 1 ? 'role' : 'roles'}. Select "Confirm replace" to continue.</span>
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="primary" disabled={empty || Boolean(technicalError)} onClick={submit}>
          {confirming ? 'Confirm replace' : 'Apply'}
        </Button>
      </div>
    </dialog>
  );
}
