import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { PermissionEnvironment, PermissionObject, RoleAssignment } from '@/types/blueprint';
import type { PermissionsService } from '@/services/permissionsService';

interface Props {
  objects: PermissionObject[];
  environment: PermissionEnvironment;
  assignedIds: string[];
  service: PermissionsService;
  onNew: () => void;
  onExisting: (role: RoleAssignment) => void;
  onClose: () => void;
}

export function CreateRoleAssignmentDialog({ objects, environment, assignedIds, service, onNew, onExisting, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (mode !== 'existing') return;
    let active = true;
    async function search() {
      setLoading(true);
      setError(null);
      setSelectedId('');
      try {
        const roles = await service.searchExistingRoles(query, objects, environment);
        if (active) setResults(roles);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to search existing roles.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void search();
    return () => { active = false; };
  }, [mode, query, objects, environment, service, attempt]);
  const selected = results.find((role) => role.id === selectedId && !assignedIds.includes(role.id));
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="create-role-heading"
      className="w-full max-w-lg space-y-5 rounded-xl border border-slate-200 p-6 shadow-xl backdrop:bg-slate-900/40">
      <h3 id="create-role-heading" className="text-base font-semibold text-slate-900">Create Role Assignment</h3>
      <label className="block text-xs font-medium text-slate-600">Assignment mode
        <select value={mode} onChange={(event) => setMode(event.target.value === 'new' ? 'new' : 'existing')}
          className="mt-1 block w-full rounded-md border-slate-300 text-sm">
          <option value="new">Create New Role</option><option value="existing">Update Existing Role</option>
        </select>
      </label>
      {mode === 'existing' && <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">Search existing Databricks roles
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 text-sm" />
        </label>
        {loading && <p role="status" className="text-xs text-slate-500">Searching roles...</p>}
        {error && <div role="alert" className="text-xs text-rose-700">{error} <Button onClick={() => setAttempt((value) => value + 1)}>Retry search</Button></div>}
        {!loading && !error && <label className="block text-xs font-medium text-slate-600">Existing role
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 text-sm">
            <option value="">Select an existing role</option>
            {results.map((role) => <option key={role.id} value={role.id} disabled={assignedIds.includes(role.id)}>{role.roleName}{assignedIds.includes(role.id) ? ' (already assigned)' : ''}</option>)}
          </select>
        </label>}
        {!loading && !error && results.length === 0 && <p className="text-xs text-slate-500">No matching roles.</p>}
      </div>}
      <div className="flex justify-end gap-3">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="primary" disabled={mode === 'existing' && (!selected || loading || Boolean(error))}
          onClick={() => { if (mode === 'new') onNew(); else if (selected) onExisting(structuredClone(selected)); }}>
          Add role assignment
        </Button>
      </div>
    </dialog>
  );
}
