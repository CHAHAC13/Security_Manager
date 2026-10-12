import apiClient from '@/lib/apiClient';
import {
  MOCK_CATALOGS,
  MOCK_OBJECTS,
  MOCK_SCHEMAS,
} from '@/data/objectWizardData';
import type {
  CatalogOption,
  ObjectKind,
  ObjectOption,
  SchemaOption,
} from '@/types/blueprint';

export interface DiscoveryPageRequest {
  limit: number;
  cursor?: string | null;
  search?: string;
  kind?: ObjectKind;
  signal?: AbortSignal;
}

export interface DiscoveryPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ObjectDiscoveryService {
  getCatalogs(request: DiscoveryPageRequest): Promise<DiscoveryPage<CatalogOption>>;
  getSchemas(
    catalogId: string,
    request: DiscoveryPageRequest,
  ): Promise<DiscoveryPage<SchemaOption>>;
  getObjects(
    schemaId: string,
    request: DiscoveryPageRequest,
  ): Promise<DiscoveryPage<ObjectOption>>;
}

interface ApiPage<T> {
  items: T[];
  nextCursor: string | null;
}

function assertPage<T>(data: ApiPage<T> | undefined): DiscoveryPage<T> {
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Unexpected discovery response: items not found');
  }
  return { items: data.items, nextCursor: data.nextCursor ?? null };
}

function requestParams(request: DiscoveryPageRequest) {
  const { limit, cursor, search, kind } = request;
  return { limit, cursor, search, kind };
}

export const apiObjectDiscoveryService: ObjectDiscoveryService = {
  async getCatalogs(request) {
    const { data } = await apiClient.get<ApiPage<CatalogOption>>('/api/catalogs', {
      params: requestParams(request),
      signal: request.signal,
    });
    return assertPage(data);
  },
  async getSchemas(catalogId, request) {
    const { data } = await apiClient.get<ApiPage<SchemaOption>>(
      `/api/catalogs/${encodeURIComponent(catalogId)}/schemas`,
      { params: requestParams(request), signal: request.signal },
    );
    return assertPage(data);
  },
  async getObjects(schemaId, request) {
    const { data } = await apiClient.get<ApiPage<ObjectOption>>(
      `/api/schemas/${encodeURIComponent(schemaId)}/objects`,
      { params: requestParams(request), signal: request.signal },
    );
    return assertPage(data);
  },
};

function getOffset(cursor?: string | null): number {
  if (!cursor) return 0;
  const offset = Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('Invalid discovery cursor');
  }
  return offset;
}

function pageItems<T extends { name: string }>(
  items: T[],
  request: DiscoveryPageRequest,
): DiscoveryPage<T> {
  if (request.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');

  const search = request.search?.trim().toLocaleLowerCase();
  const filteredItems = search
    ? items.filter((item) => item.name.toLocaleLowerCase().includes(search))
    : items;
  const start = getOffset(request.cursor);
  const page = filteredItems.slice(start, start + request.limit);
  const nextOffset = start + page.length;

  return {
    items: page,
    nextCursor: nextOffset < filteredItems.length ? String(nextOffset) : null,
  };
}

function mockRequest(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }

    const timeout = window.setTimeout(resolve, 120);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Request aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export const mockObjectDiscoveryService: ObjectDiscoveryService = {
  async getCatalogs(request) {
    await mockRequest(request.signal);
    return pageItems(MOCK_CATALOGS, request);
  },
  async getSchemas(catalogId, request) {
    await mockRequest(request.signal);
    return pageItems(
      MOCK_SCHEMAS.filter((schema) => schema.catalogId === catalogId),
      request,
    );
  },
  async getObjects(schemaId, request) {
    await mockRequest(request.signal);
    const objects = MOCK_OBJECTS.filter(
      (object) => object.schemaId === schemaId && (!request.kind || object.kind === request.kind),
    );
    return pageItems(objects, request);
  },
};

// Switch to apiObjectDiscoveryService when the backend discovery routes are available.
export const objectDiscoveryService = mockObjectDiscoveryService;