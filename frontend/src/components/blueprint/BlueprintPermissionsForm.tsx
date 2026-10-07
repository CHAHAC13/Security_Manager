import { useCallback } from 'react';
import {
  ChevronDown,
  Info,
  Lock,
  Plus,
  ShieldCheck,
  Table,
  Trash2,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import {
  MOCK_ROLES,
  PRIVILEGE_OPTIONS,
  ENVIRONMENT_OPTIONS,
  RM_FORM_OPTIONS,
} from '@/data/permissionsData';
import { MOCK_OBJECTS } from '@/data/objectWizardData';
import type {
  BlueprintPermissionsData,
  BlueprintObjectsData,
  PermissionAssignment,
  Privilege,
  PermissionEnvironment,
  RmForm,
} from '@/types/blueprint';

interface BlueprintPermissionsFormProps {
  data: BlueprintPermissionsData;
  objectsData: BlueprintObjectsData;
  onChange: (data: BlueprintPermissionsData) => void;
}

/* ── Helpers ── */

const ENV_VARIANT: Record<PermissionEnvironment, BadgeVariant> = {
  Dev: 'slate',
  Stg: 'amber',
  Prd: 'rose',
};

const RM_VARIANT: Record<RmForm, BadgeVariant> = {
  'Reg User': 'emerald',
  Restricted: 'blue',
  Admin: 'rose',
  Service: 'amber',
};

let nextId = 1;
function genId() {
  return `perm-${Date.now()}-${nextId++}`;
}

function ObjectIcon({ kind }: { kind: string }) {
  if (kind === 'view' || kind === 'materialized_view')
    return <Eye className="w-3.5 h-3.5 text-sky-600" />;
  return <Table className="w-3.5 h-3.5 text-sky-600" />;
}

/* ── Main Component ── */

export function BlueprintPermissionsForm({
  data,
  objectsData,
  onChange,
}: BlueprintPermissionsFormProps) {
  const selectedObjects = MOCK_OBJECTS.filter((o) =>
    objectsData.selectedObjectIds.includes(o.id),
  );

  /* ── Event handlers ── */

  const addAssignment = useCallback(
    (objectId: string) => {
      const newAssignment: PermissionAssignment = {
        id: genId(),
        roleId: MOCK_ROLES[0].id,
        objectId,
        privilege: 'SELECT',
        environment: 'Dev',
        rmForm: 'Reg User',
      };
      onChange({ assignments: [...data.assignments, newAssignment] });
    },
    [data, onChange],
  );

  const removeAssignment = useCallback(
    (assignmentId: string) => {
      onChange({
        assignments: data.assignments.filter((a) => a.id !== assignmentId),
      });
    },
    [data, onChange],
  );

  const updateAssignment = useCallback(
    (assignmentId: string, field: keyof PermissionAssignment, value: string) => {
      onChange({
        assignments: data.assignments.map((a) =>
          a.id === assignmentId ? { ...a, [field]: value } : a,
        ),
      });
    },
    [data, onChange],
  );

  const getAssignmentsForObject = (objectId: string) =>
    data.assignments.filter((a) => a.objectId === objectId);

  const totalAssignments = data.assignments.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ── Left: Permissions Matrix ── */}
      <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-6">
        {/* Card header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            Access Matrix Editor
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            {totalAssignments} assignment{totalAssignments === 1 ? '' : 's'}
          </span>
        </div>

        {/* Empty state */}
        {selectedObjects.length === 0 && (
          <div className="flex items-center justify-center h-48 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <p className="text-sm text-slate-400">
              No objects selected in Step 2. Go back to select tables/views.
            </p>
          </div>
        )}

        {/* Per-object permission cards */}
        {selectedObjects.map((obj) => {
          const assignments = getAssignmentsForObject(obj.id);
          return (
            <div
              key={obj.id}
              className="flex flex-col gap-3 bg-slate-50/60 border border-slate-200/60 rounded-xl p-5"
            >
              {/* Object header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <ObjectIcon kind={obj.kind} />
                  <span className="text-sm font-mono font-semibold text-slate-900">
                    {obj.name}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    [{obj.kind === 'table'
                      ? 'Delta Lake Table'
                      : obj.kind === 'materialized_view'
                        ? 'Materialized View'
                        : 'View'}]
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {assignments.length} role{assignments.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Assignment table */}
              {assignments.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200/70">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50/80">
                      <tr>
                        {['Role Name', 'Env', 'Privilege', 'RM Form', ''].map(
                          (col) => (
                            <th
                              key={col}
                              className="py-2.5 px-3 text-left font-semibold text-slate-500 uppercase tracking-wider"
                            >
                              {col}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {assignments.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Role */}
                          <td className="py-2 px-3">
                            <div className="relative">
                              <select
                                value={a.roleId}
                                onChange={(e) =>
                                  updateAssignment(a.id, 'roleId', e.target.value)
                                }
                                className="w-full pr-7 py-1 bg-transparent border-0 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-0 cursor-pointer appearance-none"
                              >
                                {MOCK_ROLES.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1 text-slate-400">
                                <ChevronDown className="w-3 h-3" />
                              </div>
                            </div>
                          </td>
                          {/* Environment */}
                          <td className="py-2 px-3">
                            <select
                              value={a.environment}
                              onChange={(e) =>
                                updateAssignment(
                                  a.id,
                                  'environment',
                                  e.target.value as PermissionEnvironment,
                                )
                              }
                              className="bg-transparent border-0 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-0 cursor-pointer appearance-none pr-4"
                            >
                              {ENVIRONMENT_OPTIONS.map((env) => (
                                <option key={env} value={env}>
                                  {env}
                                </option>
                              ))}
                            </select>
                          </td>
                          {/* Privilege */}
                          <td className="py-2 px-3">
                            <select
                              value={a.privilege}
                              onChange={(e) =>
                                updateAssignment(
                                  a.id,
                                  'privilege',
                                  e.target.value as Privilege,
                                )
                              }
                              className="bg-transparent border-0 text-[11px] font-mono font-semibold text-slate-700 focus:outline-none focus:ring-0 cursor-pointer appearance-none pr-4"
                            >
                              {PRIVILEGE_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </td>
                          {/* RM Form */}
                          <td className="py-2 px-3">
                            <select
                              value={a.rmForm}
                              onChange={(e) =>
                                updateAssignment(
                                  a.id,
                                  'rmForm',
                                  e.target.value as RmForm,
                                )
                              }
                              className="bg-transparent border-0 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-0 cursor-pointer appearance-none pr-4"
                            >
                              {RM_FORM_OPTIONS.map((rm) => (
                                <option key={rm} value={rm}>
                                  {rm}
                                </option>
                              ))}
                            </select>
                          </td>
                          {/* Remove */}
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={() => removeAssignment(a.id)}
                              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove assignment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add role button */}
              <button
                type="button"
                onClick={() => addAssignment(obj.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 transition-colors self-start"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Role Assignment
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Right: Setup Guide Sidebar ── */}
      <div className="lg:col-span-4 xl:col-span-3">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
            <Info className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Permissions Guide</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Least privilege:</strong> Assign the minimum
                permissions needed. Start with SELECT and expand only when justified.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Environment isolation:</strong> Production
                roles should never overlap with Dev/Stg roles. Each environment has its own
                access boundary.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">RM Form classification:</strong> Restricted
                and Admin roles require additional approval from SecOps before the blueprint can
                be submitted.
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Environment Legend
            </h4>
            <div className="flex flex-wrap gap-2">
              {ENVIRONMENT_OPTIONS.map((env) => (
                <Badge key={env} variant={ENV_VARIANT[env]}>
                  {env}
                </Badge>
              ))}
            </div>
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-3 mb-2">
              RM Form Types
            </h4>
            <div className="flex flex-wrap gap-2">
              {RM_FORM_OPTIONS.map((rm) => (
                <Badge key={rm} pill variant={RM_VARIANT[rm]}>
                  {rm}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
