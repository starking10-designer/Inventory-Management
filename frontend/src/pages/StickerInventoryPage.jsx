import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import { ChevronLeft, Search, Tag } from "lucide-react";

const COLOR_ORDER = [
  "1 black",
  "2 white",
  "3 grey",
  "4 sandal",
  "5 navy",
  "6 pink",
  "7 brown",
  "8 olive",
];

function pivotStickerInventory(rows) {
  const colorSet = new Set();
  const byStyle = new Map();

  for (const row of rows) {
    const color = String(row.color || "").trim();
    if (color) colorSet.add(color);

    if (!byStyle.has(row.style)) {
      byStyle.set(row.style, {
        style: row.style,
        cells: {},
        total: 0,
      });
    }

    if (color) {
      byStyle.get(row.style).cells[color] = {
        id: row.id,
        qty: row.qty,
      };
      byStyle.get(row.style).total += Number(row.qty || 0);
    }
  }

  const ordered = COLOR_ORDER.filter((color) => colorSet.has(color));
  const extra = [...colorSet]
    .filter((color) => !COLOR_ORDER.includes(color))
    .sort();

  return {
    colors: [...ordered, ...extra],
    grouped: Array.from(byStyle.values()).sort((a, b) =>
      a.style.localeCompare(b.style),
    ),
  };
}

function formatQty(qty) {
  if (qty === undefined || qty === null || qty === 0) return "-";
  return qty;
}

export default function StickerInventoryPage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingCellId, setEditingCellId] = useState(null);
  const [editQty, setEditQty] = useState("");

  const { grouped, colors } = useMemo(
    () => pivotStickerInventory(rows),
    [rows],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadStickerInventory = async (search) => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const { data } = await axios.get(`${API_BASE}/sticker-inventory`, {
        params,
      });
      setRows(data.rows ?? []);
    } catch (error) {
      console.error(error);
      alert("Failed to load sticker inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStickerInventory(debouncedSearch);
  }, [debouncedSearch]);

  const saveStickerQty = async (id) => {
    const qty = parseInt(editQty, 10);
    if (Number.isNaN(qty) || qty < 0) {
      alert("Enter a valid non-negative quantity");
      return;
    }

    try {
      await axios.patch(
        `${API_BASE}/sticker-inventory/${id}`,
        { qty },
        { headers: getAdminKeyHeader() },
      );
      setEditingCellId(null);
      await loadStickerInventory(debouncedSearch);
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.detail;
      alert(
        typeof msg === "string"
          ? msg
          : "Save failed. Set VITE_ADMIN_KEY in frontend .env to match server ADMIN_API_KEY.",
      );
    }
  };

  const colSpan = 2 + colors.length;

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
            <Tag className="text-emerald-600" size={22} />
            Sticker inventory
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <p className="text-slate-500 text-sm mb-4">
          detailed DTF Sticker quantity 
        </p>

        <div className="relative mb-6 max-w-xl">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search stickers (style or color)..."
            className="w-full rounded-xl border border-slate-200 bg-white/90 py-3 pl-10 pr-4 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              Loading...
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="max-h-[calc(100vh-14rem)] overflow-auto">
            <table className="w-full text-sm text-center border-collapse min-w-max">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#022658] text-white text-xs uppercase tracking-wide">
                  <th className="px-3 py-2.5 border border-[#022658] text-left align-middle">
                    Style
                  </th>
                  {colors.map((color) => (
                    <th
                      key={color}
                      className="px-3 py-2.5 border border-[#022658] font-semibold"
                    >
                      {color}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 border border-[#022658] align-middle">
                    Total Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(colSpan, 2)}
                      className="px-4 py-16 text-center text-slate-500 bg-white/70"
                    >
                      No sticker rows found.
                    </td>
                  </tr>
                ) : (
                  grouped.map((row) => (
                    <tr
                      key={row.style}
                      className="border-t border-slate-100 hover:bg-slate-50/80 bg-white/70"
                    >
                      <td className="px-3 py-2 text-left max-w-[160px] truncate border border-slate-100 font-semibold">
                        {row.style}
                      </td>
                      {colors.map((color) => {
                        const cell = row.cells[color];
                        const isEditing = cell && editingCellId === cell.id;

                        return (
                          <td
                            key={color}
                            className="px-2 py-2 border border-slate-100 tabular-nums"
                          >
                            {!cell ? (
                              <span className="text-slate-400">-</span>
                            ) : isEditing ? (
                              <div className="flex flex-col items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={editQty}
                                  onChange={(event) =>
                                    setEditQty(event.target.value)
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveStickerQty(cell.id);
                                    }
                                  }}
                                  className="w-16 rounded border border-slate-200 px-1 py-0.5 text-center text-xs"
                                />
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => saveStickerQty(cell.id)}
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
                                  setEditQty(String(cell.qty));
                                }}
                                className="w-full font-medium hover:text-fuchsia-700 hover:underline"
                                title="Click to edit"
                              >
                                {formatQty(cell.qty)}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 border border-slate-100 font-semibold tabular-nums">
                        {formatQty(row.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200/80 px-4 py-2 text-xs text-slate-500 bg-white/60">
            {grouped.length} style row{grouped.length === 1 ? "" : "s"}
            {colors.length > 0 ? ` - colors: ${colors.join(", ")}` : ""}
            {debouncedSearch ? ` - search: ${debouncedSearch}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
