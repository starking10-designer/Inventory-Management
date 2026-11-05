import "../dashboard.css";
import "../stock-inventory.css";
import "../low-stock.css";
import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
    setLoadError("");
    try {
      const { data } = await axios.get(`${API_BASE}/stock-alerts`);
      setAlerts({
        count: data.count || 0,
        stock_items: data.stock_items || [],
        sticker_items: data.sticker_items || [],
      });
    } catch (error) {
      console.error("Failed to load stock alerts", error);
      setLoadError("Unable to load stock alerts. Please try refreshing.");
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
    <div className="stock-inventory-page low-stock-page">
      <WorkspaceTopBar>
        <div className="stock-page-heading">
          <Link to="/#inventory" className="stock-back-link" aria-label="Back to Inventory"><ChevronLeft size={18} /></Link>
          <span className="stock-page-icon"><AlertTriangle size={20} /></span>
          <div><h1>Low Stock Alerts</h1><p>Plain pieces &amp; DTF sticker stock alerts</p></div>
        </div>
      </WorkspaceTopBar>
      <main className="stock-page-content">
        <section className="low-stock-kpis" aria-label="Low stock overview">
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Total alerts</span><span className="dashboard-icon amber"><AlertTriangle size={21} /></span></div>
            <strong>{loading ? "..." : alerts.count.toLocaleString("en-IN")}</strong><p>Items requiring replenishment</p>
          </article>
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Plain pieces</span><span className="dashboard-icon blue"><Package size={21} /></span></div>
            <strong>{loading ? "..." : alerts.stock_items.length.toLocaleString("en-IN")}</strong><p>Style, color &amp; size combinations</p>
          </article>
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>DTF stickers</span><span className="dashboard-icon violet"><Tag size={21} /></span></div>
            <strong>{loading ? "..." : alerts.sticker_items.length.toLocaleString("en-IN")}</strong><p>Style &amp; color combinations</p>
          </article>
        </section>
        <section className="stock-table-panel" aria-label="Low stock records">
          <div className="stock-table-toolbar">
            <div className="stock-table-tabs low-stock-tabs" role="group" aria-label="Low stock category">
              <button type="button" onClick={() => { setActiveTab("pieces"); clearAllFilters(); }} aria-pressed={activeTab === "pieces"}><Package size={15} />Plain pieces <span>{alerts.stock_items.length}</span></button>
              <button type="button" onClick={() => { setActiveTab("stickers"); clearAllFilters(); }} aria-pressed={activeTab === "stickers"}><Tag size={15} />DTF stickers <span>{alerts.sticker_items.length}</span></button>
            </div>
            <div className="stock-table-controls">
              <label className="stock-search"><Search size={16} /><input type="search" aria-label="Search low stock" placeholder="Search style, color, size..." value={search} onChange={e => setSearch(e.target.value)} /></label>
              {hasActiveFilters && <button type="button" className="low-stock-reset" onClick={clearAllFilters}>Reset filters</button>}
              <button type="button" onClick={loadAlerts} disabled={loading} className="stock-refresh-button" aria-label="Refresh stock alerts" title="Refresh stock alerts"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
            </div>
          </div>
          {loadError && <div className="low-stock-error" role="alert">{loadError}</div>}
          <div className="low-stock-table-panel">
            <div className="low-stock-table-caption"><h2>{activeTab === "pieces" ? "Plain pieces" : "DTF stickers"}</h2><span>{filteredAndSortedRows.length} / {currentDataset.length} alert items</span></div>
            <div className="low-stock-table-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable low stock table">
            <table className="glass-table stock-data-table low-stock-data-table">
              <thead className="sticky top-0 z-10 glass/95 backdrop-blur-md border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th>
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

                  <th>
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
                    <th>
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

                  <th>
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
                    <td colSpan={activeTab === "pieces" ? 4 : 3} className="px-4 py-16 text-center text-slate-800 font-medium font-medium">
                      <RefreshCw className="animate-spin inline mr-2 text-[#0F2137]" size={16} />
                      Loading low stock alerts...
                    </td>
                  </tr>
                ) : filteredAndSortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === "pieces" ? 4 : 3} className="px-4 py-16 text-center text-slate-800 font-medium font-medium">
                      {loadError ? "Stock alerts unavailable." : hasActiveFilters ? "No alerts match your filters." : "No low stock alerts in this category."}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedRows.map((row, idx) => (
                    <tr
                      key={row.id ?? `${row.style}-${row.color}-${row.size || ""}-${idx}`}
                      className="low-stock-row"
                    >
                      <td>
                        {row.style}
                      </td>
                      <td>
                        {row.color || "-"}
                      </td>
                      {activeTab === "pieces" && (
                        <td>
                          {row.size || "-"}
                        </td>
                      )}
                      <td>
                        <span className="low-stock-quantity" data-empty={Number(row.qty || 0) <= 0}>
                          {row.qty}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {filteredAndSortedRows.length > 0 && (
                <tfoot className="low-stock-total">
                  <tr>
                    <td colSpan={activeTab === "pieces" ? 3 : 2} className="low-stock-total-label">
                      Total ({filteredAndSortedRows.length} alert items)
                    </td>
                    <td>
                      {filteredAndSortedRows.reduce((sum, r) => sum + Number(r.qty || 0), 0).toLocaleString()} units
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
