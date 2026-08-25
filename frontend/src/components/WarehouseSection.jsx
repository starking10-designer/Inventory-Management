import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Warehouse,
  Upload,
  FileSpreadsheet,
  Download,
  Eye,
  Trash2,
  Package,
  RefreshCw,
  Search,
  X,
  TrendingUp,
  BarChart3,
  Calendar,
  Layers,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_BASE } from "../api.js";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];
const CHART_RANGE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom Date" },
];

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildSizeColumns(rows) {
  const sizes = new Set();
  for (const row of rows) {
    const size = String(row.size || "").toUpperCase().trim();
    if (size) sizes.add(size);
  }
  return [
    ...SIZE_ORDER.filter((size) => sizes.has(size)),
    ...[...sizes].filter((size) => !SIZE_ORDER.includes(size)).sort(),
  ];
}

function buildStyleSummary(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const style = row.style || "Unknown";
    const color = row.color || "Unknown";
    const size = String(row.size || "").toUpperCase().trim();
    const key = `${style}\u0000${color}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: row.date,
        style,
        color,
        sizes: {},
        total: 0,
      });
    }

    const item = grouped.get(key);
    const qty = Number(row.piece_qty || 0);
    item.sizes[size] = (item.sizes[size] || 0) + qty;
    item.total += qty;
  }

  return [...grouped.values()].sort(
    (a, b) => a.style.localeCompare(b.style) || a.color.localeCompare(b.color),
  );
}

function uniqueSalesAmount(rows) {
  const seen = new Set();
  let total = 0;
  for (const row of rows) {
    const key = `${row.date}\u0000${row.order_id}\u0000${row.sku}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += Number(row.invoice_amount || 0);
  }
  return total;
}

function WarehouseChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};

  return (
    <div className="rounded-2xl border border-white/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-xl text-xs">
      <p className="font-bold text-slate-900 mb-1.5 border-b border-slate-100 pb-1">{label}</p>
      <div className="space-y-1">
        <p className="text-slate-600 flex justify-between gap-4">
          <span>Orders:</span>
          <span className="font-bold text-slate-900">{item.orders || 0}</span>
        </p>
        <p className="text-slate-600 flex justify-between gap-4">
          <span>Total Pieces:</span>
          <span className="font-bold text-slate-900">{item.pieces || 0}</span>
        </p>
        <p className="text-slate-600 flex justify-between gap-4">
          <span>Sales:</span>
          <span className="font-bold text-emerald-700">{formatMoney(item.salesAmount)}</span>
        </p>
      </div>
    </div>
  );
}

function WarehouseDetailTable({ rows }) {
  const sizeColumns = useMemo(() => buildSizeColumns(rows), [rows]);
  const summaryRows = useMemo(() => buildStyleSummary(rows), [rows]);

  if (summaryRows.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-slate-500">
        No warehouse lines for this report.
      </p>
    );
  }

  return (
    <div className="max-h-[min(70vh,640px)] overflow-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-md text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3">Style</th>
            <th className="px-4 py-3">Color</th>
            {sizeColumns.map((size) => (
              <th key={size} className="px-4 py-3 text-right">
                {size}
              </th>
            ))}
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summaryRows.map((row, index) => (
            <tr
              key={`${row.style}-${row.color}-${index}`}
              className="hover:bg-slate-50/80 transition"
            >
              <td className="px-4 py-2.5 font-bold text-slate-900">{row.style}</td>
              <td className="px-4 py-2.5 text-slate-600">{row.color}</td>
              {sizeColumns.map((size) => (
                <td key={size} className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {row.sizes[size] || "-"}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-black text-slate-900 tabular-nums">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarehouseDetailModal({ card, onClose, onDownload, downloading }) {
  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/90 bg-white/95 shadow-2xl backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-detail-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-[#0F2137]/5 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Flipkart Warehouse Batch
            </p>
            <h2
              id="warehouse-detail-title"
              className="mt-1 text-xl font-black text-slate-900"
            >
              {card.date}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {card.lineCount} style-color line{card.lineCount === 1 ? "" : "s"}{" "}
              · {card.totalPieces} pieces · {formatMoney(card.salesAmount)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload(card.date)}
              disabled={downloading || card.rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50 transition"
            >
              <Download size={14} />
              {downloading ? "Downloading..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 shadow-xs transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <WarehouseDetailTable rows={card.rows} />
      </div>
    </div>
  );
}

export default function WarehouseSection() {
  const [file, setFile] = useState(null);
  const [labelFile, setLabelFile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [downloadDate, setDownloadDate] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [chartRange, setChartRange] = useState("weekly");
  const [customFromDate, setCustomFromDate] = useState(() => shiftDate(todayYmd(), -6));
  const [customToDate, setCustomToDate] = useState(todayYmd);
  const [data, setData] = useState({
    count: 0,
    total_orders: 0,
    total_piece_qty: 0,
    total_invoice_amount: 0,
    items: [],
  });

  const loadRows = async (query = "") => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/flipkart-warehouse-report`, {
        params: query ? { search: query } : {},
      });
      setData({
        count: response.data.count || 0,
        total_orders: response.data.total_orders || 0,
        total_piece_qty: response.data.total_piece_qty || 0,
        total_invoice_amount: response.data.total_invoice_amount || 0,
        items: response.data.items || [],
      });
    } catch (error) {
      console.error("Failed to load Flipkart Warehouse data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const reportCards = useMemo(() => {
    const byDate = new Map();
    for (const row of data.items || []) {
      const date = row.date || todayYmd();
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    }

    return [...byDate.entries()]
      .map(([date, rows]) => {
        const summary = buildStyleSummary(rows);
        return {
          date,
          rows,
          lineCount: summary.length,
          totalPieces: summary.reduce((sum, item) => sum + item.total, 0),
          itemCount: new Set(
            rows.map((row) => `${row.order_id}\u0000${row.sku}`),
          ).size,
          salesAmount: uniqueSalesAmount(rows),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.items]);

  const chartRows = useMemo(
    () =>
      [...reportCards]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((card) => ({
          date: card.date,
          orders: card.itemCount,
          pieces: card.totalPieces,
          salesAmount: card.salesAmount,
        })),
    [reportCards],
  );

  const chartBounds = useMemo(() => {
    if (chartRows.length === 0) {
      return { from: "", to: "" };
    }

    const latestDate = chartRows[chartRows.length - 1].date;

    if (chartRange === "monthly") {
      return {
        from: shiftDate(latestDate, -29),
        to: latestDate,
      };
    }

    if (chartRange === "custom") {
      return {
        from: customFromDate,
        to: customToDate,
      };
    }

    return {
      from: shiftDate(latestDate, -6),
      to: latestDate,
    };
  }, [chartRange, chartRows, customFromDate, customToDate]);

  const visibleChartRows = useMemo(
    () =>
      chartRows.filter((row) => {
        if (chartBounds.from && row.date < chartBounds.from) return false;
        if (chartBounds.to && row.date > chartBounds.to) return false;
        return true;
      }),
    [chartBounds, chartRows],
  );

  const generateReport = async () => {
    if (!(file instanceof File)) {
      alert("Select a Flipkart Warehouse CSV or Excel file first.");
      return;
    }

    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await axios.post(
        `${API_BASE}/flipkart-warehouse-report`,
        formData,
      );

      setFile(null);
      await loadRows("");
      alert(response.data.message || "Flipkart Warehouse report generated.");
    } catch (error) {
      console.error(error);
      const detail = error.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : detail?.message || "Failed to generate report";
      alert(msg);
    } finally {
      setGenerating(false);
    }
  };

  const generateLabels = async () => {
    if (!(labelFile instanceof File)) {
      alert("Select a Malur Warehouse Label Excel file first.");
      return;
    }

    setGeneratingLabels(true);
    try {
      const formData = new FormData();
      formData.append("file", labelFile, labelFile.name);

      const response = await axios.post(
        `${API_BASE}/flipkart-warehouse-labels`,
        formData,
        { responseType: "blob" },
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Malur_Warehouse_Labels_${todayYmd()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setLabelFile(null);
    } catch (error) {
      console.error(error);
      alert("Failed to generate warehouse labels PDF.");
    } finally {
      setGeneratingLabels(false);
    }
  };

  const downloadReportExcel = async (date) => {
    setDownloadDate(date);
    try {
      const response = await axios.get(
        `${API_BASE}/flipkart-warehouse-report/export`,
        {
          params: { report_date: date },
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `flipkart_warehouse_report_${date || "all"}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Failed to download warehouse report");
    } finally {
      setDownloadDate(null);
    }
  };

  const deleteReport = async (date) => {
    if (!window.confirm(`Are you sure you want to delete warehouse report for ${date}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/flipkart-warehouse-report`, {
        params: { report_date: date },
      });
      await loadRows("");
      alert(`Report for ${date} deleted successfully.`);
    } catch (error) {
      console.error(error);
      alert("Failed to delete warehouse report");
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats Row (Navy Accents) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-panel rounded-2xl p-5 shadow-sm glass-card-hover flex flex-col justify-between bg-gradient-to-br from-[#0F2137]/10 via-white/80 to-[#1E3A66]/5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#0F2137]">Total Orders</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F2137]/10 text-[#0F2137]">
              <Package size={18} />
            </div>
          </div>
          <h3 className="mt-3 text-3xl font-black text-slate-900">{data.total_orders.toLocaleString()}</h3>
          <p className="mt-0.5 text-xs text-slate-500 font-medium">Warehouse line orders</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 shadow-sm glass-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Pieces</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700">
              <RefreshCw size={18} />
            </div>
          </div>
          <h3 className="mt-3 text-3xl font-black text-slate-900">{data.total_piece_qty.toLocaleString()}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Warehouse stock units</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 shadow-sm glass-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Invoice Amount</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
              <TrendingUp size={18} />
            </div>
          </div>
          <h3 className="mt-3 text-3xl font-black text-emerald-800">{formatMoney(data.total_invoice_amount)}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Gross revenue</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 shadow-sm glass-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Saved Reports</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-[#0F2137]">
              <FileSpreadsheet size={18} />
            </div>
          </div>
          <h3 className="mt-3 text-3xl font-black text-slate-900">{reportCards.length}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Active date batches</p>
        </div>
      </div>

      {/* TOP CHART SECTION: Date Wise Sales Bar Chart & Total Report Summary */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,480px)]">
        {/* Date Wise Sales Bar Chart */}
        <div className="glass-panel rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-[#0F2137]" />
                Date Wise Warehouse Sales
              </h3>
              <p className="text-xs text-slate-500">Interactive order volume bar graph with threshold indicators.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200/80 bg-white/80 p-1 shadow-xs">
                {CHART_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setChartRange(option.value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      chartRange === option.value
                        ? "bg-[#0F2137] text-white shadow-xs"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {chartRange === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-xs"
                  />
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {chartRows.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-xs text-slate-500">
              No warehouse chart data available. Upload warehouse reports below.
            </div>
          ) : visibleChartRows.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-xs text-slate-500">
              No reports found for the selected date range.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visibleChartRows}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip content={<WarehouseChartTooltip />} />
                  <Bar dataKey="orders" name="Orders" radius={[6, 6, 0, 0]}>
                    {visibleChartRows.map((entry, index) => {
                      let color = "#16a34a"; // Green (>20)
                      if (entry.orders < 5) {
                        color = "#dc2626"; // Red
                      } else if (entry.orders < 20) {
                        color = "#f59e0b"; // Orange
                      }
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-5 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
                  <span>0–4 Orders</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                  <span>5–20 Orders</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-600"></span>
                  <span>20+ Orders</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Total Report Summary Table */}
        <div className="glass-panel rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="mb-4 border-b border-slate-200/70 pb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers size={18} className="text-[#0F2137]" />
              Total Report Summary
            </h3>
            <p className="text-xs text-slate-500">Comprehensive batch performance totals.</p>
          </div>

          <div className="max-h-[300px] overflow-y-auto overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur-md">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-md font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">Date</th>
                  <th className="px-3.5 py-2.5 text-right">Orders</th>
                  <th className="px-3.5 py-2.5 text-right">Pieces</th>
                  <th className="px-3.5 py-2.5 text-right">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportCards.map((card) => (
                  <tr key={card.date} className="hover:bg-slate-50 transition">
                    <td className="px-3.5 py-2 font-medium text-slate-900">
                      {card.date}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums text-slate-600">
                      {card.itemCount}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums font-bold text-slate-900">
                      {card.totalPieces}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums font-semibold text-emerald-800">
                      {formatMoney(card.salesAmount)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#0F2137]/10 font-bold border-t border-slate-300">
                  <td className="px-3.5 py-2.5 text-[#0F2137]">Total</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-900">
                    {data.total_orders}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-900">
                    {data.total_piece_qty}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-emerald-800">
                    {formatMoney(data.total_invoice_amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upload & Action Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload 1: Warehouse Sales Report */}
        <div className="glass-panel rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2137]/10 text-[#0F2137] border border-[#0F2137]/20">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Upload Warehouse Sales Report</h3>
              <p className="text-xs text-slate-500">Upload Flipkart warehouse daily dispatches (CSV / Excel)</p>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/60 p-6 text-center transition hover:border-slate-400 hover:bg-white/90 cursor-pointer backdrop-blur-md shadow-xs">
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <FileSpreadsheet className="h-10 w-10 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-800">
              {file ? file.name : "Click or drag & drop Warehouse Sales file"}
            </span>
            <span className="mt-1 text-xs text-slate-500">Supports .csv and .xlsx formats</span>
          </label>

          <div className="mt-4 flex items-center justify-between">
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Clear file
              </button>
            )}
            <button
              type="button"
              disabled={!file || generating}
              onClick={generateReport}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate Warehouse Report"}
            </button>
          </div>
        </div>

        {/* Upload 2: Malur Warehouse Labels */}
        <div className="glass-panel rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 border border-blue-200">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Generate Malur Warehouse Labels</h3>
              <p className="text-xs text-slate-500">Upload Malur Warehouse Label Excel file to produce printable PDF</p>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/60 p-6 text-center transition hover:border-slate-400 hover:bg-white/90 cursor-pointer backdrop-blur-md shadow-xs">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={(e) => setLabelFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <FileSpreadsheet className="h-10 w-10 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-800">
              {labelFile ? labelFile.name : "Click or drag & drop Label Excel file"}
            </span>
            <span className="mt-1 text-xs text-slate-500">Supports .xlsx and .xls formats</span>
          </label>

          <div className="mt-4 flex items-center justify-between">
            {labelFile && (
              <button
                type="button"
                onClick={() => setLabelFile(null)}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Clear file
              </button>
            )}
            <button
              type="button"
              disabled={!labelFile || generatingLabels}
              onClick={generateLabels}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-800 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
            >
              {generatingLabels ? "Generating PDF..." : "Generate Labels PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* Saved Warehouse Reports Table (Glass Panel with 30vh scrolling) */}
      <div className="glass-panel rounded-3xl p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Available Warehouse Report Batches</h3>
            <p className="text-xs text-slate-500">View, export, or manage saved warehouse dispatch records.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search date or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadRows(search)}
                className="rounded-xl border border-slate-200/80 bg-white/80 py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-xs backdrop-blur-md"
              />
            </div>
            <button
              type="button"
              onClick={() => loadRows(search)}
              className="rounded-xl border border-slate-200/80 bg-white/80 p-2 text-slate-600 hover:bg-white shadow-xs"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {reportCards.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No warehouse reports found.</p>
            <p className="text-xs text-slate-400 mt-1">Upload a warehouse report file above to get started.</p>
          </div>
        ) : (
          <div className="max-h-[30vh] overflow-y-auto overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur-md">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-md text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200/80 shadow-xs">
                <tr>
                  <th className="px-4 py-3">Report Date</th>
                  <th className="px-4 py-3 text-right">Unique Items</th>
                  <th className="px-4 py-3 text-right">Total Pieces</th>
                  <th className="px-4 py-3 text-right">Sales Amount</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportCards.map((card) => (
                  <tr key={card.date} className="hover:bg-slate-100/50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">{card.date}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{card.itemCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">{card.totalPieces}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-800">
                      {formatMoney(card.salesAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCard(card)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
                          title="View Details"
                        >
                          <Eye size={14} className="text-blue-600" />
                          View
                        </button>
                        <button
                          type="button"
                          disabled={downloadDate === card.date}
                          onClick={() => downloadReportExcel(card.date)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-50 disabled:opacity-50"
                          title="Download Excel"
                        >
                          <Download size={14} />
                          Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteReport(card.date)}
                          className="rounded-lg border border-slate-200/80 bg-white p-1.5 text-rose-600 shadow-xs hover:bg-rose-50"
                          title="Delete Report"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Batch Viewer Modal */}
      <WarehouseDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onDownload={downloadReportExcel}
        downloading={Boolean(downloadDate)}
      />
    </div>
  );
}
