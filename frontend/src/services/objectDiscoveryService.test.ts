import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import { apiObjectDiscoveryService, mockObjectDiscoveryService } from './objectDiscoveryService';

vi.mock('@/lib/apiClient', () => ({ default: { get: vi.fn() } }));

describe('discovery pagination metadata', () => {
  it('requests catalog-name-only search on every page and preserves filtered totals', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        items: [{ name: 'gpdip_catalog', catalog_type: 'MANAGED' }],
        pagination: { page: 2, total_items: 6, total_pages: 2, has_next: false },
      },
    });
    const result = await apiObjectDiscoveryService.getCatalogs({ limit: 5, cursor: '2', search: 'gpdip' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/discovery/catalogs', {
      params: { page: 2, page_size: 5, search: 'gpdip', search_by: 'name' }, signal: undefined,
    });
    expect(result).toMatchObject({ totalItems: 6, totalPages: 2, nextCursor: null });
  });

  it('uses the schema-scoped objects route with encoded path names and backend query parameters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        items: [{
          name: 'daily', catalog_name: 'my catalog', schema_name: 'sales & finance',
          full_name: 'my catalog.sales & finance.daily',
          object_type: 'MATERIALIZED_VIEW', display_type: 'VIEW',
        }],
        pagination: { page: 2, total_items: 6, total_pages: 2, has_next: false },
      },
    });
    const result = await apiObjectDiscoveryService.getObjects('my catalog', 'sales & finance', {
      limit: 5, cursor: '2', kind: 'materialized_view', search: 'daily',
    });
    expect(apiClient.get).toHaveBeenLastCalledWith(
      '/api/v1/discovery/catalogs/my%20catalog/schemas/sales%20%26%20finance/objects',
      { params: { page: 2, page_size: 5, search: 'daily', object_type: 'VIEW' }, signal: undefined },
    );
    expect(result.items[0]).toMatchObject({
      id: 'my catalog.sales & finance.daily', schemaId: 'sales & finance', kind: 'materialized_view',
    });
  });

  it('preserves exact backend totals and requests only the specified page', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        items: [{ name: 'schema', catalog_name: 'catalog' }],
        pagination: { page: 7, total_items: 100, total_pages: 20, has_next: true },
      },
    });
    const result = await apiObjectDiscoveryService.getSchemas('catalog', { limit: 5, cursor: '7' });
    expect(result).toMatchObject({ totalItems: 100, totalPages: 20, nextCursor: '8' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/discovery/catalogs/catalog/schemas',
      expect.objectContaining({ params: { page: 7, page_size: 5, search: undefined } }));
  });

  it('surfaces missing totals instead of inventing a page count from loaded records', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [], pagination: { page: 1, has_next: false } },
    });
    await expect(apiObjectDiscoveryService.getSchemas('catalog', { limit: 5 }))
      .rejects.toThrow('invalid pagination totals');
  });

  it('preserves zero totals for empty API responses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [], pagination: { page: 1, has_next: false, total_items: 0, total_pages: 0 } },
    });
    expect(await apiObjectDiscoveryService.getSchemas('empty', { limit: 5 }))
      .toEqual({ items: [], nextCursor: null, totalItems: 0, totalPages: 0 });
  });

  it('provides filtered totals for the mock adapter as well', async () => {
    const result = await mockObjectDiscoveryService.getSchemas('cat-1', { limit: 5 });
    expect(result).toMatchObject({ totalItems: 7, totalPages: 2, nextCursor: '5' });
    expect(result.items).toHaveLength(5);
    const filtered = await mockObjectDiscoveryService.getSchemas('cat-1', { limit: 5, search: 'CDM' });
    expect(filtered).toMatchObject({ totalItems: 1, totalPages: 1, nextCursor: null });
  });
});
