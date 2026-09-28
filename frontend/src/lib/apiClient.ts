import axios from 'axios';

/**
 * Centralized Axios instance for all API calls.
 * Base URL is empty so requests go through the Vite dev proxy (/api/...).
 * In production the same origin serves both frontend and backend.
 */
const apiClient = axios.create({
  baseURL: '',
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/* ── Request interceptor ── */
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token here when authentication is implemented
    // const token = getToken();
    // if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

/* ── Response interceptor ── */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Centralised error handling (logging, toast, redirect on 401, etc.)
    console.error('[API Error]', error.response?.status, error.message);
    return Promise.reject(error);
  },
);

export default apiClient;
