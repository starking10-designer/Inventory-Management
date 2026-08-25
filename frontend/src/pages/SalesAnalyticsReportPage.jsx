import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  Filter,
  IndianRupee,
  Layers3,
  Package,
  Palette,
  RefreshCw,
  Shirt,
  Store,
} from "lucide-react";
import { API_BASE } from "../api.js";

const PLATFORM_OPTIONS = ["All", "Flipkart", "Amazon", "Ajio", "Meesho", "Myntra", "Flipkart Warehouse"];

const REPORTS = [
  { key: "platform-wise", title: "Platform Wise", description: "Compare style quantities across every sales platform.", dataKey: "platform_wise", icon: Store, accent: "text-[#0F2137] bg-[#0F2137]/10 border-[#0F2137]/20" },
  { key: "style-wise", title: "Style Wise", description: "Review size quantities and totals for each style.", dataKey: "style_wise", icon: Shirt, accent: "text-[#1E3A66] bg-[#1E3A66]/10 border-[#1E3A66]/20" },
  { key: "color-wise", title: "Color Wise", description: "See colors grouped by main product type and size.", dataKey: "color_wise", icon: Palette, accent: "text-rose-700 bg-rose-500/10 border-rose-200" },
  { key: "style-color-wise", title: "Style Wise & Color Wise", description: "Inspect every style and color combination.", dataKey: "style_color_wise", icon: Layers3, accent: "text-violet-700 bg-violet-500/10 border-violet-200" },
  { key: "combo-pack-wise", title: "Combo Pack Wise & Color", description: "Track pack sizes by color and garment size.", dataKey: "combo_pack_wise", icon: Package, accent: "text-amber-700 bg-amber-500/10 border-amber-200" },
  { key: "sales-wise", title: "Sales Wise", description: "Review daily orders, pieces, and invoice value.", dataKey: "sales_wise", icon: BarChart3, accent: "text-emerald-700 bg-emerald-500/10 border-emerald-200" },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function SalesAnalyticsReportPage() {
  const [searchParams] = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get("from_date") || monthStartIso());
  const [toDate, setToDate] = useState(searchParams.get("to_date") || todayIso());
  const [platform, setPlatform] = useState(searchParams.get("platform") || "All");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const queryParams = useMemo(() => ({ from_date: fromDate, to_date: toDate, platform }), [fromDate, toDate, platform]);
  const detailSearch = new URLSearchParams(queryParams).toString();

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/sales-pivot-analytics`, { params: queryParams });
      setData(response.data);
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.detail || "Failed to load sales analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAnalytics(); }, []);

  const rowCount = (report) => {
    const rows = data?.[report.dataKey] || [];
    if (report.key !== "sales-wise") return rows.length;
    return rows.reduce((count, row) => count + Object.keys(row.platforms || {}).length, 0);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/#dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <ChevronLeft size={16} />
              Dashboard
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <BarChart3 size={20} className="text-[#0F2137]" />
                Sales Analytics
              </h1>
              <p className="text-xs text-slate-500 font-medium">Cross-platform pivot reports, breakdown matrices, and revenue analytics.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1500px] px-6 py-6 space-y-6">
        {/* Filter Bar */}
        <div className="glass-panel rounded-3xl p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_200px_auto] items-end">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">To Date</label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-800"
              >
                {PLATFORM_OPTIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                onClick={loadAnalytics}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50"
              >
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Filter size={15} />}
                {loading ? "Filtering..." : "Apply Filters"}
              </button>
            </div>
          </div>
        </div>

        {/* Reports Cards Grid */}
        <section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORTS.map((report) => {
              const Icon = report.icon;
              return (
                <Link
                  key={report.key}
                  to={`/sales-analytics-report/${report.key}?${detailSearch}`}
                  className="group relative rounded-2xl border border-slate-200/80 bg-white/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white/95 hover:shadow-[0_12px_28px_rgba(15,33,55,0.08)] flex flex-col justify-between min-h-[160px] backdrop-blur-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${report.accent} shadow-xs`}>
                      <Icon size={22} />
                    </div>
                    <span className="rounded-lg bg-white/90 border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-xs">
                      {loading ? "..." : `${rowCount(report)} Rows`}
                    </span>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-[#0F2137] transition">
                      {report.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 font-medium line-clamp-2">
                      {report.description}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-end text-xs font-bold text-slate-600 group-hover:text-[#0F2137]">
                    Open Detailed Matrix
                    <ArrowRight size={15} className="ml-1 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
