import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import { buildProductTrend, productTrendRange } from "../utils/productTrend.js";
import SalesAttachmentPreview from "./SalesAttachmentPreview.jsx";
import { TrendingUp, BarChart3, Download, Mail, Send, X, ChevronRight, Paperclip, CheckCircle2 , Eye, FileText, ShoppingCart, Package, IndianRupee, LayoutGrid } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TREND_COLORS = ["#166534", "#172554", "#f97316", "#ef4444", "#111111"];

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

  return (
    <div className="sales-trend-tooltip rounded-lg border border-slate-200 px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-slate-900">{payload[0]?.payload?.dateRange || label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="mt-1" style={{ color: item.color }}>
          {item.name}: <strong>{Number(item.value).toLocaleString("en-IN")} pieces</strong>
        </p>
      ))}
    </div>
  );
}

export default function SalesSection() {
  const [reportDate, setReportDate] = useState(todayYmd);
  const [platform, setPlatform] = useState("All");
  const [dailyData, setDailyData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [salesError, setSalesError] = useState("");
  const salesRequest = useRef(0);
  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState("monthly");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isMailPopupOpen, setIsMailPopupOpen] = useState(false);
  const [mailData, setMailData] = useState({ to: "", cc: "", subject: "" });
  const [sendingMail, setSendingMail] = useState(false);

  const loadSales = async () => {
    const range = productTrendRange(viewMode, fromDate, toDate);
    if (!range.start || !range.end || range.start > range.end) {
      alert("Please select a valid From and To date range.");
      return;
    }
    const requestId = ++salesRequest.current;
    setLoading(true);
    setSalesError("");
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
            period: "custom",
            from_date: range.start,
            to_date: range.start <= range.today && range.today < range.end ? range.today : range.end,
          },
        }),
      ]);
      if (requestId !== salesRequest.current) return;
      setDailyData(dailyResponse.data);
      setAnalyticsData({ ...analyticsResponse.data,
        trend: buildProductTrend(analyticsResponse.data.style_daily, viewMode, range),
      });
    } catch (e) {
      if (requestId !== salesRequest.current) return;
      console.error(e);
      setSalesError("Could not load sales data. Please try selecting the period again.");
      setDailyData(null);
      setAnalyticsData(null);
    } finally {
      if (requestId === salesRequest.current) setLoading(false);
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
    attachmentRows.forEach(row => {
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

  const trendProducts = analyticsData?.trend?.products || [];
  const chartData = analyticsData?.trend?.points || [];

  const summaryRows = useMemo(
    () => dailySummaryRows(dailyData, platform),
    [dailyData, platform],
  );

  const attachmentRows = summaryRows.filter(row =>
    [row.total_orders, row.total_piece_qty, row.total_invoice_amount].some(value => {
      const number = Number(value);
      return Number.isFinite(number) && number !== 0;
    }),
  );

  const hasDailySales =
    (dailyData?.total_orders ?? 0) > 0 ||
    (dailyData?.grand_total ?? 0) > 0 ||
    (dailyData?.total_invoice_amount ?? 0) > 0;

  return (
    <div className="sales-workspace">
      <div className="sales-toolbar flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <TrendingUp className="text-[#0F2137]" size={24} />
              Sales Performance Overview
            </h2>
            <p className="text-slate-800 font-medium text-xs mt-1">
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
              id="hidden-send-mail-btn" className="hidden"
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
                  <div className="sales-filters flex flex-wrap gap-3 items-end">
            
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-800 font-medium">
              Report Date
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="rounded-xl border border-slate-200 glass px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
              />
            </label>
            <button
              type="button"
              onClick={downloadSalesReport}
              disabled={loading || downloading}
              title="Download Style Wise & Color Wise Excel"
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 glass text-slate-700 hover:glass hover:text-[#0F2137] disabled:opacity-40 transition shadow-sm"
            >
              <Download size={18} />
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-800 font-medium">
            Platform Filter
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-xl border border-slate-200 glass px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm min-w-[160px]"
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

      {loading && !analyticsData ? (
        <p className="text-slate-800 font-medium text-sm py-8 text-center">
          Loading sales...
        </p>
      ) : salesError ? (
        <p role="alert" className="text-sm text-rose-700 py-8 text-center">{salesError}</p>
      ) : (
        <div className="sales-panels" aria-busy={loading}>
          <div className="sales-platform rounded-2xl border border-slate-200/80 glass overflow-hidden shadow-xs backdrop-blur-md">
            <div className="border-b border-slate-200/70 glass/60 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Platform totals for {reportDate}
              </h3>
            </div>
            {hasDailySales ? (
              <div data-lenis-prevent className="sales-table-scroll overflow-auto custom-scrollbar" tabIndex={0} aria-label="Platform totals table">
                <table className="glass-table platform-totals-table w-full text-left">
                  <thead className="bg-slate-50/50 backdrop-blur-md text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200/80">
                    <tr>
                      <th className="px-6 py-4 font-black">
                        <div className="flex items-center gap-2">
                          <LayoutGrid size={14} className="text-indigo-500" />
                          Platform
                        </div>
                      </th>
                      <th className="px-6 py-4 font-black">
                        <div className="flex items-center gap-2">
                          <ShoppingCart size={14} className="text-blue-500" />
                          Total Orders
                        </div>
                      </th>
                      <th className="px-6 py-4 font-black">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-emerald-500" />
                          Total Pieces
                        </div>
                      </th>
                      <th className="px-6 py-4 font-black">
                        <div className="flex items-center gap-2">
                          <IndianRupee size={14} className="text-rose-500" />
                          Invoice Amount
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {summaryRows.map((row) => (
                      <tr
                        key={row.platform}
                      >
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                            {row.platform}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-700">
                          {row.total_orders}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-700">
                          {row.total_piece_qty}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-full bg-emerald-50/80 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-100/50">
                            {formatMoney(row.total_invoice_amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr className="bg-slate-50/30 border-t-2 border-slate-200/80">
                      <td className="px-6 py-5 text-sm font-black text-slate-900 uppercase tracking-widest">
                        Grand Total
                      </td>
                      <td className="px-6 py-5 text-base font-black text-indigo-600">
                        {platform === "All"
                          ? dailyData.total_orders
                          : summaryRows.reduce((sum, row) => sum + row.total_orders, 0)}
                      </td>
                      <td className="px-6 py-5 text-base font-black text-blue-600">
                        {platform === "All"
                          ? dailyData.grand_total
                          : summaryRows.reduce((sum, row) => sum + row.total_piece_qty, 0)}
                      </td>
                      <td className="px-6 py-5 text-base font-black text-emerald-600">
                        {formatMoney(
                          platform === "All"
                            ? dailyData.total_invoice_amount
                            : summaryRows.reduce((sum, row) => sum + row.total_invoice_amount, 0)
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-800 font-medium text-sm py-8 text-center">
                No sales data for this date. Generate a final report first.
              </p>
            )}
          </div>

                <div className="sales-chart rounded-2xl border border-slate-200/80 glass p-5 shadow-xs backdrop-blur-md">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <BarChart3 size={16} className="text-[#0F2137]" />
                      Top 5 product trends ·{" "}
                      {platform === "All" ? "All Platforms" : platform}
                    </h3>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex rounded-xl border border-slate-200 glass p-1 shadow-sm">
                        {[
                          ["weekly", "Weekly"],
                          ["monthly", "Monthly"],
                          ["custom", "Custom Date"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={viewMode === value}
                            onClick={() => setViewMode(value)}
                            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                              viewMode === value
                                ? "bg-[#0F2137] text-white shadow-sm cursor-default"
                                : "text-slate-800 font-medium hover:glass"
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
                        <label className="mb-1 block text-xs font-bold text-slate-800 font-medium">
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
                        <label className="mb-1 block text-xs font-bold text-slate-800 font-medium">
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
                        className="rounded-xl bg-[#0F2137] px-4 py-2 text-xs font-bold text-white hover:glass"
                      >
                        Apply
                      </button>
                    </div>
                  )}

                  {trendProducts.length === 0 ? (
                    <p className="sales-empty text-sm text-slate-600 py-8 text-center">No product sales in this period.</p>
                  ) : (
                    <>
                      <div className="sales-trend-legend" aria-label="Product legend">
                        {trendProducts.map((product, index) => (
                          <span key={product.key} title={product.name}>
                            <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke={TREND_COLORS[index]} strokeWidth="2.5" /></svg>
                            <span>{product.name}</span>
                          </span>
                        ))}
                      </div>
                      <div data-lenis-prevent className="sales-chart-scroll" tabIndex={0} aria-label="Top five product sales over time">
                        <div className="sales-trend-canvas" style={{ minWidth: viewMode === "custom" ? Math.max(300, chartData.length * 38) : 300 }}>
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={100}>
                            <LineChart data={chartData} accessibilityLayer margin={{ top: 12, right: 18, left: 0, bottom: 4 }}>
                              <CartesianGrid stroke="#dce5ef" strokeDasharray="3 5" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#72839a" }} axisLine={false} tickLine={false} />
                              <YAxis allowDecimals={false} width={40} tick={{ fontSize: 10, fill: "#72839a" }} axisLine={false} tickLine={false} />
                              <Tooltip content={<StyleLineTooltip />} isAnimationActive={false} wrapperStyle={{ pointerEvents: "none" }} />
                              {trendProducts.map((product, index) => (
                                <Line key={product.key} type="linear" dataKey={product.key} name={product.name}
                                  stroke={TREND_COLORS[index]} strokeWidth={2.5}
                                  dot={{ r: 3, strokeWidth: 1.5, fill: "#fff" }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  )}
                </div>
        </div>
      )}
      {isMailPopupOpen && createPortal(
  <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center sm:p-6 glass/50 backdrop-blur-lg">
    <div className="w-full max-w-[1160px] rounded-t-[2rem] sm:rounded-[2rem] glass shadow-[0_-30px_80px_-10px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 sm:animate-in sm:fade-in sm:zoom-in-95 duration-300 relative" style={{maxHeight: "92vh"}}>

      {/* Gradient accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-[#2e4d70] via-[#203b5a] to-[#172f4b] flex-shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-8 sm:px-12 py-5 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2e4d70] to-[#172f4b] flex items-center justify-center text-white shadow-lg shadow-[#172f4b]/25">
              <Mail size={20} strokeWidth={2.5} />
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#203b5a] border-2 border-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">New Message</h3>
            <p className="text-xs font-medium text-slate-800 font-medium mt-0.5">Sales overview · Excel attached</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[#203b5a] bg-[#edf2f7] border border-[#203b5a]/15 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#203b5a] animate-pulse inline-block" />
            Attachment ready
          </span>
          <button type="button" onClick={() => setIsMailPopupOpen(false)} className="ml-2 w-9 h-9 flex items-center justify-center rounded-xl bg-[#203b5a] text-white font-medium hover:bg-[#172f4b] transition-all cursor-pointer">
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row min-h-0">

        {/* ─── LEFT: Compose Form ─── */}
        <div className="w-full md:w-[44%] flex flex-col border-r border-slate-100 glass min-h-0">
          <form id="send-mail-form" onSubmit={handleSendMail} className="flex-1 overflow-y-auto px-8 sm:px-12 py-8 space-y-0 custom-scrollbar">

            {/* Field: From */}
            <div className="flex items-center gap-5 py-4 border-b border-slate-100 group focus-within:border-[#203b5a] transition-colors">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800 font-medium w-9 flex-shrink-0 group-focus-within:text-[#203b5a] transition-colors select-none">From</span>
              <input
                type="email"
                value={JSON.parse(localStorage.getItem("admin_auth_data") || "{}").email || JSON.parse(localStorage.getItem("admin_session") || "{}").email || ""}
                readOnly
                className="flex-1 bg-transparent text-sm font-medium text-slate-800 font-medium outline-none cursor-not-allowed"
              />
            </div>

            {/* Field: To */}
            <div className="flex items-center gap-5 py-4 border-b border-slate-100 group focus-within:border-[#203b5a] transition-colors">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800 font-medium w-9 flex-shrink-0 group-focus-within:text-[#203b5a] transition-colors select-none">To</span>
              <input
                type="email"
                required
                value={mailData.to}
                onChange={(e) => setMailData({ ...mailData, to: e.target.value })}
                placeholder="recipient@company.com"
                className="mail-compose-field flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
              />
            </div>

            {/* Field: CC */}
            <div className="flex items-center gap-5 py-4 border-b border-slate-100 group focus-within:border-[#203b5a] transition-colors">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800 font-medium w-9 flex-shrink-0 group-focus-within:text-[#203b5a] transition-colors select-none">CC</span>
              <input
                type="text"
                value={mailData.cc}
                onChange={(e) => setMailData({ ...mailData, cc: e.target.value })}
                placeholder="team@company.com (optional)"
                className="mail-compose-field flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
              />
            </div>

            {/* Field: Subject */}
            <div className="flex items-start gap-5 py-5 border-b border-slate-100 group focus-within:border-[#203b5a] transition-colors">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800 font-medium w-9 flex-shrink-0 mt-1 group-focus-within:text-[#203b5a] transition-colors select-none">Subj</span>
              <input
                type="text"
                required
                value={mailData.subject}
                onChange={(e) => setMailData({ ...mailData, subject: e.target.value })}
                placeholder="Email subject…"
                className="mail-compose-field flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none leading-snug"
              />
            </div>

            {/* Attachment */}
            <div className="pt-6">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-800 font-medium mb-3">Attachments</p>
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/80 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2e4d70] to-[#172f4b] flex items-center justify-center text-white shadow-md shadow-[#172f4b]/20 flex-shrink-0">
                  <FileText size={20} strokeWidth={2} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-bold text-slate-800 truncate">Sales_Overview_{reportDate}.xlsx</p>
                  <p className="text-xs font-medium text-slate-800 font-medium mt-0.5">{attachmentRows.length} platform{attachmentRows.length === 1 ? "" : "s"} · Microsoft Excel</p>
                </div>
                <CheckCircle2 size={18} className="text-[#203b5a] flex-shrink-0" strokeWidth={2.5} />
              </div>
            </div>

          </form>

          {/* CTA Footer */}
          <div className="px-8 sm:px-12 py-6 border-t border-slate-100 flex items-center justify-between gap-3 glass/60 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsMailPopupOpen(false)}
              className="px-5 py-3 rounded-xl bg-[#203b5a] text-sm font-bold text-white hover:bg-[#172f4b] border border-[#203b5a] transition-all"
            >
              Discard
            </button>
            <button
              form="send-mail-form"
              type="submit"
              disabled={sendingMail}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#2e4d70] to-[#172f4b] text-sm font-bold text-white shadow-lg shadow-[#172f4b]/25 hover:from-[#365b82] hover:to-[#203b5a] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
            >
              {sendingMail ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-slate-200 border-t-white rounded-full animate-spin" /> Sending…</span>
              ) : (
                <><Send size={16} strokeWidth={2.5} /> Send Mail</>
              )}
            </button>
          </div>
        </div>

        {/* ─── RIGHT: Live Preview ─── */}
        <div className="mail-attachment-preview w-full md:w-[56%] bg-[#f8f9fc] flex flex-col min-h-0">

          {/* Preview header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 glass flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <Eye size={16} className="text-slate-800 font-medium" strokeWidth={2.5} />
              <span className="text-xs font-black uppercase tracking-widest text-slate-800 font-medium">Attachment Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800 font-medium glass px-2.5 py-1 rounded-lg">{attachmentRows.length} platform{attachmentRows.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          {/* Platform cards */}
          <div data-lenis-prevent className="flex-1 overflow-auto custom-scrollbar min-h-0">
            {attachmentRows.length > 0 ? (
              <SalesAttachmentPreview rows={attachmentRows} totals={{
                orders: platform === "All" ? dailyData?.total_orders : summaryRows.reduce((sum, row) => sum + Number(row.total_orders || 0), 0),
                pieces: platform === "All" ? dailyData?.grand_total : summaryRows.reduce((sum, row) => sum + Number(row.total_piece_qty || 0), 0),
                amount: platform === "All" ? dailyData?.total_invoice_amount : summaryRows.reduce((sum, row) => sum + Number(row.total_invoice_amount || 0), 0),
              }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-slate-800 font-medium mb-3">
                  <FileText size={22} />
                </div>
                <p className="text-sm font-semibold text-slate-800 font-medium">No data for {reportDate}</p>
                <p className="text-xs text-slate-800 font-medium mt-1">Load sales data to preview attachment</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>,
  document.body
)}
    </div>
  );
}
