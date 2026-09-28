import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * Root shell layout — TopBar + Sidebar + scrollable main content area.
 * Nested routes render inside <Outlet />.
 */
export function AppLayout() {
  return (
    <div className="bg-slate-50 text-slate-800 h-screen flex flex-col overflow-hidden">
      <TopBar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
          <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
