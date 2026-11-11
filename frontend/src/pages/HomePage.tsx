import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast } from '@/components/ui/Toast';

export function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(() => {
    const state = location.state as { submissionNotice?: unknown; blueprintStatus?: unknown } | null;
    if (typeof state?.submissionNotice !== 'string') return null;
    return typeof state.blueprintStatus === 'string'
      ? `${state.submissionNotice} Status: ${state.blueprintStatus}.`
      : state.submissionNotice;
  });

  useEffect(() => {
    const state = location.state as { submissionNotice?: unknown } | null;
    if (typeof state?.submissionNotice !== 'string') return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return (
    <>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Home
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Welcome to GPDIP Security Manager.
          </p>
        </div>
      </div>
      {notice && <Toast message={notice} onDismiss={dismissNotice} />}
    </>
  );
}
