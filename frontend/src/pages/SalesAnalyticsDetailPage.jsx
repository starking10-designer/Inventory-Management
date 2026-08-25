import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ChevronLeft, Download, RefreshCw, Search, Filter, BarChart3, X } from "lucide-react";
import { API_BASE } from "../api.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

const REPORTS = {
  "platform-wise": {
    title: "Platform Wise",
    dataKey: "platform_wise",
    columns: [{ key: "style", label: "Style" }],
    type: "platform",
  },
  "style-wise": {
    title: "Style Wise",
    dataKey: "style_wise",
    columns: [{ key: "style", label: "Style" }],
  },
  "color-wise": {
    title: "Color Wise",
    dataKey: "color_wise",
    columns: [
      { key: "main_product_type", label: "Main product Type" },
      { key: "color", label: "Color" },
    ],
  },
  "style-color-wise": {
    title: "Style Wise & Color Wise",
    dataKey: "style_color_wise",
    columns: [
      { key: "style", label: "Style" },
      { key: "color", label: "Color" },
    ],
  },
  "combo-pack-wise": {
    title: "Combo Pack Wise & Color",
    dataKey: "combo_pack_wise",
    columns: [
      { key: "pack_of", label: "Pack" },
      { key: "style", label: "Style" },
      { key: "color", label: "Color" },
    ],
  },
  "sales-wise": {
    title: "Sales Wise",
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
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/sales-analytics-report"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <ChevronLeft size={16} />
              Analytics
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-[#0F2137]" />
                {report.title}
              </h1>
              <p className="text-xs text-slate-500 font-medium">Detailed performance matrix and breakdown view.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadReport}
              disabled={downloading || loading || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50 transition"
            >
              <Download size={14} />
              {downloading ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] px-6 py-6 space-y-4">
        {/* Controls & Filter Bar */}
        <div className="bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* View Mode Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200/80 bg-white/80 p-1 shadow-xs">
                {["all", "weekly", "monthly", "custom"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                      viewMode === mode
                        ? "bg-[#0F2137] text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {viewMode === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs focus:outline-none"
                  />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={loadReport}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#0F2137] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition"
                  >
                    <Filter size={13} />
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* Search Input & Reset */}
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Quick search report values..."
                  className="w-full rounded-2xl border border-slate-200/80 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium outline-none shadow-xs text-slate-800 placeholder-slate-400 focus:bg-white"
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

              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                {filteredRows.length} / {rows.length} rows
              </span>
            </div>
          </div>
        </div>

        {/* Clean Modern Square Table Container */}
        <section className="bg-white shadow-sm overflow-hidden">
          <div className="max-h-[calc(100vh-270px)] overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-16 text-slate-500 font-medium text-sm">
                <RefreshCw className="animate-spin text-[#0F2137]" size={18} />
                Loading report data...
              </div>
            ) : (
              <table className="w-full text-sm text-left border-none">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <tr>
                    {report.type === "sales" ? (
                      <>
                        <th className="px-4 py-3 min-w-[150px]">
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
                        <th className="px-4 py-3 min-w-[160px]">
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
                        <th className="px-4 py-3 text-right min-w-[100px]">
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
                        <th className="px-4 py-3 text-right min-w-[100px]">
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
                        <th className="px-4 py-3 text-right min-w-[130px]">
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
                          <th key={column.key} className="px-4 py-3 min-w-[160px]">
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
                              <th key={platform} className="px-4 py-3 text-right font-bold text-slate-600 min-w-[90px]">
                                {platform}
                              </th>
                            ))
                          : sizes.map((size) => (
                              <th key={size} className="px-4 py-3 text-right font-bold text-slate-600 min-w-[70px]">
                                {size}
                              </th>
                            ))}
                        <th className="px-4 py-3 text-right min-w-[100px]">
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
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50/80 transition group">
                      {report.type === "sales" ? (
                        <>
                          <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                            {row.date}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">
                            {row.platform}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {row.orders || 0}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                            {row.pieces || 0}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-800 tabular-nums">
                            {formatMoney(row.amount)}
                          </td>
                        </>
                      ) : (
                        <>
                          {report.columns.map((column) => (
                            <td
                              key={column.key}
                              className="whitespace-nowrap px-4 py-3 font-bold text-slate-900"
                            >
                              {row[column.key] || "-"}
                            </td>
                          ))}
                          {report.type === "platform"
                            ? (data?.platforms || []).map((platform) => (
                                <td
                                  key={platform}
                                  className="px-4 py-3 text-right tabular-nums text-slate-700"
                                >
                                  {row.platforms?.[platform] || "-"}
                                </td>
                              ))
                            : sizes.map((size) => (
                                <td key={size} className="px-4 py-3 text-right tabular-nums text-slate-700">
                                  {row.sizes?.[size] || "-"}
                                </td>
                              ))}
                          <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">
                            {row.total || 0}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={12}
                        className="p-16 text-center text-slate-500 font-medium"
                      >
                        No records match the active filters or search term.
                      </td>
                    </tr>
                  )}
                </tbody>

                {filteredRows.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-900">
                    <tr>
                      {report.type === "sales" ? (
                        <>
                          <td colSpan={2} className="px-4 py-3 uppercase tracking-wider text-slate-600">
                            Grand Total ({filteredRows.length} lines)
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-700">
                            {totalOrders.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-black text-slate-900">
                            {totalPieces.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-800 tabular-nums">
                            {formatMoney(totalAmount)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={report.columns.length} className="px-4 py-3 uppercase tracking-wider text-slate-600">
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
                          <td className="px-4 py-3 text-right tabular-nums text-sm font-black text-emerald-800">
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
