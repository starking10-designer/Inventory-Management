import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import { ChevronLeft, Warehouse, Search } from "lucide-react";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

function pivotReturnInventory(rows) {
  const sizeSet = new Set();
  const byKey = new Map();

  for (const r of rows) {
    const key = `${r.style}\x00${r.color}`;
    const size = String(r.size || "").toUpperCase().trim();
    if (size) sizeSet.add(size);

    if (!byKey.has(key)) {
      byKey.set(key, {
        style: r.style,
        color: r.color,
        displayColor: r.display_color ?? r.color,
        cells: {},
      });
    }
    if (size) {
      byKey.get(key).cells[size] = { id: r.id, qty: r.qty };
    }
  }

  const ordered = SIZE_ORDER.filter((s) => sizeSet.has(s));
  const extra = [...sizeSet]
    .filter((s) => !SIZE_ORDER.includes(s))
    .sort();
  const sizes = [...ordered, ...extra];

  const grouped = Array.from(byKey.values()).sort(
    (a, b) =>
      a.style.localeCompare(b.style) || a.color.localeCompare(b.color),
  );

  return { grouped, sizes };
}

function formatCellQty(qty) {
  if (qty === undefined || qty === null) return "-";
  if (qty === 0) return "-";
  return qty;
}

export default function InventoryPage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [inventoryRows, setInventoryRows] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [editingCellId, setEditingCellId] = useState(null);
  const [editInventoryQty, setEditInventoryQty] = useState("");

  const { grouped, sizes } = useMemo(
    () => pivotReturnInventory(inventoryRows),
    [inventoryRows],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadReturnInventory = async (search) => {
    setInventoryLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const { data } = await axios.get(`${API_BASE}/return-inventory`, {
        params,
      });
      setInventoryRows(data.rows ?? []);
    } catch (e) {
      console.error(e);
      alert("Failed to load return inventory");
      setInventoryRows([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    loadReturnInventory(debouncedSearch);
  }, [debouncedSearch]);

  const saveInventoryQty = async (id) => {
    const qty = parseInt(editInventoryQty, 10);
    if (Number.isNaN(qty) || qty < 0) {
      alert("Enter a valid non-negative quantity");
      return;
    }
    try {
      await axios.patch(
        `${API_BASE}/return-inventory/${id}`,
        { qty },
        { headers: getAdminKeyHeader() },
      );
      setEditingCellId(null);
      await loadReturnInventory(debouncedSearch);
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail;
      alert(
        typeof msg === "string"
          ? msg
          : "Save failed. Set VITE_ADMIN_KEY in frontend .env to match server ADMIN_API_KEY.",
      );
    }
  };

  const colSpan = 2 + sizes.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-100 text-slate-800">
      <div className="border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft size={18} />
            Home
          </Link>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Warehouse className="text-emerald-600" size={22} />
            Return inventory
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <p className="text-slate-500 text-sm mb-4">
          Same layout as the final report: quantities by size column. Search
          style, color, or size. Click a quantity to edit.
        </p>

        <div className="relative mb-6 max-w-xl">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products (style, color, size)…"
            className="w-full rounded-xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {inventoryLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              Loading…
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="max-h-[calc(100vh-14rem)] overflow-auto">
            <table className="w-full text-sm text-center border-collapse min-w-max">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#1F4E78] text-white text-xs uppercase tracking-wide">
                  <th
                    rowSpan={2}
                    className="px-3 py-2.5 border border-[#1a4268] text-left align-middle"
                  >
                    Style
                  </th>
                  <th
                    rowSpan={2}
                    className="px-3 py-2.5 border border-[#1a4268] text-left align-middle"
                  >
                    Color
                  </th>
                  {sizes.map((size) => (
                    <th
                      key={size}
                      className="px-3 py-2 border border-[#1a4268] font-semibold"
                    >
                      {size}
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#1F4E78] text-white text-[10px] uppercase tracking-wide">
                  {sizes.map((size) => (
                    <th
                      key={`sub-${size}`}
                      className="px-2 py-1.5 border border-[#1a4268] font-normal"
                    >
                      Return Qty
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(colSpan, 2)}
                      className="px-4 py-16 text-center text-slate-500 bg-white/70"
                    >
                      No matching rows. Clear the search or upload returns to
                      populate inventory.
                    </td>
                  </tr>
                ) : (
                  grouped.map((row) => (
                    <tr
                      key={`${row.style}-${row.color}`}
                      className="border-t border-slate-100 hover:bg-slate-50/80 bg-white/70"
                    >
                      <td
                        className="px-3 py-2 text-left max-w-[180px] truncate border border-slate-100"
                        title={row.style}
                      >
                        {row.style}
                      </td>
                      <td
                        className="px-3 py-2 text-left max-w-[160px] truncate border border-slate-100"
                        title={row.displayColor}
                      >
                        {row.displayColor}
                      </td>
                      {sizes.map((size) => {
                        const cell = row.cells[size];
                        const isEditing =
                          cell && editingCellId === cell.id;

                        return (
                          <td
                            key={size}
                            className="px-2 py-2 border border-slate-100 tabular-nums"
                          >
                            {!cell ? (
                              <span className="text-slate-400">-</span>
                            ) : isEditing ? (
                              <div className="flex flex-col items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={editInventoryQty}
                                  onChange={(e) =>
                                    setEditInventoryQty(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      saveInventoryQty(cell.id);
                                    }
                                  }}
                                  className="w-16 rounded border border-slate-200 px-1 py-0.5 text-center text-xs"
                                />
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => saveInventoryQty(cell.id)}
                                    className="text-emerald-700 text-[10px] font-semibold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCellId(null)}
                                    className="text-slate-500 text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCellId(cell.id);
                                  setEditInventoryQty(String(cell.qty));
                                }}
                                className="w-full font-medium hover:text-indigo-600 hover:underline"
                                title="Click to edit"
                              >
                                {formatCellQty(cell.qty)}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200/80 px-4 py-2 text-xs text-slate-500 bg-white/60">
            {grouped.length} style/color row
            {grouped.length === 1 ? "" : "s"}
            {sizes.length > 0
              ? ` · sizes: ${sizes.join(", ")}`
              : ""}
            {debouncedSearch ? ` · search: “${debouncedSearch}”` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
