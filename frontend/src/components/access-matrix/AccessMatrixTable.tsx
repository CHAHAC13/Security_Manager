import type { AccessMatrixEntry, Environment, RmFormType } from '@/types/access-matrix';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

interface AccessMatrixTableProps {
  data: AccessMatrixEntry[];
}

/** Map environment codes to badge variants */
const ENV_VARIANT: Record<Environment, BadgeVariant> = {
  Dev: 'slate',
  Stg: 'amber',
  Prd: 'rose',
};

/** Map RM form types to badge variants */
const RM_VARIANT: Record<RmFormType, BadgeVariant> = {
  'Reg User': 'emerald',
  Restricted: 'blue',
  Admin: 'rose',
  Service: 'amber',
};

const COLUMNS = [
  'Blueprint Name',
  'Ver',
  'Env',
  'Role Name',
  'Privilege',
  'Tech Approver',
  'RM Form',
] as const;

export function AccessMatrixTable({ data }: AccessMatrixTableProps) {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
        <thead className="bg-slate-50/80 uppercase font-semibold text-slate-600 tracking-wider">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col} scope="col" className="py-3 px-4 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white font-normal text-slate-700">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="py-12 text-center text-sm text-slate-400"
              >
                No entries match the current filters.
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-slate-50/80 transition-colors"
              >
                <td className="py-2.5 px-4 font-medium text-slate-900">
                  {row.blueprintName}
                </td>
                <td className="py-2.5 px-3 text-slate-600">{row.version}</td>
                <td className="py-2.5 px-3">
                  <Badge variant={ENV_VARIANT[row.environment]}>
                    {row.environment}
                  </Badge>
                </td>
                <td className="py-2.5 px-4 font-mono text-slate-600 text-[11px]">
                  {row.roleName}
                </td>
                <td className="py-2.5 px-4">
                  <span className="font-mono text-xs font-semibold text-slate-700">
                    {row.privilege}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-700">
                  {row.techApprover}
                </td>
                <td className="py-2.5 px-4">
                  <Badge pill variant={RM_VARIANT[row.rmForm]}>
                    {row.rmForm}
                  </Badge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
