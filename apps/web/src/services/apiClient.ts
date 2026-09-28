import axios, { AxiosError } from 'axios';
import { useSessionStore } from '@/stores/session.store';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
});

// The API base URL ends in "/api/v1"; uploaded images (menu photos) are served
// from the same host/port but at "/uploads/...", so strip the "/api/v1" suffix
// to get the origin to prefix relative image URLs with. Works both behind
// nginx (single port 80) and in local dev hitting the api container directly.
export const API_ORIGIN = (api.defaults.baseURL ?? '').replace(/\/api\/v1\/?$/, '');

export function resolveImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url}`;
}

api.interceptors.request.use((config) => {
  const token = useSessionStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshingPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const { refreshToken, principalType, setSession, clearSession, displayName } = useSessionStore.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
    const newAccess = data.data.accessToken as string;
    const newRefresh = data.data.refreshToken as string;
    setSession(newAccess, newRefresh, principalType ?? 'CUSTOMER', displayName ?? '');
    return newAccess;
  } catch {
    clearSession();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshingPromise) refreshingPromise = tryRefresh().finally(() => (refreshingPromise = null));
      const newToken = await refreshingPromise;
      if (newToken && original) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string } | undefined)?.message ?? err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
