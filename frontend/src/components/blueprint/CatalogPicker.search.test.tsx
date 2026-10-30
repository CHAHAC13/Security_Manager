import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import { INITIAL_OBJECTS_DATA } from '@/types/blueprint';
import { BlueprintObjectsForm } from './BlueprintObjectsForm';

vi.mock('@/lib/apiClient', () => ({ default: { get: vi.fn() } }));

describe('catalog-name search', () => {
  it('searches beyond loaded catalogs, paginates matches, and preserves selection when cleared', async () => {
    const catalogs = [
      ...Array.from({ length: 5 }, (_, index) => ({ name: `unrelated_${index}`, tags: ['gpdip'] })),
      ...Array.from({ length: 6 }, (_, index) => ({ name: `gpdip_${index}`, tags: ['gpdip'] })),
    ];
    vi.mocked(apiClient.get).mockImplementation(async (url, config) => {
      if (url !== '/api/v1/discovery/catalogs') {
        return { data: {
          items: [], pagination: { page: 1, total_items: 0, total_pages: 0, has_next: false },
        } };
      }
      const params = config?.params;
      if (!params || typeof params !== 'object'
        || !('search_by' in params) || params.search_by !== 'name'
        || !('page' in params) || typeof params.page !== 'number'
        || !('page_size' in params) || typeof params.page_size !== 'number') {
        throw new Error('Catalog search must request names only with pagination');
      }
      const { page, page_size } = params;
      const search = 'search' in params && typeof params.search === 'string' ? params.search : '';
      const filtered = catalogs.filter((catalog) => !search
        || catalog.name.toLowerCase().includes(String(search).toLowerCase()));
      return { data: {
        items: filtered.slice((page - 1) * page_size, page * page_size)
          .map((catalog) => ({ ...catalog, catalog_type: 'MANAGED' })),
        pagination: {
          page, total_items: filtered.length, total_pages: Math.ceil(filtered.length / page_size),
          has_next: page * page_size < filtered.length,
        },
      } };
    });
    function Harness() {
      const [data, setData] = useState(INITIAL_OBJECTS_DATA);
      return <BlueprintObjectsForm data={data} onChange={setData} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await screen.findByRole('button', { name: 'unrelated_0' });
    expect(screen.queryByRole('button', { name: 'gpdip_0' })).toBeNull();

    const search = screen.getByRole('searchbox', { name: 'Search catalogs' });
    fireEvent.change(search, { target: { value: '  GPDiP  ' } });
    expect(await screen.findByRole('button', { name: 'gpdip_0' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'unrelated_0' })).toBeNull();
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/discovery/catalogs', expect.objectContaining({
      params: { search: 'GPDiP', search_by: 'name', page: 1, page_size: 5 },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Load more catalogs' }));
    expect(await screen.findByRole('button', { name: 'gpdip_5' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^gpdip_/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Load more catalogs' })).toBeNull();
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/discovery/catalogs', expect.objectContaining({
      params: { search: 'GPDiP', search_by: 'name', page: 2, page_size: 5 },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'gpdip_5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Catalog selection: gpdip_5' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalogs' }), { target: { value: 'missing' } });
    expect(await screen.findByText('No catalogs found.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Catalog selection: gpdip_5' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalogs' }), { target: { value: '' } });
    expect(await screen.findByRole('button', { name: 'unrelated_0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Catalog selection: gpdip_5' })).toBeTruthy();

    const callsBeforeCachedSearch = vi.mocked(apiClient.get).mock.calls.length;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalogs' }), { target: { value: 'GPDiP' } });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^gpdip_/ })).toHaveLength(6));
    expect(vi.mocked(apiClient.get).mock.calls).toHaveLength(callsBeforeCachedSearch);
  });
});
