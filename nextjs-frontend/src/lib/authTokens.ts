import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

let refreshPromise: Promise<string | null> | null = null;

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded));
    return decoded;
  } catch {
    return null;
  }
}

function isTokenStale(token: string, leewaySeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + leewaySeconds;
}

export function getStoredAccessToken(): string | null {
  const cookieToken = Cookies.get('access_token');
  if (cookieToken) return cookieToken;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export function getStoredRefreshToken(): string | null {
  const cookieToken = Cookies.get('refresh_token');
  if (cookieToken) return cookieToken;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
}

export function persistTokens(access: string, refresh?: string): void {
  Cookies.set('access_token', access, { expires: 1, path: '/' });
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', access);
  }

  if (refresh) {
    Cookies.set('refresh_token', refresh, { expires: 7, path: '/' });
    if (typeof window !== 'undefined') {
      localStorage.setItem('refresh_token', refresh);
    }
  }
}

export function clearStoredTokens(): void {
  Cookies.remove('access_token', { path: '/' });
  Cookies.remove('refresh_token', { path: '/' });
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredTokens();
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE}/token/refresh/`, { refresh: refreshToken })
      .then((response) => {
        const access = response.data?.access;
        if (!access) {
          clearStoredTokens();
          return null;
        }
        persistTokens(access);
        return access;
      })
      .catch(() => {
        clearStoredTokens();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function getValidAccessToken(): Promise<string | null> {
  const current = getStoredAccessToken();
  if (!current) return null;

  if (!isTokenStale(current)) {
    return current;
  }

  const refreshed = await refreshAccessToken();
  return refreshed;
}
