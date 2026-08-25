import axios from "axios";
import { API_BASE } from "../api.js";

export async function downloadInventoryExcel(inventoryType, search, filename) {
  const response = await axios.get(
    `${API_BASE}/inventory-export/${inventoryType}`,
    {
      params: search ? { search } : {},
      responseType: "blob",
    },
  );
  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function inventoryDownloadErrorMessage(error) {
  if (error.response?.data instanceof Blob) {
    try {
      const payload = JSON.parse(await error.response.data.text());
      return payload.detail || "Inventory download failed";
    } catch {
      return "Inventory download failed";
    }
  }
  return error.response?.data?.detail || "Inventory download failed";
}
