import axios from 'axios';

export const API_BASE = "http://localhost:8000";

// Intercept all global axios requests since many components import axios directly
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`; 
  }
  return config;
});

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`; 
  }
  return config;
});

export default api;
export const getAdminKeyHeader = () => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};
