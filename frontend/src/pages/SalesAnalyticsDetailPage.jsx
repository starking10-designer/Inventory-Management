import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ChevronLeft, Download, RefreshCw, Search, Filter, BarChart3, Store, Shirt, Palette, Layers3, Package } from "lucide-react";
import { API_BASE } from "../api.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";
import "../sales-analytics-detail.css";

const REPORTS = {
  "platform-wise": {
    title: "Platform Wise",
    icon: Store,
    description: "Compare product quantities across sales platforms.",
    dataKey: "platform_wise",
    columns: [{ key: "style", label: "Style" }],
    type: "platform",
  },
  "style-wise": {
    title: "Style Wise",
    icon: Shirt,
    description: "Review each style by size and total quantity.",
    dataKey: "style_wise",
    columns: [{ key: "style", label: "Style" }],
  },
  "color-wise": {
    title: "Color Wise",
    icon: Palette,
    description: "Explore product colors and their size breakdowns.",
    dataKey: "color_wise",
    columns: [
      { key: "main_product_type", label: "Main product Type" },
      { key: "color", label: "Color" },
    ],
  },
  "style-color-wise": {
    title: "Style Wise & Color Wise",
    icon: Layers3,
    description: "Compare size quantities for each style and color.",
    dataKey: "style_color_wise",
    columns: [
      { key: "style", label: "Style" },
      { key: "color", label: "Color" },
    ],
  },
  "combo-pack-wise": {
    title: "Combo Pack Wise & Color",
    icon: Package,
    description: "Review pack sizes, styles, colors, and garment quantities.",
    dataKey: "combo_pack_wise",
    columns: [
      { key: "pack_of", label: "Pack" },
      { key: "style", label: "Style" },
      { key: "color", label: "Color" },
    ],
  },
  "sales-wise": {
    title: "Sales Wise",
    icon: BarChart3,
    description: "Track daily orders, pieces, and invoice amounts by platform.",
    dataKey: "sales_wise",
    type: "sales",
  },
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(new Blob([blob]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SalesAnalyticsDetailPage() {
  const { reportType = "platform-wise" } = useParams();
  const report = REPORTS[reportType] || REPORTS["platform-wise"];
  const ReportIcon = report.icon;

  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [viewMode, setViewMode] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Excel Column Filters State
  const [columnFilters, setColumnFilters] = useState({});
  const [sortField, setSortField] = useState(report.type === "sales" ? "date" : "style");
  const [sortAsc, setSortAsc] = useState(true);

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = {};

      const now = new Date();
      const format = (d) => d.toISOString().split("T")[0];

      if (viewMode === "weekly") {
        const past = new Date();
        past.setDate(now.getDate() - 7);
        params.from_date = format(past);
        params.to_date = format(now);
      } else if (viewMode === "monthly") {
        const past = new Date();
        past.setDate(now.getDate() - 30);
        params.from_date = format(past);
        params.to_date = format(now);
      } else if (viewMode === "custom") {
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
      }

      const response = await axios.get(`${API_BASE}/sales-pivot-analytics`, {
        params,
      });
      setData(response.data);
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.detail || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [viewMode]);

  const rows = useMemo(() => {
    const raw = data?.[report.dataKey];
    if (!Array.isArray(raw)) return [];

    if (report.type === "sales") {
      const flattened = [];
      for (const row of raw) {
        for (const [platform, summary] of Object.entries(row.platforms || {})) {
          flattened.push({
            date: row.date,
            platform,
            orders: summary.orders,
            pieces: summary.pieces,
            amount: summary.amount,
          });
        }
      }
      return flattened;
    }

    return raw;
  }, [data, report]);

  const sizes = useMemo(() => data?.sizes || [], [data]);

  // Unique values for each column
  const uniqueValuesMap = useMemo(() => {
    const map = {};
    if (report.type === "sales") {
      map.date = Array.from(new Set(rows.map((r) => r.date).filter(Boolean))).sort();
      map.platform = Array.from(new Set(rows.map((r) => r.platform).filter(Boolean))).sort();
    } else {
      for (const col of report.columns) {
        map[col.key] = Array.from(new Set(rows.map((r) => r[col.key]).filter(Boolean))).sort();
      }
    }
    return map;
  }, [rows, report]);

  const setSingleColumnFilter = (key, selectedVals) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: selectedVals,
    }));
  };

  const filteredRows = useMemo(() => {
    let list = [...rows];

    // Global search
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((row) =>
        Object.values(row)
          .map((v) => (typeof v === "object" ? Object.values(v).join(" ") : String(v || "")))
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }

    // Excel column filters
    for (const [key, selectedVals] of Object.entries(columnFilters)) {
      const allVals = uniqueValuesMap[key] || [];
      if (selectedVals && selectedVals.length > 0 && selectedVals.length < allVals.length) {
        list = list.filter((row) => selectedVals.includes(row[key]));
      }
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "orders" || sortField === "pieces" || sortField === "amount" || sortField === "total") {
        cmp = Number(a[sortField] || 0) - Number(b[sortField] || 0);
      } else {
        cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""));
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [rows, search, columnFilters, uniqueValuesMap, sortField, sortAsc]);

  const handleSort = (field, asc) => {
    setSortField(field);
    setSortAsc(asc);
  };

  const clearAllFilters = () => {
    setSearch("");
    setColumnFilters({});
  };

  const hasActiveFilters = Boolean(
    search ||
    Object.entries(columnFilters).some(([key, vals]) => {
      const allVals = uniqueValuesMap[key] || [];
      return vals && vals.length > 0 && vals.length < allVals.length;
    }),
  );

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(
        `${API_BASE}/sales-pivot-analytics/export/${reportType}`,
        {
          responseType: "blob",
        },
      );
      downloadBlob(response.data, `${reportType}.xlsx`);
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.detail || "Failed to export report");
    } finally {
      setDownloading(false);
    }
  };

  // Grand totals calculation
  const totalOrders = useMemo(() => filteredRows.reduce((s, r) => s + Number(r.orders || 0), 0), [filteredRows]);
  const totalPieces = useMemo(() => filteredRows.reduce((s, r) => s + Number(r.pieces || r.total || 0), 0), [filteredRows]);
  const totalAmount = useMemo(() => filteredRows.reduce((s, r) => s + Number(r.amount || 0), 0), [filteredRows]);

  return (
    <div className="analytics-detail-page" data-report-type={report.type || "sizes"} data-accent={reportType}>
      {/* Header */}
      <WorkspaceTopBar>
        <div className="analytics-detail-header-inner">
          <div className="analytics-detail-heading">
            <Link
              to="/sales-analytics-report"
              className="detail-back-link"
            >
              <ChevronLeft size={16} />
              Analytics
            </Link>
            <span className="detail-report-icon"><ReportIcon size={22} strokeWidth={1.8} aria-hidden="true" /></span>
            <div className="detail-heading-copy">
              <h1>{report.title}</h1>
              <p>{report.description}</p>
            </div>
          </div>

        </div>
      </WorkspaceTopBar>

      {/* Main Content */}
      <main className="analytics-detail-main">
        {/* Controls & Filter Bar */}
        <div className="detail-toolbar">
          <div className="detail-toolbar-inner">
            {/* View Mode Buttons */}
            <div className="detail-period-controls">
              <div className="detail-period-tabs" aria-label="Report period">
                {["all", "weekly", "monthly", "custom"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    aria-pressed={viewMode === mode}
                    className={viewMode === mode ? "is-active" : ""}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={downloadReport}
                disabled={downloading || loading || rows.length === 0}
                className="detail-primary-button detail-export-button"
              >
                <Download size={14} />
                {downloading ? "Exporting..." : "Export Excel"}
              </button>

              {viewMode === "custom" && (
                <div className="detail-custom-dates">
                  <input
                    type="date"
                    aria-label="From date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="detail-date-input"
                  />
                  <input
                    type="date"
                    aria-label="To date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="detail-date-input"
                  />
                  <button
                    type="button"
                    onClick={loadReport}
                    className="detail-primary-button"
                  >
                    <Filter size={13} />
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* Search Input & Reset */}
            <div className="detail-search-controls">
              <div className="detail-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search report…"
                  aria-label="Search report"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="detail-reset-button"
                >
                  Reset Filters
                </button>
              )}

              <span className="detail-row-count" aria-live="polite">
                {filteredRows.length} / {rows.length} rows
              </span>
            </div>
          </div>
        </div>

        <section className="detail-matrix-panel" aria-label={`${report.title} report`} aria-busy={loading}>
          <div data-lenis-prevent className="detail-matrix-scroll" tabIndex={0} aria-label="Scrollable report matrix">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-16 text-slate-800 font-medium font-medium text-sm">
                <RefreshCw className="animate-spin text-[#0F2137]" size={18} />
                Loading report data...
              </div>
            ) : (
              <table className="analytics-matrix">
                <thead>
                  <tr>
                    {report.type === "sales" ? (
                      <>
                        <th className="matrix-label-column">
                          <ExcelHeaderFilter
                            label="Date"
                            columnKey="date"
                            values={uniqueValuesMap.date}
                            selectedValues={columnFilters.date}
                            onFilterChange={(v) => setSingleColumnFilter("date", v)}
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            align="left"
                          />
                        </th>
                        <th className="matrix-label-column">
                          <ExcelHeaderFilter
                            label="Platform"
                            columnKey="platform"
                            values={uniqueValuesMap.platform}
                            selectedValues={columnFilters.platform}
                            onFilterChange={(v) => setSingleColumnFilter("platform", v)}
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            align="left"
                          />
                        </th>
                        <th className="matrix-number-column">
                          <ExcelHeaderFilter
                            label="Orders"
                            columnKey="orders"
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            align="right"
                            isNumeric={true}
                          />
                        </th>
                        <th className="matrix-number-column">
                          <ExcelHeaderFilter
                            label="Pieces"
                            columnKey="pieces"
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            align="right"
                            isNumeric={true}
                          />
                        </th>
                        <th className="matrix-total-column">
                          <ExcelHeaderFilter
                            label="Amount"
                            columnKey="amount"
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            align="right"
                            isNumeric={true}
                          />
                        </th>
                      </>
                    ) : (
                      <>
                        {report.columns.map((column) => (
                          <th key={column.key} className={`matrix-label-column matrix-column-${column.key}`}>
                            <ExcelHeaderFilter
                              label={column.label}
                              columnKey={column.key}
                              values={uniqueValuesMap[column.key]}
                              selectedValues={columnFilters[column.key]}
                              onFilterChange={(v) => setSingleColumnFilter(column.key, v)}
                              sortField={sortField}
                              sortAsc={sortAsc}
                              onSort={handleSort}
                              align="left"
                            />
                          </th>
                        ))}
                        {report.type === "platform"
                          ? (data?.platforms || []).map((platform) => (
                              <th key={platform} className="matrix-number-column">
                                {platform}
                              </th>
                            ))
                          : sizes.map((size) => (
                              <th key={size} className="matrix-number-column">
                                {size}
                              </th>
                            ))}
                        <th className="matrix-total-column">
                          <ExcelHeaderFilter
                            label="Total"
                            columnKey="total"
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={handleSort}
                            align="right"
                            isNumeric={true}
                          />
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={index}>
                      {report.type === "sales" ? (
                        <>
                          <td className="matrix-label-cell">
                            {row.date}
                          </td>
                          <td className="matrix-label-cell">
                            {row.platform}
                          </td>
                          <td className="matrix-number-cell">
                            {row.orders || 0}
                          </td>
                          <td className="matrix-number-cell">
                            {row.pieces || 0}
                          </td>
                          <td className="matrix-total-cell">
                            {formatMoney(row.amount)}
                          </td>
                        </>
                      ) : (
                        <>
                          {report.columns.map((column) => (
                            <td
                              key={column.key}
                              className="matrix-label-cell"
                            >
                              {row[column.key] || "-"}
                            </td>
                          ))}
                          {report.type === "platform"
                            ? (data?.platforms || []).map((platform) => (
                                <td
                                  key={platform}
                                  className="matrix-number-cell"
                                >
                                  {row.platforms?.[platform] || "-"}
                                </td>
                              ))
                            : sizes.map((size) => (
                                <td key={size} className="matrix-number-cell">
                                  {row.sizes?.[size] || "-"}
                                </td>
                              ))}
                          <td className="matrix-total-cell">
                            {row.total || 0}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={report.type === "sales" ? 5 : report.columns.length + (report.type === "platform" ? (data?.platforms || []).length : sizes.length) + 1}
                        className="p-16 text-center text-slate-800 font-medium font-medium"
                      >
                        No records match the active filters or search term.
                      </td>
                    </tr>
                  )}
                </tbody>

                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr>
                      {report.type === "sales" ? (
                        <>
                          <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-slate-800 font-medium">
                            Grand Total ({filteredRows.length} lines)
                          </td>
                          <td>
                            {totalOrders.toLocaleString()}
                          </td>
                          <td>
                            {totalPieces.toLocaleString()}
                          </td>
                          <td>
                            {formatMoney(totalAmount)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={report.columns.length} className="px-4 py-3 uppercase tracking-wider text-slate-800 font-medium">
                            Grand Total ({filteredRows.length} items)
                          </td>
                          {report.type === "platform"
                            ? (data?.platforms || []).map((platform) => {
                                const platformSum = filteredRows.reduce((s, r) => s + Number(r.platforms?.[platform] || 0), 0);
                                return (
                                  <td key={`tot-${platform}`} className="px-4 py-3 text-right tabular-nums font-bold text-slate-700">
                                    {platformSum || "-"}
                                  </td>
                                );
                              })
                            : sizes.map((size) => {
                                const sizeSum = filteredRows.reduce((s, r) => s + Number(r.sizes?.[size] || 0), 0);
                                return (
                                  <td key={`tot-${size}`} className="px-4 py-3 text-right tabular-nums font-bold text-slate-700">
                                    {sizeSum || "-"}
                                  </td>
                                );
                              })}
                          <td>
                            {totalPieces.toLocaleString()}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
