import axios from 'axios';
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
    catalogName: string,
    schemaName: string,
    request: DiscoveryPageRequest,
  ): Promise<DiscoveryPage<ObjectOption>>;
}

interface ApiPagination {
  page: number;
  has_next: boolean;
}

interface ApiPage<T> {
  items: T[];
  pagination: ApiPagination;
}

interface ApiCatalog {
  name: string;
  catalog_type: string;
}

interface ApiSchema {
  name: string;
  catalog_name: string;
}

interface ApiObject {
  name: string;
  catalog_name: string;
  schema_name: string;
  full_name: string;
  object_type: string;
  display_type: 'TABLE' | 'VIEW';
}

interface ApiErrorBody {
  detail?: string | { message?: string };
}

function pageNumber(request: DiscoveryPageRequest): number {
  if (!request.cursor) return 1;
  const page = Number(request.cursor);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Invalid discovery page cursor');
  }
  return page;
}

function apiPage<TApi, TOption>(
  data: ApiPage<TApi> | undefined,
  mapItem: (item: TApi) => TOption,
): DiscoveryPage<TOption> {
  if (!data || !Array.isArray(data.items) || !data.pagination) {
    throw new Error('Unexpected discovery response: items or pagination not found');
  }
  return {
    items: data.items.map(mapItem),
    nextCursor: data.pagination.has_next
      ? String(data.pagination.page + 1)
      : null,
  };
}

function apiError(error: unknown): Error {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return new Error(detail);
    if (detail?.message) return new Error(detail.message);
    if (error.response?.status) {
      return new Error(`Discovery request failed (${error.response.status})`);
    }
  }
  return error instanceof Error ? error : new Error('Discovery request failed');
}

async function withApiErrors<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw apiError(error);
  }
}

function apiPageParams(request: DiscoveryPageRequest) {
  return {
    page: pageNumber(request),
    page_size: request.limit,
    search: request.search,
  };
}

export const apiObjectDiscoveryService: ObjectDiscoveryService = {
  async getCatalogs(request) {
    return withApiErrors(async () => {
      const { data } = await apiClient.get<ApiPage<ApiCatalog>>(
        '/api/v1/discovery/catalogs',
        { params: apiPageParams(request), signal: request.signal },
      );
      return apiPage(data, (item) => ({
        id: item.name,
        name: item.name,
        catalogType: item.catalog_type,
      }));
    });
  },
  async getSchemas(catalogId, request) {
    return withApiErrors(async () => {
      const { data } = await apiClient.get<ApiPage<ApiSchema>>(
        `/api/v1/discovery/catalogs/${encodeURIComponent(catalogId)}/schemas`,
        { params: apiPageParams(request), signal: request.signal },
      );
      return apiPage(data, (item) => ({
        id: item.name,
        name: item.name,
        catalogId: item.catalog_name,
      }));
    });
  },
  async getObjects(catalogName, schemaName, request) {
    return withApiErrors(async () => {
      const objectType = request.kind === 'table'
        ? 'TABLE'
        : request.kind
          ? 'VIEW'
          : 'ALL';
      const { data } = await apiClient.get<ApiPage<ApiObject>>(
        `/api/v1/discovery/catalogs/${encodeURIComponent(catalogName)}/objects`,
        {
          params: {
            ...apiPageParams(request),
            schema_names: schemaName,
            object_type: objectType,
          },
          signal: request.signal,
        },
      );
      return apiPage(data, (item) => ({
        id: item.full_name,
        name: item.name,
        schemaId: item.schema_name,
        kind: item.object_type === 'MATERIALIZED_VIEW'
          ? 'materialized_view'
          : item.display_type === 'VIEW'
            ? 'view'
            : 'table',
        source: 'existing',
      }));
    });
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
  async getObjects(catalogId, schemaId, request) {
    await mockRequest(request.signal);
    const schema = MOCK_SCHEMAS.find(
      (item) => item.catalogId === catalogId && (item.id === schemaId || item.name === schemaId),
    );
    const objects = MOCK_OBJECTS.filter(
      (object) => object.schemaId === schema?.id && (!request.kind || object.kind === request.kind),
    );
    return pageItems(objects, request);
  },
};

export const objectDiscoveryService = apiObjectDiscoveryService;