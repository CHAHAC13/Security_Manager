import { useState, type FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
import { useObjectDiscovery } from '@/hooks/useObjectDiscovery';
import type { BlueprintObjectsData, ObjectKind, ObjectOption } from '@/types/blueprint';

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

interface PaginationControlsProps {
  label: string;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

function PaginationControls({
  label,
  page,
  hasPrevious,
  hasNext,
  loading,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={!hasPrevious || loading}
        className="relative inline-flex h-9 min-w-32 items-center justify-center rounded-md border border-sky-200 bg-sky-100 px-3 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="absolute left-3 h-4 w-4" />
        Previous
      </button>
      <span className="text-center text-[11px] font-medium text-slate-500">
        {label} · Page {page}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || loading}
        className="relative inline-flex h-9 min-w-32 items-center justify-center rounded-md bg-sky-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {loading ? 'Loading…' : 'Next'}
        <ChevronRight className="absolute right-3 h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Main Component ── */

export function BlueprintObjectsForm({ data, onChange }: BlueprintObjectsFormProps) {
  const [activeCreation, setActiveCreation] = useState<'catalog' | 'schema' | 'object' | null>(null);
  const [proposalName, setProposalName] = useState('');
  const [proposalKind, setProposalKind] = useState<ObjectKind>('table');
  const [proposalError, setProposalError] = useState<string | null>(null);
  const focusedSchemaId = data.selectedSchemaIds.includes(data.focusedSchemaId ?? '')
    ? data.focusedSchemaId
    : null;
  const discovery = useObjectDiscovery(data.selectedCatalogId || null, focusedSchemaId);
  const schemas = discovery.schemas.items;
  const visibleSchemas = discovery.schemas.pageItems;
  const focusedSchema = schemas.find((schema) => schema.id === data.focusedSchemaId) ?? null;
  const objects = discovery.objects.pageItems;
  const visibleObjects = [
    ...objects,
    ...data.proposedObjects.filter((object) => object.schemaId === focusedSchema?.id),
  ];

  const selectedSchemaCount = data.selectedSchemaIds.length;
  const totalSchemaCount = schemas.length;
  const schemaPageStart = totalSchemaCount === 0
    ? 0
    : discovery.schemas.pageIndex * 5 + 1;
  const schemaPageEnd = schemaPageStart + visibleSchemas.length - 1;

  /* ── Event handlers ── */

  function handleCatalogChange(catalogId: string) {
    onChange({
      ...data,
      selectedCatalogId: catalogId,
      selectedSchemaIds: [],
      selectedObjectIds: [],
      selectedObjects: [],
      focusedSchemaId: null,
    });
  }

  function openCreation(kind: 'catalog' | 'schema' | 'object') {
    setActiveCreation((current) => current === kind ? null : kind);
    setProposalName('');
    setProposalError(null);
  }

  function addProposedResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = proposalName.trim();
    if (!name) {
      setProposalError('Enter a name to continue.');
      return;
    }

    const normalizedName = name.toLocaleLowerCase();
    const duplicate = activeCreation === 'catalog'
      ? [...discovery.catalogs.items, ...data.proposedCatalogs].some((item) => item.name.toLocaleLowerCase() === normalizedName)
      : activeCreation === 'schema'
        ? [...schemas, ...data.proposedSchemas.filter((schema) => schema.catalogId === data.selectedCatalogId)].some((item) => item.name.toLocaleLowerCase() === normalizedName)
        : [...discovery.objects.getCachedItems(focusedSchema?.id ?? ''), ...data.proposedObjects.filter((object) => object.schemaId === focusedSchema?.id)].some((item) => item.name.toLocaleLowerCase() === normalizedName);

    if (duplicate) {
      setProposalError('An item with this name already exists in this location.');
      return;
    }

    const id = `new-${crypto.randomUUID()}`;
    if (activeCreation === 'catalog') {
      onChange({ ...data, proposedCatalogs: [...data.proposedCatalogs, { id, name, source: 'new' }] });
    } else if (activeCreation === 'schema' && data.selectedCatalogId) {
      onChange({ ...data, proposedSchemas: [...data.proposedSchemas, { id, name, catalogId: data.selectedCatalogId, source: 'new' }] });
    } else if (activeCreation === 'object' && focusedSchema) {
      const proposedObject: ObjectOption = {
        id,
        name,
        schemaId: focusedSchema.id,
        kind: proposalKind,
        status: 'pending',
        source: 'new',
      };
      onChange({
        ...data,
        selectedObjectIds: [...new Set([...data.selectedObjectIds, id])],
        selectedObjects: [...data.selectedObjects.filter((object) => object.id !== id), proposedObject],
        proposedObjects: [...data.proposedObjects, { ...proposedObject, source: 'new' }],
      });
    }

    setActiveCreation(null);
    setProposalName('');
    setProposalError(null);
  }

  function creationForm(kind: 'catalog' | 'schema' | 'object') {
    if (activeCreation !== kind) return null;
    return (
      <form onSubmit={addProposedResource} className="flex flex-wrap items-end gap-2 border border-sky-200 bg-sky-50/60 rounded-md p-3">
        <label className="flex-1 min-w-48 text-xs font-medium text-slate-600">
          {kind === 'catalog' ? 'Proposed catalog name' : kind === 'schema' ? 'Proposed schema name' : 'Proposed object name'}
          <input
            autoFocus
            value={proposalName}
            onChange={(event) => setProposalName(event.target.value)}
            className="mt-1 block w-full h-9 rounded border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        {kind === 'object' && (
          <label className="text-xs font-medium text-slate-600">
            Kind
            <select value={proposalKind} onChange={(event) => setProposalKind(event.target.value as ObjectKind)} className="mt-1 block h-9 rounded border border-slate-300 bg-white px-2.5 text-sm text-slate-900">
              <option value="table">Table</option>
              <option value="view">View</option>
              <option value="materialized_view">Materialized view</option>
            </select>
          </label>
        )}
        <button type="submit" className="h-9 rounded bg-sky-700 px-3 text-xs font-semibold text-white hover:bg-sky-800">Add to draft</button>
        <button type="button" onClick={() => setActiveCreation(null)} className="h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-white">Cancel</button>
        {proposalError && <p role="alert" className="basis-full text-xs text-red-700">{proposalError}</p>}
      </form>
    );
  }

  function toggleSchema(schemaId: string) {
    const isSelected = data.selectedSchemaIds.includes(schemaId);
    const nextSchemaIds = isSelected
      ? data.selectedSchemaIds.filter((id) => id !== schemaId)
      : [...data.selectedSchemaIds, schemaId];

    // When deselecting a schema, also remove its objects from selection
    let nextObjectIds = data.selectedObjectIds;
    let nextSelectedObjects = data.selectedObjects;
    if (isSelected) {
      nextSelectedObjects = data.selectedObjects.filter((object) => object.schemaId !== schemaId);
      const remainingObjectIds = new Set(nextSelectedObjects.map((object) => object.id));
      nextObjectIds = data.selectedObjectIds.filter((id) => remainingObjectIds.has(id));
    }

    const nextFocused = isSelected
      ? data.focusedSchemaId === schemaId
        ? nextSchemaIds[0] ?? null
        : data.focusedSchemaId
      : schemaId;

    onChange({
      ...data,
      selectedSchemaIds: nextSchemaIds,
      selectedObjectIds: nextObjectIds,
      selectedObjects: nextSelectedObjects,
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
    const selectedObjects = isSelected
      ? data.selectedObjects.filter((object) => object.id !== objectId)
      : [...data.selectedObjects, ...visibleObjects.filter((object) => object.id === objectId)];
    onChange({
      ...data,
      selectedObjectIds: isSelected
        ? data.selectedObjectIds.filter((id) => id !== objectId)
        : [...data.selectedObjectIds, objectId],
      selectedObjects,
    });
  }

  /* How many objects are scoped for a given schema */
  function scopedObjectCount(schemaId: string): number {
    const schemaObjIds = new Set(
      discovery.objects.getCachedItems(schemaId).map((object) => object.id),
    );
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
                {data.selectedCatalogId && !discovery.catalogs.items.some((catalog) => catalog.id === data.selectedCatalogId) && (
                  <option value={data.selectedCatalogId}>{data.selectedCatalogId}</option>
                )}
                {discovery.catalogs.items.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {catalog.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => openCreation('catalog')}
              className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Catalog
            </button>
          </div>
          {creationForm('catalog')}
          {data.proposedCatalogs.length > 0 && (
            <ul aria-label="Proposed catalogs" className="space-y-1 text-xs text-sky-800">
              {data.proposedCatalogs.map((catalog) => <li key={catalog.id}>Proposed catalog: <span className="font-mono">{catalog.name}</span></li>)}
            </ul>
          )}

          {discovery.catalogs.loading && (
            <p role="status" aria-live="polite" className="text-xs text-slate-500">Loading catalogs…</p>
          )}
          {discovery.catalogs.error && (
            <div role="alert" className="flex items-center justify-between gap-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <span>{discovery.catalogs.error}</span>
              <button type="button" onClick={discovery.catalogs.retry} className="font-semibold underline">Retry</button>
            </div>
          )}
          {!discovery.catalogs.loading && !discovery.catalogs.error && discovery.catalogs.items.length === 0 && (
            <p className="text-xs text-slate-500">No catalogs found.</p>
          )}
          {discovery.catalogs.nextCursor && (
            <button type="button" onClick={discovery.catalogs.loadMore} disabled={discovery.catalogs.loadingMore} className="self-start text-xs font-medium text-sky-700 hover:text-sky-800 disabled:text-slate-400">
              {discovery.catalogs.loadingMore ? 'Loading catalogs…' : 'Load more catalogs'}
            </button>
          )}
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
                    {discovery.catalogs.items.find((catalog) => catalog.id === data.selectedCatalogId)?.name ?? data.selectedCatalogId}
                  </span>
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {selectedSchemaCount} selected · Showing {schemaPageStart}-{schemaPageEnd} of {totalSchemaCount} loaded
                {discovery.schemas.hasNextPage ? ' · more available' : ''}
              </span>
            </div>

            {discovery.schemas.error && (
              <div role="alert" className="flex items-center justify-between gap-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <span>{discovery.schemas.error}</span>
                <button type="button" onClick={discovery.schemas.retry} className="font-semibold underline">Retry</button>
              </div>
            )}

            {discovery.schemas.loading && schemas.length === 0 && (
              <p role="status" aria-live="polite" className="text-xs text-slate-500 px-1">Loading schemas…</p>
            )}

            {!discovery.schemas.loading && !discovery.schemas.error && schemas.length === 0 && (
              <p className="text-xs text-slate-500 px-1">No schemas found in this catalog.</p>
            )}

            <div aria-busy={discovery.schemas.loading} className="flex flex-col gap-2 bg-slate-50/60 border border-slate-200/60 p-3 rounded-xl">
              {visibleSchemas.map((schema) => {
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
                        {schema.tag && <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                            isFocused && isChecked
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {schema.tag}
                        </span>}
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
                        : schema.objectCount !== undefined ? `${schema.objectCount} objects` : 'Browse objects'}
                    </span>
                  </div>
                );
              })}
              {data.proposedSchemas
                .filter((schema) => schema.catalogId === data.selectedCatalogId)
                .map((schema) => (
                  <div key={schema.id} className="flex items-center justify-between rounded-lg border border-dashed border-sky-300 bg-sky-50/60 p-3 text-xs text-sky-800">
                    <span className="font-mono font-semibold">{schema.name}</span>
                    <span>Proposed schema</span>
                  </div>
                ))}
            </div>

            {(discovery.schemas.hasPreviousPage || discovery.schemas.hasNextPage) && (
              <PaginationControls
                label="Schemas"
                page={discovery.schemas.pageIndex + 1}
                hasPrevious={discovery.schemas.hasPreviousPage}
                hasNext={discovery.schemas.hasNextPage}
                loading={discovery.schemas.loadingMore}
                onPrevious={discovery.schemas.loadPrevious}
                onNext={discovery.schemas.loadMore}
              />
            )}

            {selectedSchemaCount > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Selected schemas ({selectedSchemaCount})
                </p>
                <div className="flex flex-wrap gap-2">
                  {schemas
                    .filter((schema) => data.selectedSchemaIds.includes(schema.id))
                    .map((schema) => (
                      <button
                        key={schema.id}
                        type="button"
                        onClick={() => focusSchema(schema.id)}
                        aria-pressed={data.focusedSchemaId === schema.id}
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-xs font-mono transition-colors',
                          data.focusedSchemaId === schema.id
                            ? 'border-sky-300 bg-sky-100 text-sky-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50',
                        )}
                      >
                        {schema.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => openCreation('schema')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 transition-colors self-start"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Schema
            </button>
            {creationForm('schema')}
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

            {discovery.objects.error && (
              <div role="alert" className="flex items-center justify-between gap-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <span>{discovery.objects.error}</span>
                <button type="button" onClick={discovery.objects.retry} className="font-semibold underline">Retry</button>
              </div>
            )}

            {discovery.objects.loading && discovery.objects.items.length === 0 && (
              <p role="status" aria-live="polite" className="text-xs text-slate-500 px-1">Loading objects…</p>
            )}

            {!discovery.objects.loading && !discovery.objects.error && visibleObjects.length === 0 && (
              <p className="text-xs text-slate-500 px-1">No tables or objects were found in this schema.</p>
            )}

            <div aria-busy={discovery.objects.loading} className="flex flex-col gap-2 bg-slate-50/60 border border-slate-200/60 p-3 rounded-xl">
              {visibleObjects.map((obj) => {
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
                    {obj.source === 'new' && (
                      <span className="text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">Proposed</span>
                    )}
                  </label>
                );
              })}
            </div>

            {(discovery.objects.hasPreviousPage || discovery.objects.hasNextPage) && (
              <PaginationControls
                label="Objects"
                page={discovery.objects.pageIndex + 1}
                hasPrevious={discovery.objects.hasPreviousPage}
                hasNext={discovery.objects.hasNextPage}
                loading={discovery.objects.loadingMore}
                onPrevious={discovery.objects.loadPrevious}
                onNext={discovery.objects.loadMore}
              />
            )}

            <button
              type="button"
              onClick={() => openCreation('object')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 border border-slate-200 transition-colors self-start"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New Table/View Definition
            </button>
            {creationForm('object')}
          </div>
        )}
        {data.selectedCatalogId &&
          !discovery.schemas.loading &&
          schemas.length > 0 &&
          !focusedSchema && (
            <div role="status" className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 text-center text-sm text-slate-500">
              Please select a schema to view its related tables or objects.
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
