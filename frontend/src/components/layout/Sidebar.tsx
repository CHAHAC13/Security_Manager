import {
  CheckCircle,
  Home,
  List,
  PenSquare,
  Settings,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SidebarLink {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const NAV_LINKS: SidebarLink[] = [
  { label: 'Home', to: '/', icon: <Home className="w-4 h-4" /> },
  {
    label: 'Blueprint Editor',
    to: '/blueprint-editor',
    icon: <PenSquare className="w-4 h-4" />,
  },
  {
    label: 'Access Matrix',
    to: '/access-matrix',
    icon: <List className="w-4 h-4" />,
  },
  {
    label: 'Approvals',
    to: '/approvals',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: <Settings className="w-4 h-4" />,
  },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0">
      {/* Navigation links */}
      <nav className="p-4 space-y-1">
        {NAV_LINKS.map((link) => {
          const isActive = location.pathname === link.to;

          return (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-sky-50 text-sky-700 border border-sky-100 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
              )}
            >
              <span
                className={cn(
                  'mr-3',
                  isActive ? 'text-sky-600' : 'text-slate-400',
                )}
              >
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Persona context footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/70">
        <div className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase mb-1">
          Acting As:
        </div>
        <div className="text-xs font-semibold text-slate-800">
          Lead developer (requester)
        </div>
        <div className="mt-2 text-[11px] text-slate-500 leading-snug">
          Governed self-service on Databricks
        </div>
      </div>
    </aside>
  );
}
