import axios from 'axios';
import { API_BASE } from './config';
import { firebaseAuth } from './firebase';

const api = axios.create({ baseURL: API_BASE, withCredentials: true });

const LEGACY_ACCESS_KEY = 'knoprix_mr_access_token';
const LEGACY_REFRESH_KEY = 'knoprix_mr_refresh_token';
let legacyAccessToken = null;
let refreshRequest = null;

export function refreshLegacySession() {
  if (!refreshRequest) {
    refreshRequest = axios
      .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export function setAccessToken(token) {
  legacyAccessToken = token;
}

export function clearAccessToken() {
  legacyAccessToken = null;
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

export async function getAccessToken(forceRefresh = false) {
  const firebaseUser = firebaseAuth?.currentUser;
  if (firebaseUser) return firebaseUser.getIdToken(forceRefresh);
  return legacyAccessToken;
}

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isRefreshRequest = original?.url?.endsWith('/auth/refresh');
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      firebaseAuth?.currentUser
    ) {
      original._retry = true;
      try {
        const token = await getAccessToken(true);
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isRefreshRequest
    ) {
      original._retry = true;
      try {
        const { data } = await refreshLegacySession();
        setAccessToken(data.tokens.accessToken);
        original.headers.Authorization = `Bearer ${data.tokens.accessToken}`;
        return api(original);
      } catch {
        clearAccessToken();
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
