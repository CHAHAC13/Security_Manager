import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBlueprintPage } from './CreateBlueprintPage';
import { objectDiscoveryService } from '@/services/objectDiscoveryService';
import { createMockPermissionsService } from '@/services/permissionsService';

vi.mock('@/services/objectDiscoveryService', () => ({
  objectDiscoveryService: {
    catalogNameExists: vi.fn(),
    schemaNameExists: vi.fn(),
    objectNameExists: vi.fn(),
    getCatalogs: vi.fn(),
    getSchemas: vi.fn(),
    getObjects: vi.fn(),
  },
}));

const empty = { items: [], nextCursor: null, totalItems: 0, totalPages: 0 };
const service = { ...createMockPermissionsService(), getExistingRolesForObjects: async () => [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(objectDiscoveryService.catalogNameExists).mockResolvedValue(false);
  vi.mocked(objectDiscoveryService.schemaNameExists).mockResolvedValue(false);
  vi.mocked(objectDiscoveryService.objectNameExists).mockResolvedValue(false);
  vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue(empty);
  vi.mocked(objectDiscoveryService.getSchemas).mockResolvedValue(empty);
  vi.mocked(objectDiscoveryService.getObjects).mockResolvedValue(empty);
});

async function enterObjects() {
  const user = userEvent.setup();
  render(<MemoryRouter><CreateBlueprintPage service={service} /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Next' }));
  return user;
}

describe('proposed resources', () => {
  it.each([false, true])('selects a new catalog and initializes one blank role (with children: %s)', async (children) => {
    const user = await enterObjects();
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    await user.type(screen.getByPlaceholderText('dbx-<env>-gpd-<role>-<catalog>'), 'new_catalog');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText(/New proposed catalog:/);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Catalog selection: Select a catalog' }).disabled).toBe(true);
    expect(objectDiscoveryService.getSchemas).not.toHaveBeenCalled();
    if (children) {
      await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
      await user.type(screen.getByLabelText('Proposed schema name'), 'new_schema');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: 'new_schema' })).checked).toBe(true);
      await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
      await user.type(screen.getByLabelText('Proposed object name'), 'new_table');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /new_table/ })).checked).toBe(true);
      expect(objectDiscoveryService.getObjects).not.toHaveBeenCalled();
    }
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const role = await screen.findByRole('region', { name: 'Role assignment: Untitled role' });
    expect(within(role).getByLabelText<HTMLInputElement>('Role Name *').value).toBe('');
    expect(within(role).getByLabelText<HTMLSelectElement>('Role Type *').value).toBe('');
    expect(within(role).getAllByText('new_catalog').length).toBeGreaterThan(0);
    if (children) {
      expect(within(role).getAllByText('new_schema').length).toBeGreaterThan(0);
      expect(within(role).getAllByText('new_table').length).toBeGreaterThan(0);
    }
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: '+ Create Role Assignment' });
    expect(screen.getAllByRole('region', { name: /^Role assignment:/ })).toHaveLength(1);
    if (!children) {
      await user.click(screen.getByRole('button', { name: 'Role assignment: Untitled role' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByRole('button', { name: '+ Create Role Assignment' });
      expect(screen.queryByRole('region', { name: /^Role assignment:/ })).toBeNull();
    }
  }, 20_000);

  it('blocks duplicate local proposals and reports catalog validation errors', async () => {
    const user = await enterObjects();
    vi.mocked(objectDiscoveryService.catalogNameExists)
      .mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('Catalog check unavailable')).mockResolvedValue(false);
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    await user.type(screen.getByLabelText('Proposed catalog name'), 'taken');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Catalog name already exists.');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Catalog check unavailable');
    await user.clear(screen.getByLabelText('Proposed catalog name'));
    await user.type(screen.getByLabelText('Proposed catalog name'), 'fresh');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText(/New proposed catalog:/);
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'Example');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: 'Example' });
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'Report');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: /Report/ });
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'report');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Object name already exists.');
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'example');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Schema name already exists.');
  }, 20_000);

  it('checks fresh existing schema and object names even when the displayed lists are stale', async () => {
    const catalog = 'duplicate-check-catalog';
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue({
      items: [{ id: catalog, name: catalog }], nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.getSchemas).mockResolvedValue({
      items: [{ id: 'existing', name: 'existing', catalogId: catalog }], nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.schemaNameExists).mockResolvedValue(true);
    vi.mocked(objectDiscoveryService.objectNameExists).mockResolvedValue(true);
    const user = await enterObjects();
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search catalogs' }), catalog);
    await user.click(await screen.findByRole('button', { name: catalog }));
    await user.click(await screen.findByRole('checkbox', { name: 'existing' }));
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'TAKEN_SCHEMA');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Schema name already exists.');
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'TAKEN_OBJECT');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Object name already exists.');
    expect(objectDiscoveryService.schemaNameExists).toHaveBeenCalledWith(catalog, 'TAKEN_SCHEMA', expect.any(AbortSignal));
    expect(objectDiscoveryService.objectNameExists).toHaveBeenCalledWith(catalog, 'existing', 'TAKEN_OBJECT', expect.any(AbortSignal));
  });

  it('blocks navigation while a duplicate check is pending', async () => {
    let resolve!: (exists: boolean) => void;
    vi.mocked(objectDiscoveryService.catalogNameExists).mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = await enterObjects();
    await user.click(screen.getByRole('button', { name: 'Create New Catalog' }));
    fireEvent.change(screen.getByLabelText('Proposed catalog name'), { target: { value: 'checking' } });
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(true));
    resolve(false);
    await screen.findByText(/New proposed catalog:/);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next' }).disabled).toBe(false));
  });

  it('surfaces fresh schema and object check failures and permits retry', async () => {
    const catalog = 'failure-check-catalog';
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue({
      items: [{ id: catalog, name: catalog }], nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.getSchemas).mockResolvedValue({
      items: [{ id: 'existing', name: 'existing', catalogId: catalog }], nextCursor: null, totalItems: 1, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.schemaNameExists).mockRejectedValueOnce(new Error('Schema check failed'));
    vi.mocked(objectDiscoveryService.objectNameExists).mockRejectedValueOnce(new Error('Object check failed'));
    const user = await enterObjects();
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search catalogs' }), catalog);
    await user.click(await screen.findByRole('button', { name: catalog }));
    await user.click(await screen.findByRole('checkbox', { name: 'existing' }));
    await user.click(screen.getByRole('button', { name: 'Create New Schema' }));
    await user.type(screen.getByLabelText('Proposed schema name'), 'fresh_schema');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Schema check failed');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: 'fresh_schema' });
    await user.click(screen.getByRole('button', { name: 'existing' }));
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'fresh_object');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Object check failed');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /fresh_object/ })).checked).toBe(true);
  }, 20_000);

  it('keeps proposals separate when catalogs have schemas with the same name', async () => {
    vi.mocked(objectDiscoveryService.getCatalogs).mockResolvedValue({
      items: [{ id: 'scope-a', name: 'scope-a' }, { id: 'scope-b', name: 'scope-b' }],
      nextCursor: null, totalItems: 2, totalPages: 1,
    });
    vi.mocked(objectDiscoveryService.getSchemas).mockImplementation(async (catalogId) => ({
      items: [{ id: 'shared', name: 'shared', catalogId }], nextCursor: null, totalItems: 1, totalPages: 1,
    }));
    const user = await enterObjects();
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search catalogs' }), 'scope-');
    await user.click(await screen.findByRole('button', { name: 'scope-a' }));
    await user.click(await screen.findByRole('checkbox', { name: 'shared' }));
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'shared_table');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: /shared_table/ });
    await user.click(screen.getByRole('button', { name: 'Catalog selection: scope-a' }));
    await user.click(await screen.findByRole('button', { name: 'scope-b' }));
    await user.click(await screen.findByRole('checkbox', { name: 'shared' }));
    expect(screen.queryByRole('checkbox', { name: /shared_table/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create New Table/View Definition' }));
    await user.type(screen.getByLabelText('Proposed object name'), 'shared_table');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole<HTMLInputElement>('checkbox', { name: /shared_table/ })).checked).toBe(true);
  }, 20_000);
});
