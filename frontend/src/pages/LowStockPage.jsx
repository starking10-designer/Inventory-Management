import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  AlertTriangle,
  ChevronLeft,
  Package,
  Search,
  Tag,
  RefreshCw,
} from "lucide-react";
import { API_BASE } from "../api.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

export default function LowStockPage() {
  const [alerts, setAlerts] = useState({
    count: 0,
    stock_items: [],
    sticker_items: [],
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pieces"); // "pieces" | "stickers"

  // Excel Column Filters State
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [sortField, setSortField] = useState("qty");
  const [sortAsc, setSortAsc] = useState(true);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/stock-alerts`);
      setAlerts({
        count: data.count || 0,
        stock_items: data.stock_items || [],
        sticker_items: data.sticker_items || [],
      });
    } catch (error) {
      console.error("Failed to load stock alerts", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const currentDataset = activeTab === "pieces" ? alerts.stock_items : alerts.sticker_items;

  const uniqueStyles = useMemo(
    () => Array.from(new Set(currentDataset.map((r) => r.style).filter(Boolean))).sort(),
    [currentDataset],
  );

  const uniqueColors = useMemo(
    () => Array.from(new Set(currentDataset.map((r) => r.color || "None"))).sort(),
    [currentDataset],
  );

  const uniqueSizes = useMemo(
    () => Array.from(new Set(currentDataset.map((r) => r.size || "-").filter(Boolean))).sort(),
    [currentDataset],
  );

  const filteredAndSortedRows = useMemo(() => {
    let list = [...currentDataset];

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((r) =>
        [r.style, r.color, r.size]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      );
    }

    if (selectedStyles.length > 0 && selectedStyles.length < uniqueStyles.length) {
      list = list.filter((r) => selectedStyles.includes(r.style));
    }

    if (selectedColors.length > 0 && selectedColors.length < uniqueColors.length) {
      list = list.filter((r) => selectedColors.includes(r.color || "None"));
    }

    if (selectedSizes.length > 0 && selectedSizes.length < uniqueSizes.length && activeTab === "pieces") {
      list = list.filter((r) => selectedSizes.includes(r.size || "-"));
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "style") {
        cmp = String(a.style || "").localeCompare(String(b.style || ""));
      } else if (sortField === "color") {
        cmp = String(a.color || "").localeCompare(String(b.color || ""));
      } else if (sortField === "size") {
        cmp = String(a.size || "").localeCompare(String(b.size || ""));
      } else if (sortField === "qty") {
        cmp = Number(a.qty || 0) - Number(b.qty || 0);
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [currentDataset, search, selectedStyles, uniqueStyles, selectedColors, uniqueColors, selectedSizes, uniqueSizes, sortField, sortAsc, activeTab]);

  const handleSort = (field, asc) => {
    setSortField(field);
    setSortAsc(asc);
  };

  const clearAllFilters = () => {
    setSearch("");
    setSelectedStyles([]);
    setSelectedColors([]);
    setSelectedSizes([]);
  };

  const hasActiveFilters = Boolean(
    search ||
    (selectedStyles.length > 0 && selectedStyles.length < uniqueStyles.length) ||
    (selectedColors.length > 0 && selectedColors.length < uniqueColors.length) ||
    (selectedSizes.length > 0 && selectedSizes.length < uniqueSizes.length),
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/#inventory"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <ChevronLeft size={16} />
              Inventory
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <AlertTriangle size={20} className="text-rose-600" />
                Low Stock Alerts
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {alerts.count} items requiring restocking attention across plain pieces and DTF stickers.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] px-6 py-6 space-y-4">
        {/* Category Switcher & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-2xl border border-slate-200/80 bg-white/80 p-1 shadow-xs backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setActiveTab("pieces");
                clearAllFilters();
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "pieces"
                  ? "bg-[#0F2137] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Package size={15} />
              Plain Pieces ({alerts.stock_items.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("stickers");
                clearAllFilters();
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "stickers"
                  ? "bg-[#0F2137] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Tag size={15} />
              DTF Stickers ({alerts.sticker_items.length})
            </button>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search style, color, size..."
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 py-2 pl-9 pr-3 text-xs font-medium outline-none shadow-xs text-slate-800 placeholder-slate-400 focus:bg-white"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 whitespace-nowrap"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Clean Modern Square Table Container */}
        <section className="bg-white shadow-sm overflow-hidden">
          <div className="max-h-[calc(100vh-230px)] overflow-auto">
            <table className="w-full text-left text-sm border-none">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-4 py-3 min-w-[200px]">
                    <ExcelHeaderFilter
                      label="Style"
                      columnKey="style"
                      values={uniqueStyles}
                      selectedValues={selectedStyles}
                      onFilterChange={setSelectedStyles}
                      sortField={sortField}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align="left"
                    />
                  </th>

                  <th className="px-4 py-3 min-w-[180px]">
                    <ExcelHeaderFilter
                      label="Color"
                      columnKey="color"
                      values={uniqueColors}
                      selectedValues={selectedColors}
                      onFilterChange={setSelectedColors}
                      sortField={sortField}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align="left"
                    />
                  </th>

                  {activeTab === "pieces" && (
                    <th className="px-4 py-3 min-w-[120px]">
                      <ExcelHeaderFilter
                        label="Size"
                        columnKey="size"
                        values={uniqueSizes}
                        selectedValues={selectedSizes}
                        onFilterChange={setSelectedSizes}
                        sortField={sortField}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        align="left"
                      />
                    </th>
                  )}

                  <th className="px-4 py-3 text-right min-w-[140px]">
                    <ExcelHeaderFilter
                      label="Current Qty"
                      columnKey="qty"
                      sortField={sortField}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align="right"
                      isNumeric={true}
                    />
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={activeTab === "pieces" ? 4 : 3} className="px-4 py-16 text-center text-slate-500 font-medium">
                      <RefreshCw className="animate-spin inline mr-2 text-[#0F2137]" size={16} />
                      Loading low stock alerts...
                    </td>
                  </tr>
                ) : filteredAndSortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === "pieces" ? 4 : 3} className="px-4 py-16 text-center text-slate-500 font-medium">
                      No low stock alerts matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedRows.map((row, idx) => (
                    <tr
                      key={`${row.style}-${row.color}-${row.size || idx}`}
                      className="hover:bg-slate-50/80 transition group"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {row.style}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">
                        {row.color || "-"}
                      </td>
                      {activeTab === "pieces" && (
                        <td className="px-4 py-3 font-bold text-slate-800 uppercase text-xs">
                          {row.size || "-"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="inline-flex items-center justify-center rounded bg-rose-50 text-rose-700 border border-rose-200/80 px-2.5 py-0.5 text-xs font-black">
                          {row.qty}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {filteredAndSortedRows.length > 0 && (
                <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-900">
                  <tr>
                    <td colSpan={activeTab === "pieces" ? 3 : 2} className="px-4 py-3 text-left uppercase tracking-wider text-slate-600">
                      Total ({filteredAndSortedRows.length} alert items)
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm font-black text-rose-700">
                      {filteredAndSortedRows.reduce((sum, r) => sum + Number(r.qty || 0), 0).toLocaleString()} Total Units
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
