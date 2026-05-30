import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API_BASE } from "../api.js";
import { TrendingUp, BarChart3, Download } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#f97316",
  "#a855f7",
];

const PLATFORMS = [
  { value: "All", label: "All platforms" },
  { value: "Flipkart", label: "Flipkart" },
  { value: "Amazon", label: "Amazon" },
  { value: "Ajio", label: "Ajio" },
  { value: "Meesho", label: "Meesho" },
  { value: "Myntra", label: "Myntra" },
];

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function SalesSection() {
  const [reportDate, setReportDate] = useState(todayYmd);
  const [platform, setPlatform] = useState("All");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadSales = async () => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(`${API_BASE}/sales-analytics`, {
        params: { report_date: reportDate, platform },
      });
      setData(res);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, platform]);

  const downloadSalesReport = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(`${API_BASE}/sales-analytics/export`, {
        params: { report_date: reportDate, platform },
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `final_sale_report_${reportDate}_${platform.toLowerCase()}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const sizeColumns = useMemo(() => {
    if (!data?.top_products?.length) return [];
    const set = new Set();
    for (const p of data.top_products) {
      Object.keys(p.sizes || {}).forEach((s) => set.add(s));
    }
    const ordered = SIZE_ORDER.filter((s) => set.has(s));
    const extra = [...set].filter((s) => !SIZE_ORDER.includes(s)).sort();
    return [...ordered, ...extra];
  }, [data]);

  const chartData =
    data?.style_chart?.map((item) => ({
      name: item.style,
      qty: item.qty,
    })) ?? [];

  const summaryRows = useMemo(() => {
    const entries = Object.entries(data?.sales_summary ?? {});
    const rows = entries.map(([name, totals]) => ({
      platform: name,
      total_orders: totals.total_orders ?? 0,
      total_piece_qty: totals.total_piece_qty ?? 0,
      total_invoice_amount: totals.total_invoice_amount ?? 0,
    }));

    if (platform && platform !== "All") {
      return rows.filter((row) => row.platform === platform);
    }

    return rows;
  }, [data, platform]);

  const hasSales =
    (data?.total_orders ?? 0) > 0 ||
    (data?.grand_total ?? 0) > 0 ||
    (data?.total_invoice_amount ?? 0) > 0;

  return (
    <div className="rounded-2xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="text-violet-600" size={24} />
            Today's final sale report
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Platform-wise final sales from filtered daily report rows.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Date
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={downloadSalesReport}
              disabled={loading || downloading || !reportDate}
              title="Download Excel"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-40 transition"
            >
              <Download size={18} />
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            View platform
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[160px]"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm py-8 text-center">Loading sales…</p>
      ) : !data || !hasSales ? (
        <p className="text-slate-500 text-sm py-8 text-center">
          No sales data for this date. Generate a final report first.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200/80 bg-white/70 overflow-hidden mb-6">
            <div className="overflow-auto">
              <table className="w-full text-sm text-left min-w-[620px]">
                <thead className="bg-slate-100/90 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3 text-right">Total orders</th>
                    <th className="px-4 py-3 text-right">Total piece quantity</th>
                    <th className="px-4 py-3 text-right">Total invoice amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr
                      key={row.platform}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3 font-medium">{row.platform}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.total_orders}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.total_piece_qty}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(row.total_invoice_amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-violet-200 bg-violet-50/80 font-semibold text-violet-950">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {platform === "All"
                        ? data.total_orders
                        : summaryRows.reduce(
                            (sum, row) => sum + row.total_orders,
                            0,
                          )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {platform === "All"
                        ? data.grand_total
                        : summaryRows.reduce(
                            (sum, row) => sum + row.total_piece_qty,
                            0,
                          )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(
                        platform === "All"
                          ? data.total_invoice_amount
                          : summaryRows.reduce(
                              (sum, row) =>
                                sum + row.total_invoice_amount,
                              0,
                            ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <BarChart3 size={16} />
                  Top styles (pie) — {platform === "All" ? "all platforms" : platform}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="qty"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) =>
                          `${name} (${(percent * 100).toFixed(0)}%)`
                        }
                        labelLine={false}
                      >
                        {chartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Top styles (bar)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="qty" name="Qty" radius={[4, 4, 0, 0]}>
                        {chartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200/80 bg-white/70 overflow-hidden">
            <h3 className="text-sm font-semibold text-slate-700 px-4 py-3 border-b border-slate-100">
              Top 10 products by style
            </h3>
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm text-left min-w-max">
                <thead className="bg-slate-100/90 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Style</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    {sizeColumns.map((s) => (
                      <th key={s} className="px-3 py-2 text-right">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((p, i) => (
                    <tr
                      key={p.style}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                      <td
                        className="px-3 py-2 font-medium max-w-[200px] truncate"
                        title={p.style}
                      >
                        {p.style}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {p.total_qty}
                      </td>
                      {sizeColumns.map((s) => (
                        <td
                          key={s}
                          className="px-3 py-2 text-right tabular-nums text-slate-600"
                        >
                          {p.sizes?.[s] ? p.sizes[s] : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
