import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CreateBlueprintPage } from './CreateBlueprintPage';

vi.mock('@/lib/apiClient', () => ({
  default: {
    get: vi.fn(async (url: string, config: { params: { page: number; schema_names?: string } }) => {
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
        const schema = config.params.schema_names;
        const name = schema === 'clinical' ? 'patients' : 'deliveries';
        return { data: {
          items: [{
            name, catalog_name: 'multi_schema_catalog', schema_name: schema,
            full_name: `multi_schema_catalog.${schema}.${name}`,
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
    const catalog = screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-two-schema-catalog' });
    expect(within(catalog).getByRole('checkbox', { name: 'cts_004: USE SCHEMA' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'information_schema: USE SCHEMA' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-two-schema-catalog-cts-004' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-two-schema-catalog-information-schema' })).toBeTruthy();
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
    const catalog = screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-multi-schema-catalog' });
    expect(within(catalog).getByRole('checkbox', { name: 'clinical: USE SCHEMA' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'outbound: USE SCHEMA' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'patients: SELECT' })).toBeTruthy();
    expect(within(catalog).getByRole('checkbox', { name: 'deliveries: SELECT' })).toBeTruthy();
    expect(within(catalog).queryByRole('checkbox', { name: 'multi_schema_catalog: SELECT' })).toBeNull();
    const clinical = screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-multi-schema-catalog-clinical' });
    const outbound = screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-multi-schema-catalog-outbound' });
    expect(within(clinical).getByRole('checkbox', { name: 'patients: SELECT' })).toBeTruthy();
    expect(within(clinical).queryByRole('checkbox', { name: 'deliveries: SELECT' })).toBeNull();
    expect(within(outbound).getByRole('checkbox', { name: 'deliveries: SELECT' })).toBeTruthy();
    expect(within(outbound).queryByRole('checkbox', { name: 'patients: SELECT' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: 'outbound' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /deliveries/ })).checked).toBe(true);
    await user.click(screen.getAllByRole('button', { name: 'Next' })[1]);
    await user.click(await screen.findByRole('button', { name: 'Expand All' }));
    expect(within(screen.getByRole('region', { name: 'Role assignment: dbx-dev-gpd-user-multi-schema-catalog' }))
      .getByRole('checkbox', { name: 'deliveries: SELECT' })).toBeTruthy();
  }, 15_000);
});
