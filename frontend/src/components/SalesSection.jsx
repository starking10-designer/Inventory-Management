import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API_BASE } from "../api.js";
import { TrendingUp, BarChart3 } from "lucide-react";
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

export default function SalesSection() {
  const [reportDate, setReportDate] = useState(todayYmd);
  const [platform, setPlatform] = useState("All");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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
    loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, platform]);

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

  const platformEntries = data?.platform_totals
    ? Object.entries(data.platform_totals).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="rounded-2xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="text-violet-600" size={24} />
            Sales overview
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Sold quantities from saved daily reports (per marketplace).
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Date
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
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
      ) : !data || data.grand_total === 0 ? (
        <p className="text-slate-500 text-sm py-8 text-center">
          No sales data for this date. Generate a final report first.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {platformEntries.map(([name, qty]) => (
              <div
                key={name}
                className="rounded-xl bg-white/70 border border-slate-200/80 px-3 py-3 text-center"
              >
                <p className="text-xs text-slate-500 truncate">{name}</p>
                <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">
                  {qty}
                </p>
              </div>
            ))}
            <div className="rounded-xl bg-violet-100/80 border border-violet-200 px-3 py-3 text-center">
              <p className="text-xs text-violet-700 font-medium">Total sold</p>
              <p className="text-lg font-bold text-violet-900 tabular-nums mt-1">
                {data.grand_total}
              </p>
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
