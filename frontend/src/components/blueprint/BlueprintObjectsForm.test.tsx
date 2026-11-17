import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintObjectsForm } from './BlueprintObjectsForm';
import { INITIAL_OBJECTS_DATA, type BlueprintObjectsData, type SchemaOption } from '@/types/blueprint';
import { objectDiscoveryService, type DiscoveryPage } from '@/services/objectDiscoveryService';

vi.mock('@/services/objectDiscoveryService', () => ({
  objectDiscoveryService: {
    getCatalogs: vi.fn(),
    getSchemas: vi.fn(),
    getObjects: vi.fn(),
  },
}));

function renderObjects(initialData: BlueprintObjectsData = INITIAL_OBJECTS_DATA) {
  function Harness() {
    const [data, setData] = useState(initialData);
    return <BlueprintObjectsForm data={data} onChange={setData} />;
  }
  render(<Harness />);
}

function pagination(label: string, page: number, total: number) {
  const container = screen.getByText(`${label} · Page ${page} of ${total}`).parentElement;
  if (!container) throw new Error('Pagination controls are missing');
  return within(container);
}

describe('Objects page pagination totals', () => {
  it('uses server totals without prefetching, keeps selections, and restores totals from cache', async () => {
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue({
      items: [
        { id: 'pagination-catalog', name: 'Pagination Catalog' },
        { id: 'retry-pagination', name: 'Retry Catalog' },
      ],
      nextCursor: null, totalItems: 2, totalPages: 1,
    });
    const schemas = vi.mocked(objectDiscoveryService.getSchemas).mockImplementation(async (catalogId, request) => {
      const page = Number(request.cursor ?? 1);
      return {
        items: Array.from({ length: 5 }, (_, index) => {
          const number = (page - 1) * 5 + index + 1;
          return { id: `schema-${number}`, name: `Schema ${number}`, catalogId };
        }),
        nextCursor: page < 20 ? String(page + 1) : null,
        totalItems: 100, totalPages: 20,
      };
    });
    const objects = vi.mocked(objectDiscoveryService.getObjects).mockImplementation(async (_catalog, schemaId, request) => {
      const page = Number(request.cursor ?? 1);
      const totalItems = schemaId === 'schema-1' ? 11 : 6;
      const totalPages = Math.ceil(totalItems / request.limit);
      return {
        items: Array.from({ length: Math.min(5, totalItems - (page - 1) * 5) }, (_, index) => {
          const number = (page - 1) * 5 + index + 1;
          return { id: `${schemaId}-table-${number}`, name: `Table ${number}`, schemaId, kind: 'table' as const };
        }),
        nextCursor: page < totalPages ? String(page + 1) : null,
        totalItems, totalPages,
      };
    });
    renderObjects();
    fireEvent.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagination Catalog' }));
    await screen.findByText('Schemas · Page 1 of 20');
    expect(schemas).toHaveBeenCalledTimes(1);
    expect(objects).not.toHaveBeenCalled();
    expect(pagination('Schemas', 1, 20).getByRole<HTMLButtonElement>('button', { name: 'Previous' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Schema 1' }));
    await screen.findByText('Objects · Page 1 of 3');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Table 1\[/ }));
    fireEvent.click(pagination('Objects', 1, 3).getByRole('button', { name: 'Next' }));
    await screen.findByText('Objects · Page 2 of 3');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Table 6\[/ }));
    fireEvent.click(pagination('Objects', 2, 3).getByRole('button', { name: 'Next' }));
    await screen.findByText('Objects · Page 3 of 3');
    expect(pagination('Objects', 3, 3).getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
    expect(screen.getAllByRole('checkbox', { name: /^Table \d+\[/ })).toHaveLength(1);
    fireEvent.click(pagination('Objects', 3, 3).getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Table 6\[/ }).checked).toBe(true);
    fireEvent.click(pagination('Objects', 2, 3).getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Table 1\[/ }).checked).toBe(true);
    expect(objects).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Schema 2' }));
    await screen.findByText('Objects · Page 1 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Schema 1' }));
    await screen.findByText('Objects · Page 3 of 3');
    expect(objects).toHaveBeenCalledTimes(4);
    fireEvent.click(pagination('Schemas', 1, 20).getByRole('button', { name: 'Next' }));
    await screen.findByText('Schemas · Page 2 of 20');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Schema 6' }));
    fireEvent.click(pagination('Schemas', 2, 20).getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Schema 1' }).checked).toBe(true);
    expect(schemas).toHaveBeenCalledTimes(2);
    expect(schemas.mock.calls.every(([, request]) => request.limit === 5)).toBe(true);
  });

  it('preserves the current page and totals after a failed next request and allows retry', async () => {
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue({
      items: [{ id: 'retry-pagination', name: 'Retry Catalog' }],
      nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.getSchemas)
      .mockResolvedValueOnce({
        items: [{ id: 'first', name: 'First', catalogId: 'retry-pagination' }],
        nextCursor: '2', totalItems: 6, totalPages: 2,
      })
      .mockRejectedValueOnce(new Error('Page unavailable'))
      .mockResolvedValueOnce({
        items: [{ id: 'second', name: 'Second', catalogId: 'retry-pagination' }],
        nextCursor: null, totalItems: 6, totalPages: 2,
      });
    renderObjects();
    fireEvent.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry Catalog' }));
    await screen.findByText('Schemas · Page 1 of 2');
    fireEvent.click(pagination('Schemas', 1, 2).getByRole('button', { name: 'Next' }));
    await screen.findByText('Page unavailable');
    expect(screen.getByText('Schemas · Page 1 of 2')).toBeTruthy();
    fireEvent.click(pagination('Schemas', 1, 2).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Schemas · Page 2 of 2')).toBeTruthy());
  });
});

describe('Objects page select all', () => {
  it('shows only checked or empty boxes and keeps the loading toast until selection finishes', async () => {
    const schemaPage = {
      items: [
        { id: 'toast-alpha', name: 'Toast Alpha', catalogId: 'toast-catalog' },
        { id: 'toast-beta', name: 'Toast Beta', catalogId: 'toast-catalog' },
      ],
      nextCursor: null, totalItems: 2, totalPages: 1,
    };
    let finishBulk!: (page: DiscoveryPage<SchemaOption>) => void;
    const bulkPage = new Promise<DiscoveryPage<SchemaOption>>((resolve) => { finishBulk = resolve; });
    vi.mocked(objectDiscoveryService.getSchemas).mockImplementation(async (_catalog, request) =>
      request.limit === 100 ? bulkPage : schemaPage);
    vi.mocked(objectDiscoveryService.getObjects).mockImplementation(async (_catalog, schemaId) => ({
      items: [
        { id: `${schemaId}.one`, name: 'One', schemaId, kind: 'table' as const },
        { id: `${schemaId}.two`, name: 'Two', schemaId, kind: 'table' as const },
      ],
      nextCursor: null, totalItems: 2, totalPages: 1,
    }));
    renderObjects({ ...INITIAL_OBJECTS_DATA, selectedCatalogId: 'toast-catalog' });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Toast Alpha' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /^One\[/ }));
    const schemaAll = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all schemas' });
    const objectAll = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all objects in Toast Alpha' });
    expect(schemaAll.checked).toBe(false);
    expect(schemaAll.indeterminate).toBe(false);
    expect(objectAll.checked).toBe(false);
    expect(objectAll.indeterminate).toBe(false);

    vi.useFakeTimers();
    try {
      fireEvent.click(schemaAll);
      const loadingToast = screen.getByText('Selecting resources...').closest('[role="status"]');
      expect(loadingToast?.classList.contains('top-16')).toBe(true);
      expect(loadingToast?.classList.contains('bottom-auto')).toBe(true);
      expect(screen.queryByRole('button', { name: 'Dismiss notification' })).toBeNull();
      await act(async () => { vi.advanceTimersByTime(5000); });
      expect(screen.getByText('Selecting resources...')).toBeTruthy();
      await act(async () => { finishBulk(schemaPage); await bulkPage; });
      expect(screen.queryByText('Selecting resources...')).toBeNull();
      const successToast = screen.getByText('All schemas and objects selected.').closest('[role="status"]');
      expect(successToast?.classList.contains('top-16')).toBe(true);
      expect(successToast?.classList.contains('bottom-auto')).toBe(true);
      expect(schemaAll.checked).toBe(true);
      expect(objectAll.checked).toBe(true);
      await act(async () => { vi.advanceTimersByTime(4000); });
      expect(screen.queryByText('All schemas and objects selected.')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('selects every schema across pages and every object across all schemas', async () => {
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue({
      items: [{ id: 'select-all-catalog', name: 'Select All Catalog' }],
      nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.getSchemas).mockImplementation(async (catalogId, request) => {
      const isFirstPage = !request.cursor || request.cursor === '1';
      return {
        items: isFirstPage
          ? [{ id: 'alpha', name: 'Alpha', catalogId }]
          : [{ id: 'beta', name: 'Beta', catalogId }],
        nextCursor: isFirstPage ? '2' : null, totalItems: 2, totalPages: 2,
      };
    });
    vi.mocked(objectDiscoveryService.getObjects).mockImplementation(async (_catalog, schemaId, request) => {
      const secondPage = request.cursor === '2';
      const object = schemaId === 'alpha'
        ? { id: secondPage ? 'alpha.t2' : 'alpha.t1', name: secondPage ? 't2' : 't1', schemaId, kind: 'table' as const }
        : { id: 'beta.v1', name: 'v1', schemaId, kind: 'view' as const };
      return {
        items: [object], nextCursor: schemaId === 'alpha' && !secondPage ? '2' : null,
        totalItems: schemaId === 'alpha' ? 2 : 1, totalPages: schemaId === 'alpha' ? 2 : 1,
      };
    });
    renderObjects();
    fireEvent.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalogs' }), { target: { value: 'select all' } });
    fireEvent.click(await screen.findByRole('button', { name: /Select All Catalog/ }, { timeout: 4000 }));

    const selectAllSchemas = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Select all schemas' });
    await waitFor(() => expect(selectAllSchemas.disabled).toBe(false));

    fireEvent.click(selectAllSchemas);
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Alpha' }).checked).toBe(true));

    fireEvent.click(pagination('Schemas', 1, 2).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Beta' }).checked).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    await screen.findByRole('checkbox', { name: /^t1\[/ });
    const alphaAll = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all objects in Alpha' });
    expect(alphaAll.checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^t1\[/ }).checked).toBe(true);
    fireEvent.click(pagination('Objects', 1, 2).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^t2\[/ }).checked).toBe(true));
    fireEvent.click(alphaAll);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^t2\[/ }).checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^v1\[/ }).checked).toBe(true));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all objects in Beta' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all objects in Alpha' }).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all objects in Alpha' }));
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^t2\[/ }).checked).toBe(true));
    expect(await screen.findByText('All objects in Alpha selected.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^v1\[/ }).checked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Select all objects across all schemas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all objects' })).toBeNull();
  });

  it('selects proposed schemas and objects without discovering a proposed catalog', async () => {
    const catalog = { id: 'new-catalog', name: 'New Catalog', source: 'new' as const };
    const schema = { id: 'new-schema', name: 'New Schema', catalogId: catalog.id, source: 'new' as const };
    const object = { id: 'new-object', name: 'New Object', schemaId: schema.id, catalogId: catalog.id,
      kind: 'table' as const, source: 'new' as const };
    vi.mocked(objectDiscoveryService.getSchemas).mockClear();
    vi.mocked(objectDiscoveryService.getObjects).mockClear();
    renderObjects({ ...INITIAL_OBJECTS_DATA, selectedCatalogId: catalog.id, selectedCatalog: catalog,
      proposedCatalogs: [catalog], proposedSchemas: [schema], proposedObjects: [object] });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all schemas' }));
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'New Schema' }).checked).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'New Schema' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all objects in New Schema' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^New Object\[/ }).checked).toBe(true);
    expect(objectDiscoveryService.getSchemas).not.toHaveBeenCalled();
    expect(objectDiscoveryService.getObjects).not.toHaveBeenCalled();
  });

  it('does not partially select schemas or objects when a bulk object fetch fails', async () => {
    vi.mocked(objectDiscoveryService.getSchemas).mockResolvedValue({
      items: [{ id: 'failing-schema', name: 'Failing Schema', catalogId: 'failure-catalog' }],
      nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.getObjects).mockRejectedValue(new Error('Objects unavailable'));
    renderObjects({ ...INITIAL_OBJECTS_DATA, selectedCatalogId: 'failure-catalog' });
    await screen.findByRole('checkbox', { name: 'Failing Schema' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all schemas' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Objects unavailable');
    expect(screen.queryByText('Selecting resources...')).toBeNull();
    expect(screen.queryByText('All schemas and objects selected.')).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Failing Schema' }).checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Select all schemas' }).checked).toBe(false);
  });
});
