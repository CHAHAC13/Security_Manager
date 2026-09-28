import { useCallback, useEffect, useState } from 'react';
import type { AccessMatrixEntry } from '@/types/access-matrix';
import {
  getAccessMatrix,
  type AccessMatrixParams,
} from '@/services/accessMatrixService';

interface UseAccessMatrixReturn {
  data: AccessMatrixEntry[];
  loading: boolean;
  error: string | null;
  refetch: (params?: AccessMatrixParams) => Promise<void>;
}

/**
 * Custom hook to fetch access-matrix data from the backend via Axios.
 * Handles loading / error states and exposes a `refetch` for manual refresh.
 */
export function useAccessMatrix(
  params?: AccessMatrixParams,
): UseAccessMatrixReturn {
  const [data, setData] = useState<AccessMatrixEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (queryParams?: AccessMatrixParams) => {
    try {
      setLoading(true);
      setError(null);
      const entries = await getAccessMatrix(queryParams);
      setData(entries);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch access matrix';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(params);
  }, [fetchData, params]);

  return { data, loading, error, refetch: fetchData };
}
