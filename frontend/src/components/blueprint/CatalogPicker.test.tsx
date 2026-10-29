import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CatalogPicker } from './CatalogPicker';

function setup() {
  const props = {
    value: '', search: '', loading: false, loadingMore: false, error: null, hasMore: true,
    items: [{ id: 'first', name: 'First catalog' }],
    onSearchChange: vi.fn(), onChange: vi.fn(), onLoadMore: vi.fn(), onRetry: vi.fn(),
  };
  function content(overrides: Partial<typeof props> = {}) {
    return <><CatalogPicker {...props} {...overrides} /><button type="button">Outside picker</button></>;
  }
  const view = render(content());
  return { props, update: (overrides: Partial<typeof props>) => view.rerender(content(overrides)) };
}

describe('catalog picker load-more focus', () => {
  it('keeps the picker open during repeated loads, blocks duplicate activation, and retains focus on the last page', async () => {
    const user = userEvent.setup();
    const { props, update } = setup();
    const trigger = screen.getByRole('button', { name: 'Catalog selection: Select a catalog' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Load more catalogs' }));
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
    update({ loadingMore: true });
    const loadingButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Loading catalogs…' });
    expect(loadingButton.disabled).toBe(false);
    expect(loadingButton.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(loadingButton);
    expect(screen.getByRole('dialog', { name: 'Choose a catalog' })).toBeTruthy();
    await user.click(loadingButton);
    await user.keyboard('{Enter}');
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);

    const moreItems = [...props.items, { id: 'second', name: 'Second catalog' }];
    update({ items: moreItems });
    expect(screen.getByRole('button', { name: 'First catalog' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Second catalog' })).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(props.onLoadMore).toHaveBeenCalledTimes(2);
    update({ items: moreItems, loadingMore: true });
    update({ items: [...moreItems, { id: 'last', name: 'Last catalog' }], hasMore: false });
    expect(screen.getByRole('dialog', { name: 'Choose a catalog' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last catalog' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more catalogs' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search catalogs' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it.each(['pointer', 'keyboard'])('still closes when %s focus leaves during a load', async (method) => {
    const user = userEvent.setup();
    const { update } = setup();
    await user.click(screen.getByRole('button', { name: 'Catalog selection: Select a catalog' }));
    await user.click(screen.getByRole('button', { name: 'Load more catalogs' }));
    update({ loadingMore: true });
    if (method === 'pointer') await user.click(screen.getByRole('button', { name: 'Outside picker' }));
    else await user.tab();
    expect(screen.queryByRole('dialog', { name: 'Choose a catalog' })).toBeNull();
  });

  it('still closes on Escape or catalog selection and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    const trigger = screen.getByRole('button', { name: 'Catalog selection: Select a catalog' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choose a catalog' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'First catalog' }));
    expect(props.onChange).toHaveBeenCalledWith('first');
    expect(screen.queryByRole('dialog', { name: 'Choose a catalog' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
