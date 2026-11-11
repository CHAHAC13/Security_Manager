import { useCallback, useEffect, useRef, useState } from 'react';
import {
  objectDiscoveryService,
  type DiscoveryPage,
} from '@/services/objectDiscoveryService';
import type { CatalogOption, ObjectOption, SchemaOption } from '@/types/blueprint';

const PAGE_SIZE = 5;
const CATALOG_KEY_PREFIX = 'catalogs:';

interface PageState<T> {
  key: string | null;
  items: T[];
  pages: T[][];
  pageIndex: number;
  nextCursor: string | null;
  totalItems: number | null;
  totalPages: number | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

interface CachedPage<T> {
  items: T[];
  pages: T[][];
  pageIndex: number;
  nextCursor: string | null;
  totalItems: number;
  totalPages: number;
  expiresAt: number;
}

type PageLoader<T> = (
  key: string,
  cursor: string | null,
  signal: AbortSignal,
) => Promise<DiscoveryPage<T>>;

const EMPTY_STATE: PageState<never> = {
  key: null,
  items: [],
  pages: [],
  pageIndex: 0,
  nextCursor: null,
  totalItems: null,
  totalPages: null,
  loading: false,
  loadingMore: false,
  error: null,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const catalogCache = new Map<string, CachedPage<CatalogOption>>();
const schemaCache = new Map<string, CachedPage<SchemaOption>>();
const objectCache = new Map<string, CachedPage<ObjectOption>>();

export function objectDiscoveryKey(catalogName: string, schemaName: string): string {
  return JSON.stringify([catalogName, schemaName]);
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const items = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) items.set(item.id, item);
  return [...items.values()];
}

function usePagedResource<T extends { id: string }>(
  key: string | null,
  loadPage: PageLoader<T>,
  cache: Map<string, CachedPage<T>>,
) {
  const requestController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const currentKey = useRef(key);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PageState<T>>(EMPTY_STATE);
  currentKey.current = key;

  useEffect(() => {
    requestController.current?.abort();
    if (!key) {
      setState(EMPTY_STATE);
      return;
    }

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setState({
        key,
        items: cached.items,
        pages: cached.pages,
        pageIndex: cached.pageIndex,
        nextCursor: cached.nextCursor,
        totalItems: cached.totalItems,
        totalPages: cached.totalPages,
        loading: false,
        loadingMore: false,
        error: null,
      });
      return;
    }
    cache.delete(key);

    const controller = new AbortController();
    requestController.current = controller;
    setState({ ...EMPTY_STATE, key, loading: true });

    loadPage(key, null, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || currentKey.current !== key) return;
        const items = mergeById([], page.items);
        const pages = [page.items];
        const totals = { totalItems: page.totalItems, totalPages: page.totalPages };
        cache.set(key, { items, pages, pageIndex: 0, nextCursor: page.nextCursor, ...totals, expiresAt: Date.now() + CACHE_TTL_MS });
        setState({ key, items, pages, pageIndex: 0, nextCursor: page.nextCursor, ...totals, loading: false, loadingMore: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentKey.current !== key) return;
        setState((current) => ({
          ...current,
          key,
          loading: false,
          loadingMore: false,
          error: error instanceof Error ? error.message : 'Discovery request failed',
        }));
      });

    return () => controller.abort();
  }, [cache, key, loadPage, revision]);

  const visibleState = state.key === key ? state : (EMPTY_STATE as PageState<T>);

  const loadMore = useCallback(async () => {
    if (!key || state.key !== key || state.loadingMore || loadingMoreRef.current) return;
    if (state.pageIndex < state.pages.length - 1) {
      setState((current) => ({ ...current, pageIndex: current.pageIndex + 1 }));
      return;
    }
    if (!state.nextCursor) return;

    const cursor = state.nextCursor;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    loadingMoreRef.current = true;
    setState((current) => ({ ...current, loadingMore: true, error: null }));

    try {
      const page = await loadPage(key, cursor, controller.signal);
      if (controller.signal.aborted || currentKey.current !== key) return;
      const cached = cache.get(key) ?? { items: [], pages: [], pageIndex: 0, nextCursor: null, expiresAt: 0 };
      const items = mergeById(cached.items, page.items);
      const pages = [...cached.pages, page.items];
      const pageIndex = pages.length - 1;
      const totals = { totalItems: page.totalItems, totalPages: page.totalPages };
      cache.set(key, { items, pages, pageIndex, nextCursor: page.nextCursor, ...totals, expiresAt: Date.now() + CACHE_TTL_MS });
      setState({ key, items, pages, pageIndex, nextCursor: page.nextCursor, ...totals, loading: false, loadingMore: false, error: null });
    } catch (error) {
      if (controller.signal.aborted || currentKey.current !== key) return;
      setState((current) => ({
        ...current,
        loadingMore: false,
        error: error instanceof Error ? error.message : 'Discovery request failed',
      }));
    } finally {
      loadingMoreRef.current = false;
    }
  }, [cache, key, loadPage, state]);

  const loadPrevious = useCallback(() => {
    setState((current) => ({
      ...current,
      pageIndex: Math.max(0, current.pageIndex - 1),
    }));
  }, []);

  const retry = useCallback(() => {
    if (!key) return;
    requestController.current?.abort();
    loadingMoreRef.current = false;
    cache.delete(key);
    setRevision((current) => current + 1);
  }, [cache, key]);

  const getCachedItems = useCallback(
    (cacheKey: string) => cache.get(cacheKey)?.items ?? [],
    [cache],
  );

  const hasNextPage = visibleState.pageIndex < visibleState.pages.length - 1 || Boolean(visibleState.nextCursor);
  const pageItems = visibleState.pages[visibleState.pageIndex] ?? [];

  return {
    ...visibleState,
    pageItems,
    hasNextPage,
    hasPreviousPage: visibleState.pageIndex > 0,
    loadMore,
    loadPrevious,
    retry,
    getCachedItems,
  };
}

const loadCatalogPage: PageLoader<CatalogOption> = (key, cursor, signal) =>
  objectDiscoveryService.getCatalogs({
    limit: PAGE_SIZE,
    cursor,
    signal,
    search: key.slice(CATALOG_KEY_PREFIX.length) || undefined,
  });

const loadSchemaPage: PageLoader<SchemaOption> = (catalogId, cursor, signal) =>
  objectDiscoveryService.getSchemas(catalogId, { limit: PAGE_SIZE, cursor, signal });

const loadObjectPage: PageLoader<ObjectOption> = (key, cursor, signal) => {
  const [catalogName, schemaName] = JSON.parse(key) as [string, string];
  return objectDiscoveryService.getObjects(catalogName, schemaName, {
    limit: PAGE_SIZE,
    cursor,
    signal,
  });
};

export function useObjectDiscovery(
  catalogId: string | null,
  schemaId: string | null,
  catalogSearch = '',
) {
  const normalizedSearch = catalogSearch.trim();
  const [debouncedSearch, setDebouncedSearch] = useState(normalizedSearch);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 300);
    return () => window.clearTimeout(timeout);
  }, [normalizedSearch]);

  const catalogs = usePagedResource(`${CATALOG_KEY_PREFIX}${debouncedSearch}`, loadCatalogPage, catalogCache);
  const schemas = usePagedResource(catalogId, loadSchemaPage, schemaCache);
  const objectKey = catalogId && schemaId
    ? objectDiscoveryKey(catalogId, schemaId)
    : null;
  const objects = usePagedResource(objectKey, loadObjectPage, objectCache);

  return {
    catalogs: { ...catalogs, searching: normalizedSearch !== debouncedSearch },
    schemas,
    objects,
  };
}