import axios from 'axios';
import { API_BASE } from './config';

const api = axios.create({ baseURL: API_BASE });

// Distinct token keys (knoprix_mr_*) so stale sessions from the original
// knoprix-v2 project can never leak into this review build.
const ACCESS_KEY = 'knoprix_mr_access_token';
const REFRESH_KEY = 'knoprix_mr_refresh_token';

export { ACCESS_KEY, REFRESH_KEY };

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (error.response?.status === 401 && !original?._retry && refreshToken) {
      original._retry = true;
      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem(ACCESS_KEY, data.tokens.accessToken);
        localStorage.setItem(REFRESH_KEY, data.tokens.refreshToken);
        original.headers.Authorization = `Bearer ${data.tokens.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
