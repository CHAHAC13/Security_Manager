import { CheckCircle, Info, Lock, ShieldCheck } from 'lucide-react';
import type { BlueprintSetupData } from '@/types/blueprint';

interface BlueprintSetupFormProps {
  data: BlueprintSetupData;
  onChange: (data: BlueprintSetupData) => void;
}

/**
 * Step 1 — Blueprint Setup form with a sidebar guide.
 * Collects name, version (read-only), description, and business justification.
 */
export function BlueprintSetupForm({ data, onChange }: BlueprintSetupFormProps) {
  const updateField = <K extends keyof BlueprintSetupData>(
    field: K,
    value: BlueprintSetupData[K],
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ── Left: Form Card ── */}
      <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        {/* Section header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            Blueprint Details
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            DRAFT
          </span>
        </div>

        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          {/* Name & Version row */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-9">
              <label
                htmlFor="bp-name"
                className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Blueprint Name <span className="text-red-500">*</span>
              </label>
              <input
                id="bp-name"
                type="text"
                value={data.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. corp-analytics-prod-isolated"
                className="w-full h-9 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 placeholder:text-slate-400"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                Version
              </label>
              <div className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between text-sm text-slate-500 font-mono">
                <span>{data.version}</span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="bp-desc"
                className="block text-xs font-medium text-slate-500 uppercase tracking-wider"
              >
                Description <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Markdown supported</span>
            </div>
            <textarea
              id="bp-desc"
              value={data.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Specify scope of assets, authorized compute pools, and runtime security baseline..."
              rows={4}
              className="w-full min-h-[110px] p-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 placeholder:text-slate-400 resize-y"
            />
          </div>

          {/* Business Justification */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="bp-justification"
                className="block text-xs font-medium text-slate-500 uppercase tracking-wider"
              >
                Business Justification <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Required for SecOps audit</span>
            </div>
            <textarea
              id="bp-justification"
              value={data.businessJustification}
              onChange={(e) => updateField('businessJustification', e.target.value)}
              placeholder="Explain why this access blueprint is required, expected workload lifecycle, and sponsoring team..."
              rows={4}
              className="w-full min-h-[110px] p-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 placeholder:text-slate-400 resize-y"
            />
          </div>
        </form>
      </div>

      {/* ── Right: Setup Guide Sidebar ── */}
      <div className="lg:col-span-4 xl:col-span-3">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
            <Info className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Setup Guide</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Choose a clear, unique name that identifies the target workspace and environment.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                The description should cover asset scope, compute pools, and the security baseline
                you intend to enforce.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Business justification is reviewed by SecOps during the approval workflow. Be
                specific about the sponsoring team and workload lifecycle.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
