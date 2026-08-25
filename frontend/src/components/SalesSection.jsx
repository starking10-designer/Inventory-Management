import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API_BASE } from "../api.js";
import { TrendingUp, BarChart3, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

const PLATFORMS = [
  { value: "All", label: "All platforms" },
  { value: "Flipkart", label: "Flipkart" },
  { value: "Amazon", label: "Amazon" },
  { value: "Ajio", label: "Ajio" },
  { value: "Meesho", label: "Meesho" },
  { value: "Myntra", label: "Myntra" },
  { value: "Flipkart Warehouse", label: "Flipkart Warehouse" },
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

function dailySummaryRows(data, platform) {
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
}

function StyleLineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload || {};

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-slate-600">
        Total pieces: <span className="font-semibold">{item.qty || 0}</span>
      </p>
      {item.sizeSummary && (
        <p className="mt-1 max-w-64 text-xs text-slate-500">
          {item.sizeSummary}
        </p>
      )}
    </div>
  );
}

export default function SalesSection() {
  const [reportDate, setReportDate] = useState(todayYmd);
  const [platform, setPlatform] = useState("All");
  const [dailyData, setDailyData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState("monthly");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadSales = async () => {
    setLoading(true);
    try {
      const [dailyResponse, analyticsResponse] = await Promise.all([
        axios.get(`${API_BASE}/sales-analytics`, {
          params: {
            report_date: reportDate,
            platform,
          },
        }),
        axios.get(`${API_BASE}/sales-pivot-analytics`, {
          params: {
            platform,
            period: viewMode,
            from_date: fromDate,
            to_date: toDate,
          },
        }),
      ]);
      setDailyData(dailyResponse.data);
      setAnalyticsData(analyticsResponse.data);
    } catch (e) {
      console.error(e);
      setDailyData(null);
      setAnalyticsData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "custom") {
      return;
    }

    loadSales();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, platform, viewMode]);
  const downloadSalesReport = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(
        `${API_BASE}/sales-pivot-analytics/export`,
        {
          params: {
            platform,
            report_type: "style-color-wise",
            all_dates: true,
          },
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
        `style_color_wise_all_dates_${platform.toLowerCase()}.xlsx`,
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

  const styleRows = useMemo(
    () => (analyticsData?.style_wise || []).slice(0, 10),
    [analyticsData],
  );

  const sizeColumns = useMemo(() => {
    if (!styleRows.length) return [];
    const set = new Set();
    for (const row of styleRows) {
      Object.keys(row.sizes || {}).forEach((size) => set.add(size));
    }
    const ordered = SIZE_ORDER.filter((size) => set.has(size));
    const extra = [...set].filter((size) => !SIZE_ORDER.includes(size)).sort();
    return [...ordered, ...extra];
  }, [styleRows]);

  const chartData = styleRows.map((row) => ({
    name: row.style,
    qty: row.total,
    sizeSummary: Object.entries(row.sizes || {})
      .filter(([, qty]) => Number(qty || 0) > 0)
      .map(([size, qty]) => `${size}: ${qty}`)
      .join(" | "),
  }));

  const BAR_COLORS = [
    "#0F2137",
    "#1E3A66",
    "#2563EB",
    "#3B82F6",
    "#102A54",
    "#1D4ED8",
    "#334155",
    "#0284C7",
  ];

  const summaryRows = useMemo(
    () => dailySummaryRows(dailyData, platform),
    [dailyData, platform],
  );

  const hasDailySales =
    (dailyData?.total_orders ?? 0) > 0 ||
    (dailyData?.grand_total ?? 0) > 0 ||
    (dailyData?.total_invoice_amount ?? 0) > 0;

  const hasAnalyticsSales =
    (analyticsData?.totals?.orders ?? 0) > 0 ||
    (analyticsData?.totals?.pieces ?? 0) > 0 ||
    (analyticsData?.totals?.amount ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <TrendingUp className="text-[#0F2137]" size={24} />
            Sales Performance Overview
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Platform totals for selected date with Style Wise & Color Wise dispatches.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              Report Date
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
              />
            </label>
            <button
              type="button"
              onClick={downloadSalesReport}
              disabled={loading || downloading}
              title="Download Style Wise & Color Wise Excel"
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-[#0F2137] disabled:opacity-40 transition shadow-sm"
            >
              <Download size={18} />
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
            Platform Filter
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm min-w-[160px]"
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
        <p className="text-slate-500 text-sm py-8 text-center">
          Loading sales...
        </p>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 overflow-hidden mb-6 shadow-xs backdrop-blur-md">
            <div className="border-b border-slate-200/70 bg-slate-50/60 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Platform totals for {reportDate}
              </h3>
            </div>
            {hasDailySales ? (
              <div className="overflow-auto">
                <table className="w-full text-sm text-left min-w-[620px]">
                  <thead className="bg-slate-50/80 text-xs font-bold uppercase text-slate-600 border-b border-slate-200/60">
                    <tr>
                      <th className="px-4 py-3">Platform</th>
                      <th className="px-4 py-3 text-right">Total orders</th>
                      <th className="px-4 py-3 text-right">
                        Total piece quantity
                      </th>
                      <th className="px-4 py-3 text-right">
                        Total invoice amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr
                        key={row.platform}
                        className="border-t border-slate-100 hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3 font-medium">
                          {row.platform}
                        </td>
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
                    <tr className="border-t border-slate-300 bg-slate-100 font-bold text-slate-900">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {platform === "All"
                          ? dailyData.total_orders
                          : summaryRows.reduce(
                              (sum, row) => sum + row.total_orders,
                              0,
                            )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {platform === "All"
                          ? dailyData.grand_total
                          : summaryRows.reduce(
                              (sum, row) => sum + row.total_piece_qty,
                              0,
                            )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(
                          platform === "All"
                            ? dailyData.total_invoice_amount
                            : summaryRows.reduce(
                                (sum, row) => sum + row.total_invoice_amount,
                                0,
                              ),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500 text-sm py-8 text-center">
                No sales data for this date. Generate a final report first.
              </p>
            )}
          </div>

          {!hasAnalyticsSales ? (
            <p className="text-slate-500 text-sm py-8 text-center">
              No Style Wise & Color Wise analytics data found.
            </p>
          ) : (
            <>
              {chartData.length > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 mb-6 shadow-xs backdrop-blur-md">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <BarChart3 size={16} className="text-[#0F2137]" />
                      Style Trend -{" "}
                      {platform === "All" ? "All Platforms" : platform}
                    </h3>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                        {[
                          ["weekly", "Weekly"],
                          ["monthly", "Monthly"],
                          ["custom", "Custom Date"],
                        ].map(([value, label]) => (
                          <button
                            type="button"
                            disabled={viewMode === value}
                            onClick={() => setViewMode(value)}
                            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                              viewMode === value
                                ? "bg-[#0F2137] text-white shadow-sm cursor-default"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {viewMode === "custom" && (
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-600">
                          From
                        </label>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-600">
                          To
                        </label>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!fromDate || !toDate) {
                            alert("Please select both From and To dates.");
                            return;
                          }

                          loadSales();
                        }}
                        className="rounded-xl bg-[#0F2137] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        Apply
                      </button>
                    </div>
                  )}

                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{
                          top: 25,
                          right: 20,
                          left: 0,
                          bottom: 10,
                        }}
                        barCategoryGap="25%"
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />

                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={70}
                        />

                        <YAxis tick={{ fontSize: 11 }} />

                        <Tooltip content={<StyleLineTooltip />} />

                        <Bar dataKey="qty" barSize={34}>
                          {chartData.map((entry, index) => (
                            <Cell
                              key={index}
                              fill={BAR_COLORS[index % BAR_COLORS.length]}
                            />
                          ))}

                          <LabelList
                            dataKey="qty"
                            position="top"
                            fontSize={11}
                            fontWeight="bold"
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200/80 bg-white/80 overflow-hidden shadow-xs backdrop-blur-md">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 px-4 py-3 border-b border-slate-200/70 bg-slate-50/60">
                  Top 10 products by style
                </h3>
                <div className="overflow-auto max-h-80">
                  <table className="w-full text-sm text-left min-w-max">
                    <thead className="bg-slate-50/80 text-xs font-bold uppercase text-slate-600 border-b border-slate-200/60">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Style</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        {sizeColumns.map((size) => (
                          <th key={size} className="px-3 py-2 text-right">
                            {size}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {styleRows.map((row, index) => (
                        <tr
                          key={row.style}
                          className="border-t border-slate-100 hover:bg-slate-50/80"
                        >
                          <td className="px-3 py-2 text-slate-500">
                            {index + 1}
                          </td>
                          <td
                            className="px-3 py-2 font-medium max-w-[200px] truncate"
                            title={row.style}
                          >
                            {row.style}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {row.total}
                          </td>
                          {sizeColumns.map((size) => (
                            <td
                              key={size}
                              className="px-3 py-2 text-right tabular-nums text-slate-600"
                            >
                              {row.sizes?.[size] ? row.sizes[size] : "-"}
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
        </>
      )}
    </div>
  );
}
