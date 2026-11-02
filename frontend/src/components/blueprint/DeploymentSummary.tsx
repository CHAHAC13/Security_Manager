import { DEPLOYMENT_ENVIRONMENTS, deploymentScheduleLabel } from '@/lib/deployment';
import type { BlueprintDeploymentData } from '@/types/blueprint';

export function DeploymentSummary({ data }: { data: BlueprintDeploymentData }) {
  return (
    <section aria-labelledby="deployment-summary-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 id="deployment-summary-heading" className="text-sm font-semibold text-slate-900">Deployment</h2>
      <dl className="space-y-3 text-sm">
        {DEPLOYMENT_ENVIRONMENTS.map(({ key, label }) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[100px_1fr]">
            <dt className="font-medium text-slate-700">{label}</dt>
            <dd className="text-slate-600">{deploymentScheduleLabel(data.environments[key], data.timeZone)}</dd>
          </div>
        ))}
        <div className="grid gap-1 sm:grid-cols-[100px_1fr]">
          <dt className="font-medium text-slate-700">Notifications</dt>
          <dd className="text-slate-600">
            Requestor: {data.notifyRequestor ? 'On' : 'Off'}; Approvers: {data.notifyApprovers ? 'On' : 'Off'} (deployment success/failure)
          </dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">All environments use the same approved blueprint version. Deployment starts only after required approvals, according to each environment&apos;s strategy.</p>
    </section>
  );
}
