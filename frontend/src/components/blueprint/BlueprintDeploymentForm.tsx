import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Bell, CalendarClock } from 'lucide-react';
import { DEPLOYMENT_ENVIRONMENTS, setDeploymentDateTime, setDeploymentStrategy, validateDeployment } from '@/lib/deployment';
import type { BlueprintDeploymentData, DeploymentStrategy } from '@/types/blueprint';

export interface DeploymentFormHandle {
  validate: () => boolean;
}

interface Props {
  data: BlueprintDeploymentData;
  onChange: (data: BlueprintDeploymentData) => void;
  ref?: Ref<DeploymentFormHandle>;
}

const inputClass = 'block h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500';

export function BlueprintDeploymentForm({ data, onChange, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateDeployment(data) : {};
  useImperativeHandle(ref, () => ({
    validate() {
      setAttempted(true);
      if (!Object.keys(validateDeployment(data)).length) return true;
      requestAnimationFrame(() => {
        const field = container.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        field?.focus();
      });
      return false;
    },
  }));

  return (
    <div ref={container} className="space-y-5">
      <section aria-labelledby="environment-scheduling-heading" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 id="environment-scheduling-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarClock className="h-4 w-4 text-sky-600" aria-hidden="true" />Environment Scheduling
        </h2>
        <p id="deployment-timing-help" className="mt-2 text-xs text-slate-500">
          Immediate means after all required blueprint approvals are complete, not now. Scheduled deployments also require approval.
          Prd cannot precede Dev or Stg; equal scheduled times are allowed.
        </p>
        <p id="deployment-timezone" className="mt-2 text-xs text-slate-500">Date / Time uses your local timezone: {data.timeZone}. UTC timestamps are retained with the blueprint.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Deployment schedule per environment</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr><th scope="col" className="px-4 py-3">Environment</th><th scope="col" className="px-4 py-3">Deployment Strategy</th><th scope="col" className="px-4 py-3">Date / Time</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DEPLOYMENT_ENVIRONMENTS.map(({ key, label }) => {
                const config = data.environments[key];
                const error = errors[key];
                const strategyId = `deployment-${key}-strategy`;
                const dateId = `deployment-${key}-date`;
                return (
                  <tr key={key}>
                    <th scope="row" className="px-4 py-4 align-top font-medium text-slate-900">{label}</th>
                    <td className="px-4 py-4 align-top">
                      <label htmlFor={strategyId} className="sr-only">{label} Deployment Strategy</label>
                      <select id={strategyId} value={config.strategy} aria-required="true" aria-invalid={Boolean(error?.strategy)}
                        aria-describedby={error?.strategy ? `${strategyId}-error` : 'deployment-timing-help'}
                        onChange={(event) => onChange(setDeploymentStrategy(data, key, event.target.value as DeploymentStrategy))}
                        className={inputClass}>
                        {config.strategy === '' && <option value="" disabled>Select strategy</option>}
                        <option value="immediate">Immediate</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                      {error?.strategy && <p id={`${strategyId}-error`} className="mt-1 text-xs text-rose-700">{error.strategy}</p>}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <label htmlFor={dateId} className="sr-only">{label} Date / Time</label>
                      <input id={dateId} type="datetime-local" step="60" value={config.scheduledDateTime}
                        disabled={config.strategy !== 'scheduled'} required={config.strategy === 'scheduled'}
                        aria-invalid={Boolean(error?.scheduledDateTime)}
                        aria-describedby={`deployment-timezone${error?.scheduledDateTime ? ` ${dateId}-error` : ''}`}
                        onChange={(event) => onChange(setDeploymentDateTime(data, key, event.target.value))}
                        className={inputClass} />
                      {config.strategy === 'immediate' && <p className="mt-1 text-xs text-slate-400">-- (not applicable)</p>}
                      {error?.scheduledDateTime && <p id={`${dateId}-error`} className="mt-1 text-xs text-rose-700">{error.scheduledDateTime}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="deployment-notifications-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 id="deployment-notifications-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Bell className="h-4 w-4 text-sky-600" aria-hidden="true" />Notification Settings
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={data.notifyRequestor} onChange={(event) => onChange({ ...data, notifyRequestor: event.target.checked })} />
          Notify Requestor on Deployment Success/Failure
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={data.notifyApprovers} onChange={(event) => onChange({ ...data, notifyApprovers: event.target.checked })} />
          Notify Approvers on Deployment Success/Failure
        </label>
        <p className="text-xs text-slate-500">These settings configure future outcome notifications. This screen does not deploy changes or send notifications.</p>
      </section>
    </div>
  );
}
