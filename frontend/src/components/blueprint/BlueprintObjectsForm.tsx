import { useMemo } from 'react';
import {
  ChevronDown,
  Database,
  FolderTree,
  Info,
  Layers,
  Plus,
  ShieldCheck,
  Lock,
  Table,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOCK_CATALOGS, getSchemasByCatalog, getObjectsBySchema } from '@/data/objectWizardData';
import type {
  BlueprintObjectsData,
  ObjectOption,
  SchemaOption,
} from '@/types/blueprint';

interface BlueprintObjectsFormProps {
  data: BlueprintObjectsData;
  onChange: (data: BlueprintObjectsData) => void;
}

/* ── Helpers ── */

const KIND_LABELS: Record<string, string> = {
  table: 'Delta Lake Table',
  view: 'View',
  materialized_view: 'Materialized View',
};

function ObjectIcon({ kind }: { kind: string }) {
  if (kind === 'view' || kind === 'materialized_view')
    return <Eye className="w-4 h-4 text-sky-600" />;
  return <Table className="w-4 h-4 text-sky-600" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'validated')
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Validated
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200/60">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Error
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  );
}

/* ── Main Component ── */

export function BlueprintObjectsForm({ data, onChange }: BlueprintObjectsFormProps) {
  /* Derived data from mock "API" */
  const schemas = useMemo(
    () => (data.selectedCatalogId ? getSchemasByCatalog(data.selectedCatalogId) : []),
    [data.selectedCatalogId],
  );

  const focusedSchema = schemas.find((s) => s.id === data.focusedSchemaId) ?? null;

  const objects = useMemo(
    () => (focusedSchema ? getObjectsBySchema(focusedSchema.id) : []),
    [focusedSchema],
  );

  const selectedSchemaCount = data.selectedSchemaIds.length;
  const totalSchemaCount = schemas.length;

  /* ── Event handlers ── */

  function handleCatalogChange(catalogId: string) {
    const newSchemas = getSchemasByCatalog(catalogId);
    onChange({
      selectedCatalogId: catalogId,
      selectedSchemaIds: [],
      selectedObjectIds: [],
      focusedSchemaId: newSchemas.length > 0 ? newSchemas[0].id : null,
    });
  }

  function toggleSchema(schemaId: string) {
    const isSelected = data.selectedSchemaIds.includes(schemaId);
    const nextSchemaIds = isSelected
      ? data.selectedSchemaIds.filter((id) => id !== schemaId)
      : [...data.selectedSchemaIds, schemaId];

    // When deselecting a schema, also remove its objects from selection
    let nextObjectIds = data.selectedObjectIds;
    if (isSelected) {
      const schemaObjectIds = new Set(
        getObjectsBySchema(schemaId).map((o) => o.id),
      );
      nextObjectIds = nextObjectIds.filter((id) => !schemaObjectIds.has(id));
    }

    // If the focused schema was deselected, clear focus or shift to another
    let nextFocused = data.focusedSchemaId;
    if (isSelected && data.focusedSchemaId === schemaId) {
      nextFocused = nextSchemaIds.length > 0 ? nextSchemaIds[0] : null;
    }

    onChange({
      ...data,
      selectedSchemaIds: nextSchemaIds,
      selectedObjectIds: nextObjectIds,
      focusedSchemaId: nextFocused,
    });
  }

  function focusSchema(schemaId: string) {
    if (data.selectedSchemaIds.includes(schemaId)) {
      onChange({ ...data, focusedSchemaId: schemaId });
    }
  }

  function toggleObject(objectId: string) {
    const isSelected = data.selectedObjectIds.includes(objectId);
    onChange({
      ...data,
      selectedObjectIds: isSelected
        ? data.selectedObjectIds.filter((id) => id !== objectId)
        : [...data.selectedObjectIds, objectId],
    });
  }

  /* How many objects are scoped for a given schema */
  function scopedObjectCount(schemaId: string): number {
    const schemaObjIds = new Set(getObjectsBySchema(schemaId).map((o) => o.id));
    return data.selectedObjectIds.filter((id) => schemaObjIds.has(id)).length;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ── Left: Object Wizard Card ── */}
      <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-6">
        {/* Card header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-sky-600" />
            Object Wizard
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            Step 2: Hierarchy Mapping
          </span>
        </div>

        {/* 1 ─ Catalog Selection */}
        <div className="flex flex-col gap-3 bg-slate-50/60 border border-slate-200/60 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="catalog-select"
              className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"
            >
              <Database className="w-4 h-4 text-slate-400" />
              Catalog Selection
            </label>
            <span className="text-[11px] text-slate-400 font-medium">Databricks Unity Catalog</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[11px] font-medium text-slate-400 uppercase tracking-wider pointer-events-none">
                Target:
              </span>
              <select
                id="catalog-select"
                value={data.selectedCatalogId}
                onChange={(e) => handleCatalogChange(e.target.value)}
                className="w-full pl-16 pr-9 h-9 bg-white border border-slate-300 rounded-md text-sm font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 appearance-none cursor-pointer"
              >
                <option value="">Select a catalog…</option>
                {MOCK_CATALOGS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Catalog
            </button>
          </div>
        </div>

        {/* 2 ─ Discovered Schemas */}
        {data.selectedCatalogId && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-400" />
                  Discovered Schemas
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Available in{' '}
                  <span className="font-mono text-sky-600 font-medium">
                    {MOCK_CATALOGS.find((c) => c.id === data.selectedCatalogId)?.name}
                  </span>
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {selectedSchemaCount} of {totalSchemaCount} selected
              </span>
            </div>

            <div className="flex flex-col gap-2 bg-slate-50/60 border border-slate-200/60 p-3 rounded-xl">
              {schemas.map((schema) => {
                const isChecked = data.selectedSchemaIds.includes(schema.id);
                const isFocused = data.focusedSchemaId === schema.id;
                const scoped = scopedObjectCount(schema.id);

                return (
                  <div
                    key={schema.id}
                    onClick={() => focusSchema(schema.id)}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                      isFocused && isChecked
                        ? 'bg-sky-50/50 border-sky-200/60 ring-1 ring-sky-100'
                        : isChecked
                          ? 'bg-white border-slate-200/70 hover:bg-slate-50'
                          : 'bg-white border-slate-200/70 hover:bg-slate-50',
                    )}
                  >
                    <label className="flex items-center gap-3 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSchema(schema.id)}
                        className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm font-mono font-semibold transition-colors',
                            isFocused && isChecked ? 'text-sky-700' : isChecked ? 'text-slate-900' : 'text-slate-400',
                          )}
                        >
                          {schema.name}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                            isFocused && isChecked
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {schema.tag}
                        </span>
                      </div>
                    </label>
                    <span
                      className={cn(
                        'text-[11px] font-medium',
                        isFocused && isChecked
                          ? 'text-sky-700 font-semibold'
                          : isChecked
                            ? 'text-slate-500'
                            : 'text-slate-400',
                      )}
                    >
                      {isChecked && scoped > 0
                        ? `${scoped} object${scoped === 1 ? '' : 's'} scoped`
                        : `${schema.objectCount} objects`}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 transition-colors self-start"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Schema
            </button>
          </div>
        )}

        {/* 3 ─ Selected Objects (Tables / Views) */}
        {focusedSchema && data.selectedSchemaIds.includes(focusedSchema.id) && (
          <div className="flex flex-col gap-3 pt-4 border-t border-slate-200/80">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Table className="w-4 h-4 text-slate-400" />
                Selected Objects (Tables / Views)
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-400">Active scope for:</span>
                <span className="text-[11px] font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {focusedSchema.name}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-slate-50/60 border border-slate-200/60 p-3 rounded-xl">
              {objects.map((obj) => {
                const isChecked = data.selectedObjectIds.includes(obj.id);
                return (
                  <label
                    key={obj.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200/70 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleObject(obj.id)}
                        className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <ObjectIcon kind={obj.kind} />
                        <span className="text-sm font-mono font-semibold text-slate-900">
                          {obj.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          [{KIND_LABELS[obj.kind]}]
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={obj.status} />
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 transition-colors self-start"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Table/View Definition
            </button>
          </div>
        )}
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
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Validation compiled:</strong> Validation
                summary across registered environments ensures compliance with Databricks Unity
                governance.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Context-sensitive guidance:</strong> Setup
                adapts automatically to your assigned role profile and workspace access policies.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Blueprint Isolation:</strong> Define the new
                blueprint scope precisely. You are responsible for securing scoped tables and
                schemas prior to review submission.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
