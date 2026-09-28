import apiClient from '@/lib/apiClient';
import type { AccessMatrixEntry } from '@/types/access-matrix';

/* ── Backend response DTOs ── */

/** Shape of a single row returned by the backend */
export interface AccessMatrixApiItem {
  id: number;
  blueprint: string;
  version: string;
  environment: string;
  level: string;
  role_name: string;
  object_name: string;
  privilege: string;
  request_manager: boolean;
  form_type: string;
  display_name: string;
  technical_approver: string;
  Business_approver: string;
  status: string;
}

/** Shape of the GET /api/access-matrix response */
export interface AccessMatrixApiResponse {
  count: number;
  items: AccessMatrixApiItem[];
}

/* ── Query params accepted by the endpoint ── */

export interface AccessMatrixParams {
  environment?: string;
  blueprint?: string;
  role_name?: string;
}

/* ── Mapper: backend → frontend model ── */

function toAccessMatrixEntry(item: AccessMatrixApiItem): AccessMatrixEntry {
  return {
    id: String(item.id),
    blueprintName: item.blueprint,
    version: item.version,
    environment: item.environment as AccessMatrixEntry['environment'],
    roleName: item.role_name,
    privilege: item.privilege,
    techApprover: item.technical_approver,
    rmForm: item.form_type as AccessMatrixEntry['rmForm'],
  };
}

/* ── API call ── */

/**
 * Fetch the access matrix from the backend.
 * All query params are optional — omitting them returns the full list.
 */
export async function getAccessMatrix(
  params?: AccessMatrixParams,
): Promise<AccessMatrixEntry[]> {
  const { data } = await apiClient.get<AccessMatrixApiResponse>(
    '/api/access-matrix',
    { params },
  );
  return data.items.map(toAccessMatrixEntry);
}
