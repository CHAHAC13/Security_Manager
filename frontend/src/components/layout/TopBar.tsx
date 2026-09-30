import { ShieldCheck } from 'lucide-react';

export function TopBar() {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20 shrink-0">
      <div className="flex items-center space-x-6">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            GPDIP Security Manager
          </span>
        </div>

        {/* Environment indicator */}
        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          Databricks workspace
        </div>
      </div>

      {/* User context */}
      <div className="flex items-center space-x-4">
        <div className="text-right">
          <div className="text-xs font-semibold text-slate-900">
            alex.miller@xyz{' '}
            <span className="font-normal text-slate-500">[User]</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600">
          AM
        </div>
      </div>
    </header>
  );
}
