import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintObjectsForm } from './BlueprintObjectsForm';
import { INITIAL_OBJECTS_DATA } from '@/types/blueprint';
import { objectDiscoveryService } from '@/services/objectDiscoveryService';

vi.mock('@/services/objectDiscoveryService', () => ({
  objectDiscoveryService: {
    getCatalogs: vi.fn(),
    getSchemas: vi.fn(),
    getObjects: vi.fn(),
  },
}));

function renderObjects() {
  function Harness() {
    const [data, setData] = useState(INITIAL_OBJECTS_DATA);
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
