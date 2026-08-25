export const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

/** Sent on PATCH return-inventory only; set VITE_ADMIN_KEY to match server ADMIN_API_KEY */
export const getAdminKeyHeader = () => ({
  "X-Admin-Key": import.meta.env.VITE_ADMIN_KEY ?? "dev-admin",
});
