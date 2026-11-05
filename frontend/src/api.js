import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// The static admin API key (must match backend ADMIN_API_KEY env var, default: dev-admin)
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_KEY || "dev-admin";

// Intercept all global axios requests since many components import axios directly
axios.interceptors.request.use((config) => {
  const jwtToken = localStorage.getItem("admin_token");
  if (jwtToken) {
    config.headers.Authorization = `Bearer ${jwtToken}`; 
  }
  // Always send the static admin key for upload/edit endpoints
  config.headers["X-Admin-Key"] = ADMIN_API_KEY;
  return config;
});

// Auto-handle 401: clear stale token and reload to login
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear auth and force re-login
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_session");
      if (!window.location.pathname.includes("/login")) {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const jwtToken = localStorage.getItem("admin_token");
  if (jwtToken) {
    config.headers.Authorization = `Bearer ${jwtToken}`; 
  }
  config.headers["X-Admin-Key"] = ADMIN_API_KEY;
  return config;
});

export default api;

// Returns headers for upload/edit requests that require admin key
export const getAdminKeyHeader = () => {
  const jwtToken = localStorage.getItem("admin_token");
  const headers = { "X-Admin-Key": ADMIN_API_KEY };
  if (jwtToken) {
    headers.Authorization = `Bearer ${jwtToken}`;
  }
  return headers;
};
