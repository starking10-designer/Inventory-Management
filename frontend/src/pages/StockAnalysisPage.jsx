import { ANALYTICS_BAR_COLORS } from "../chartColors.js";
import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import "../dashboard.css";
import "../return-analysis.css";
import "../stock-analysis.css";
import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart2,
  Calendar,
  Package,
  Search,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";
import api from "../api.js";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function StockAnalysisPage() {
  const [data, setData] = useState({
    updated_on: null,
    total_pieces: 0,
    top_styles: [],
    history: [],
  });
  const [loading, setLoading] = useState(true);
  const [activeGraph, setActiveGraph] = useState("styles");

  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({});
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  // Keep the product's `style` string out of Recharts' SVG presentation props.
  const topStylesChartData = useMemo(
    () => data.top_styles.map(({ styleName, qty }) => ({ styleName, qty })),
    [data.top_styles],
  );

  const handleFilterChange = (columnKey, selectedValues) => {
    setFilters((prev) => ({
      ...prev,
      [columnKey]: selectedValues,
    }));
  };

  const handleSortChange = (columnKey, ascending) => {
    setSortField(columnKey);
    setSortDir(ascending ? "asc" : "desc");
  };

  const uniqueHistoryDates = useMemo(
    () =>
      Array.from(
        new Set(data.history.map((r) => r.formatted_date).filter(Boolean)),
      ),
    [data.history],
  );
  const uniqueHistoryStyles = useMemo(
    () => Array.from(new Set(data.history.map((r) => r.style).filter(Boolean))),
    [data.history],
  );
  const uniqueHistoryColors = useMemo(
    () => Array.from(new Set(data.history.map((r) => r.color).filter(Boolean))),
    [data.history],
  );
  const uniqueHistorySizes = useMemo(
    () => Array.from(new Set(data.history.map((r) => r.size).filter(Boolean))),
    [data.history],
  );

  const handleExport = () => {
    if (filteredHistory.length === 0) {
      alert("No valid stock data to export.");
      return;
    }

    const exportData = filteredHistory.map((row) => ({
      Date: row.formatted_date,
      Style: row.style || "-",
      Color: row.color || "-",
      Size: row.size || "-",
      Quantity: row.qty,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock_Upload_History");
    XLSX.writeFile(wb, `Stock_Upload_History_${new Date().getTime()}.xlsx`);
  };

  const filteredHistory = useMemo(() => {
    let result = data.history;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          (r.style || "").toLowerCase().includes(q) ||
          (r.color || "").toLowerCase().includes(q) ||
          (r.size || "").toLowerCase().includes(q),
      );
    }

    Object.entries(filters).forEach(([colKey, selectedVals]) => {
      if (selectedVals && selectedVals.length > 0) {
        result = result.filter((row) => selectedVals.includes(row[colKey]));
      }
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data.history, searchTerm, filters, sortField, sortDir]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get(`/api/analytics/stock-analysis`);
        setData({
          ...res.data,
          top_styles: (res.data.top_styles || []).map((s) => ({
            ...s,
            styleName: String(s.style ?? "-"),
            qty: Number(s.qty) || 0,
          })),
          history: (res.data.history || []).map((r) => ({
            ...r,
            formatted_date: !r.created_at
              ? "N/A"
              : new Date(r.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }),
          })),
        });
      } catch (e) {
        console.error("Failed to load stock analysis data", e);
        alert(
          "Error loading data: " +
            (e.response
              ? e.response.status + " - " + JSON.stringify(e.response.data)
              : e.message),
        );
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    return new Date(isoString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="return-analysis-page stock-analysis-page">
      <WorkspaceTopBar>
        <div className="return-analysis-heading">
          <Link to="/stock-inventory" aria-label="Back to Stock Inventory" className="return-analysis-back"><ArrowLeft size={18} /></Link>
          <span className="return-analysis-page-icon"><BarChart2 size={20} /></span>
          <div><h1>Stock Analytics</h1><p>Stock levels and upload history</p></div>
        </div>
      </WorkspaceTopBar>
      <main className="return-analysis-content">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-slate-800 font-medium font-bold animate-pulse">
              Loading analytics...
            </div>
          </div>
        ) : (
          <div className="stock-analysis-sections">
            <section className="stock-analysis-kpis" aria-label="Stock performance overview">
              <article className="dashboard-stat">
                <div className="dashboard-card-top"><span>Stock updated on</span><span className="dashboard-icon"><Calendar size={21} /></span></div>
                <strong className="stock-analysis-date-value">{formatDate(data.updated_on)}</strong><p>Latest stock update</p>
              </article>
              <article className="dashboard-stat">
                <div className="dashboard-card-top"><span>Total stock pieces</span><span className="dashboard-icon blue"><Package size={21} /></span></div>
                <strong>{Number(data.total_pieces || 0).toLocaleString("en-IN")}</strong><p>Units across all styles and sizes</p>
              </article>
            </section>

            <section className="return-analysis-charts" aria-labelledby="stock-performance-heading">
              <div className="return-analysis-chart-header">
                <div><h2 id="stock-performance-heading"><BarChart2 size={19} /> Stock performance</h2><p>Compare stock by style and follow upload activity.</p></div>
                <div className="return-analysis-chart-tabs" role="tablist" aria-label="Stock performance graphs">
                  {[["styles", "Top styles"], ["uploads", "Uploads by date"]].map(([id, label], index) => (
                    <button key={id} id={`stock-chart-tab-${id}`} type="button" role="tab" aria-selected={activeGraph === id} aria-controls={`stock-chart-${id}`} tabIndex={activeGraph === id ? 0 : -1} onClick={() => setActiveGraph(id)}
                      onKeyDown={event => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
                        setActiveGraph(nextIndex === 0 ? "styles" : "uploads");
                        event.currentTarget.parentElement.children[nextIndex].focus();
                      }}>{label}</button>
                  ))}
                </div>
              </div>
              {activeGraph === "styles" && (
<div className="stock-analysis-styles" role="tabpanel" id="stock-chart-styles" aria-labelledby="stock-chart-tab-styles">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">
                      Top Styles
                    </h3>
                    <p className="text-xs font-medium text-slate-800 font-medium mt-1">
                      Stock quantity by style
                    </p>
                  </div>
                </div>

                {data.top_styles?.length > 0 ? (
                  <div className="stock-style-chart" data-lenis-prevent>
                    <div className="stock-style-chart-canvas" style={{ minWidth: Math.max(data.top_styles.length * 90, 280) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topStylesChartData} margin={{ top: 28, right: 20, left: 0, bottom: 12 }} barCategoryGap="28%">
                          <CartesianGrid vertical={false} stroke="#bacde04d" strokeDasharray="3 3" />
                          <XAxis dataKey="styleName" axisLine={false} tickLine={false} interval={0} height={48} tick={{ fontSize: 12, fill: "#4a6481" }} tickMargin={12} />
                          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: "#7a8da4" }} width={48} />
                          <Tooltip cursor={{ fill: "#315f9b08" }} formatter={value => [Number(value).toLocaleString("en-IN"), "Stock pieces"]} contentStyle={{ borderRadius: 12, border: "1px solid #d4e1ed", background: "#f8fbff", color: "#183654" }} />
                          <Bar dataKey="qty" maxBarSize={64} radius={[7, 7, 0, 0]} isAnimationActive={false}>
                            {data.top_styles.map((item, index) => <Cell key={`${item.styleName}-${index}`} fill={ANALYTICS_BAR_COLORS[index % ANALYTICS_BAR_COLORS.length]} />)}
                            <LabelList dataKey="qty" position="top" offset={9} formatter={value => Number(value).toLocaleString("en-IN")} style={{ fill: "#183654", fontSize: 12, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-800 font-medium font-medium">
                    No data available
                  </div>
                )}
              </div>
              )}
              {activeGraph === "uploads" && (
<div className="return-analysis-chart" role="tabpanel" id="stock-chart-uploads" aria-labelledby="stock-chart-tab-uploads">
                <h3 className="text-lg font-black text-slate-800 mb-4">
                  Stock Uploads by Date
                </h3>
                <div className="return-analysis-chart-canvas">
                  {data.stock_by_date && data.stock_by_date.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={data.stock_by_date}
                        margin={{ top: 10, right: 20, left: 0, bottom: 30 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#E2E8F0"
                        />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#64748B" }}
                          tickFormatter={(val) =>
                            val && val.length >= 10 ? val.substring(5, 10) : val
                          }
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: "#64748B" }}
                        />
                        <Tooltip
                          cursor={{
                            stroke: "#E2E8F0",
                            strokeWidth: 2,
                            strokeDasharray: "3 3",
                          }}
                          contentStyle={{
                            borderRadius: "12px",
                            border: "none",
                            boxShadow:
                              "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="qty"
                          stroke="#315f9b"
                          strokeWidth={3}
                          dot={{
                            fill: "#315f9b",
                            strokeWidth: 2,
                            r: 4,
                            stroke: "#fff",
                          }}
                          activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-800 font-medium">
                      No data available
                    </div>
                  )}
                </div>
              </div>
              )}
            </section>

            {/* Table */}
            <div className="return-analysis-table">
              <div className="return-analysis-table-heading">
                <h3 className="text-lg font-black text-slate-800">
                  Stock upload history
                </h3>
                <div className="stock-history-controls">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-800 font-medium"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Search history..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 w-full sm:w-64 glass border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2137] focus:border-transparent transition-shadow"
                    />
                  </div>
                  <button
                    onClick={handleExport}
                    disabled={filteredHistory.length === 0}
                    className="stock-analysis-export"
                  >
                    <Download size={14} /> Export Excel
                  </button>
                </div>
              </div>
              <div className="return-analysis-table-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable stock upload history">
                <table className="glass-table return-analysis-data-table stock-history-table">
                  <thead className="sticky top-0 glass z-10 border-b border-slate-200 text-xs font-bold uppercase text-slate-800 font-medium tracking-wider">
                    <tr>
                      <th>
                        <ExcelHeaderFilter
                          label="Date"
                          columnKey="formatted_date"
                          values={uniqueHistoryDates}
                          selectedValues={filters.formatted_date || []}
                          onFilterChange={(vals) =>
                            handleFilterChange("formatted_date", vals)
                          }
                          sortField={sortField}
                          sortAsc={sortDir === "asc"}
                          onSort={handleSortChange}
                        />
                      </th>
                      <th>
                        <ExcelHeaderFilter
                          label="Style"
                          columnKey="style"
                          values={uniqueHistoryStyles}
                          selectedValues={filters.style || []}
                          onFilterChange={(vals) =>
                            handleFilterChange("style", vals)
                          }
                          sortField={sortField}
                          sortAsc={sortDir === "asc"}
                          onSort={handleSortChange}
                        />
                      </th>
                      <th>
                        <ExcelHeaderFilter
                          label="Color"
                          columnKey="color"
                          values={uniqueHistoryColors}
                          selectedValues={filters.color || []}
                          onFilterChange={(vals) =>
                            handleFilterChange("color", vals)
                          }
                          sortField={sortField}
                          sortAsc={sortDir === "asc"}
                          onSort={handleSortChange}
                        />
                      </th>
                      <th>
                        <ExcelHeaderFilter
                          label="Size"
                          columnKey="size"
                          values={uniqueHistorySizes}
                          selectedValues={filters.size || []}
                          onFilterChange={(vals) =>
                            handleFilterChange("size", vals)
                          }
                          sortField={sortField}
                          sortAsc={sortDir === "asc"}
                          onSort={handleSortChange}
                        />
                      </th>
                      <th>
                        <ExcelHeaderFilter
                          label="Quantity"
                          columnKey="qty"
                          sortField={sortField}
                          sortAsc={sortDir === "asc"}
                          onSort={handleSortChange}
                          align="right"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-slate-800 font-medium font-medium"
                        >
                          No history found.
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((row, idx) => (
                        <tr
                          key={idx}
                          className="stock-history-row"
                        >
                          <td>
                            {row.formatted_date}
                          </td>
                          <td>
                            {row.style || "-"}
                          </td>
                          <td>
                            {row.color || "-"}
                          </td>
                          <td>
                            {row.size || "-"}
                          </td>
                          <td>
                            {row.qty}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
