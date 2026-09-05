import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import { TrendingUp, BarChart3, Download, Mail, Send, X, ChevronRight, Paperclip, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
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
  const [isMailPopupOpen, setIsMailPopupOpen] = useState(false);
  const [mailData, setMailData] = useState({ to: "", cc: "", subject: "" });
  const [sendingMail, setSendingMail] = useState(false);

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

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSales();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, platform, viewMode]);
    const generateExcelBlob = () => {
    const rows = [["Platform", "Total orders", "Total piece quantity", "Total invoice amount"]];
    summaryRows.forEach(row => {
      rows.push([row.platform, row.total_orders, row.total_piece_qty, row.total_invoice_amount]);
    });
    const totOrders = platform === "All" ? dailyData.total_orders : summaryRows.reduce((sum, row) => sum + row.total_orders, 0);
    const totQty = platform === "All" ? dailyData.grand_total : summaryRows.reduce((sum, row) => sum + row.total_piece_qty, 0);
    const totAmt = platform === "All" ? dailyData.total_invoice_amount : summaryRows.reduce((sum, row) => sum + row.total_invoice_amount, 0);
    rows.push(["Total", totOrders, totQty, totAmt]);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Platform Totals");
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/octet-stream' });
  };

  const handleSendMail = async (e) => {
    e.preventDefault();
    const storedAppPass = localStorage.getItem("googleAppPassword");
    const storedAuth = JSON.parse(localStorage.getItem("admin_auth_data") || "{}");
    const sessionAuth = JSON.parse(localStorage.getItem("admin_session") || "{}");
    const fromEmail = storedAuth.email || sessionAuth.email || "";
    if (!storedAppPass || !fromEmail) {
      alert("Please configure your email and Google App Password in the Profile section first.");
      return;
    }
    if (!dailyData) {
      alert("No data to send.");
      return;
    }
    setSendingMail(true);
    try {
      const blob = generateExcelBlob();
      const formData = new FormData();
      formData.append("from_email", fromEmail);
      formData.append("app_password", storedAppPass);
      formData.append("to_email", mailData.to);
      formData.append("cc_email", mailData.cc);
      formData.append("subject", mailData.subject || `Sales Performance - ${reportDate}`);
      formData.append("file", blob, `Sales_Overview_${reportDate}.xlsx`);
      
      await axios.post(`${API_BASE}/api/system/send-email`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      alert("Mail sent successfully!");
      setIsMailPopupOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to send mail. Please check your App Password.");
    } finally {
      setSendingMail(false);
    }
  };

  const downloadSalesReport = () => {
    if (!dailyData) {
      alert("No data to download");
      return;
    }
    try {
      const rows = [["Platform", "Total orders", "Total piece quantity", "Total invoice amount"]];
      
      summaryRows.forEach(row => {
        rows.push([
          row.platform,
          row.total_orders,
          row.total_piece_qty,
          row.total_invoice_amount
        ]);
      });
      
      const totOrders = platform === "All" ? dailyData.total_orders : summaryRows.reduce((sum, row) => sum + row.total_orders, 0);
      const totQty = platform === "All" ? dailyData.grand_total : summaryRows.reduce((sum, row) => sum + row.total_piece_qty, 0);
      const totAmt = platform === "All" ? dailyData.total_invoice_amount : summaryRows.reduce((sum, row) => sum + row.total_invoice_amount, 0);
      
      rows.push(["Total", totOrders, totQty, totAmt]);

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Platform Totals");
      
      XLSX.writeFile(workbook, `Sales_Overview_${reportDate}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("Download failed");
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMailData(prev => ({ ...prev, subject: `Sales Performance - ${reportDate}` }));
                setIsMailPopupOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all"
            >
              <Mail size={16} /> Send Mail
            </button>
            <Link
              to="/sales-analytics-report"
              className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-[#1E3A66] hover:to-[#0F2137] transition-all"
            >
              Detailed Analytics Page
              <ChevronRight size={14} />
            </Link>
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
      {isMailPopupOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md">
          <div className="w-full max-w-[480px] rounded-3xl bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Compose Mail</h3>
                  <p className="text-xs font-medium text-slate-500">Send the generated sales overview</p>
                </div>
              </div>
              <button onClick={() => setIsMailPopupOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSendMail} className="p-6 space-y-5">
              
              <div className="space-y-4 relative">
                {/* Connecting Line for visual flow */}
                <div className="absolute left-[15px] top-8 bottom-12 w-0.5 bg-slate-100 rounded-full z-0"></div>

                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white">From</div>
                  <input
                    type="email"
                    value={JSON.parse(localStorage.getItem("admin_auth_data") || "{}").email || JSON.parse(localStorage.getItem("admin_session") || "{}").email || ""}
                    readOnly
                    className="flex-1 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-4 text-sm font-medium text-slate-500 cursor-not-allowed shadow-sm"
                  />
                </div>

                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white">To</div>
                  <input
                    type="email"
                    required
                    value={mailData.to}
                    onChange={(e) => setMailData({ ...mailData, to: e.target.value })}
                    placeholder="Recipient email address"
                    className="flex-1 w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none shadow-sm placeholder:font-medium placeholder:text-slate-400"
                  />
                </div>
                
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white">CC</div>
                  <input
                    type="text"
                    value={mailData.cc}
                    onChange={(e) => setMailData({ ...mailData, cc: e.target.value })}
                    placeholder="Optional, comma separated"
                    className="flex-1 w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none shadow-sm placeholder:font-medium placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-600 mb-2">Subject</label>
                <input
                  type="text"
                  required
                  value={mailData.subject}
                  onChange={(e) => setMailData({ ...mailData, subject: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none shadow-sm"
                />
              </div>

              {/* Attachment card */}
              <div className="mt-4 p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/50 flex items-center justify-between group hover:border-emerald-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                    <Paperclip size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80 mb-0.5">Attachment Ready</p>
                    <p className="text-sm font-bold text-emerald-900">Sales_Overview_{reportDate}.xlsx</p>
                  </div>
                </div>
                <CheckCircle2 size={20} className="text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Actions */}
              <div className="pt-6 mt-2 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsMailPopupOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingMail}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 active:translate-y-0"
                >
                  {sendingMail ? "Sending..." : (
                    <>
                      <Send size={16} /> Send Email
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
