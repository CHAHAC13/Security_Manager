import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CreateBlueprintPage } from './CreateBlueprintPage';
import apiClient from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({
  default: {
    get: vi.fn(async (url: string, config: { params: { page: number } }) => {
      const page = config.params.page;
      if (url.endsWith('/schemas')) {
        if (url.includes('/two_schema_catalog/')) {
          return { data: {
            items: ['cts_004', 'information_schema'].map((name) => ({ name, catalog_name: 'two_schema_catalog' })),
            pagination: { page, has_next: false, total_items: 2, total_pages: 1 },
          } };
        }
        return { data: {
          items: (page === 1 ? ['clinical', 'unused_a', 'unused_b', 'unused_c', 'unused_d'] : ['outbound'])
            .map((name) => ({ name, catalog_name: 'multi_schema_catalog' })),
          pagination: { page, has_next: page === 1, total_items: 6, total_pages: 2 },
        } };
      }
      if (url.endsWith('/objects')) {
        const path = url.match(/\/catalogs\/([^/]+)\/schemas\/([^/]+)\/objects$/);
        if (!path) throw new Error('Unexpected objects URL');
        const catalog = decodeURIComponent(path[1]);
        const schema = decodeURIComponent(path[2]);
        const name = schema === 'clinical' ? 'patients' : 'deliveries';
        return { data: {
          items: [{
            name, catalog_name: catalog, schema_name: schema,
            full_name: `${catalog}.${schema}.${name}`,
            object_type: 'TABLE', display_type: 'TABLE',
          }],
          pagination: { page, has_next: false, total_items: 1, total_pages: 1 },
        } };
      }
      return { data: {
        items: [
          { name: 'multi_schema_catalog', catalog_type: 'MANAGED_CATALOG' },
          { name: 'two_schema_catalog', catalog_type: 'MANAGED_CATALOG' },
        ],
        pagination: { page, has_next: false, total_items: 2, total_pages: 1 },
      } };
    }),
    post: vi.fn(async (_url: string, body: {
      securables: { securable_type: string; full_name: string }[];
    }) => ({
      data: body.securables.map((item) => ({
        ...item, principal: 'workspace-readers',
        privileges: [{
          privilege: item.securable_type === 'CATALOG' ? 'USE_CATALOG'
            : item.securable_type === 'SCHEMA' ? 'USE_SCHEMA' : 'SELECT',
          inherited: false,
        }],
      })),
    })),
  },
}));

describe('Objects to Permissions discovery integration', () => {
  it('includes both regular and information_schema selections in Permissions', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CreateBlueprintPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(await screen.findByRole('button', { name: 'two_schema_catalog' }));
    await user.click(await screen.findByText('cts_004', { selector: 'span' }));
    await user.click(screen.getByText('information_schema', { selector: 'span' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'cts_004' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'information_schema' }).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Expand All' }));
    const catalog = screen.getByRole('region', { name: 'Role assignment: workspace-readers' });
    expect(within(catalog).getByRole<HTMLInputElement>('checkbox', { name: 'cts_004: USE_SCHEMA' }).checked).toBe(true);
    expect(within(catalog).getByRole<HTMLInputElement>('checkbox', { name: 'information_schema: USE_SCHEMA' }).checked).toBe(true);
    expect(screen.getAllByRole('region', { name: /^Role assignment:/ })).toHaveLength(1);
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/discovery/privileges', {
      securables: [
        { securable_type: 'CATALOG', full_name: 'two_schema_catalog' },
        { securable_type: 'SCHEMA', full_name: 'two_schema_catalog.cts_004' },
        { securable_type: 'SCHEMA', full_name: 'two_schema_catalog.information_schema' },
      ], include_inherited: true,
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Approvers — coming soon')).toBeTruthy();
  }, 15_000);

  it('retains schemas and objects across pages, focus changes and return navigation', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CreateBlueprintPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(await screen.findByRole('button', { name: 'multi_schema_catalog' }));
    await user.click(await screen.findByRole('checkbox', { name: 'clinical' }));
    await user.click(await screen.findByRole('checkbox', { name: /patients/ }));
    expect(screen.getByText('Schemas · Page 1 of 2')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    await user.click(await screen.findByRole('checkbox', { name: 'outbound' }));
    expect(screen.getByText('Schemas · Page 2 of 2')).toBeTruthy();
    await user.click(await screen.findByRole('checkbox', { name: /deliveries/ }));
    await user.click(screen.getByRole('button', { name: 'clinical' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /patients/ })).checked).toBe(true);
    await user.click(screen.getAllByRole('button', { name: 'Next' })[1]);

    await user.click(await screen.findByRole('button', { name: 'Expand All' }));
    const catalog = screen.getByRole('region', { name: 'Role assignment: workspace-readers' });
    expect(within(catalog).getByRole('checkbox', { name: 'clinical: USE_SCHEMA' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'outbound: USE_SCHEMA' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'patients: SELECT' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'deliveries: SELECT' })).toBeTruthy();
    expect(within(catalog).queryByRole('checkbox', { name: 'multi_schema_catalog: SELECT' })).toBeNull();
    expect(within(catalog).getByRole<HTMLInputElement>('checkbox', { name: 'patients: SELECT' }).checked).toBe(true);
    expect(within(catalog).getByRole<HTMLInputElement>('checkbox', { name: 'deliveries: SELECT' }).checked).toBe(true);
    await user.click(within(catalog).getByRole('checkbox', { name: 'patients: SELECT' }));
    expect(within(catalog).getByText('+0 granted, -1 revoked')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: 'outbound' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /deliveries/ })).checked).toBe(true);
    await user.click(screen.getAllByRole('button', { name: 'Next' })[1]);
    await user.click(await screen.findByRole('button', { name: 'Expand All' }));
    const returned = screen.getByRole('region', { name: 'Role assignment: workspace-readers' });
    expect(within(returned).getByRole<HTMLInputElement>('checkbox', { name: 'deliveries: SELECT' }).checked).toBe(true);
    expect(within(returned).getByRole<HTMLInputElement>('checkbox', { name: 'patients: SELECT' }).checked).toBe(false);
  }, 15_000);

  it('surfaces privileges API errors, blocks Next, and retries without demo grants', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      isAxiosError: true, response: {
        status: 403, data: { detail: { message: 'No permission to inspect this catalog.' } },
      },
    });
    const user = userEvent.setup();
    render(<MemoryRouter><CreateBlueprintPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(await screen.findByRole('button', { name: 'two_schema_catalog' }));
    await user.click(await screen.findByRole('checkbox', { name: 'cts_004' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('No permission to inspect this catalog.'));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true);
    expect(screen.queryByRole('region', { name: /^Role assignment:/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Role assignment: workspace-readers' })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(false);
  });
});
