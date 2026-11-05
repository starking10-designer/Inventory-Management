import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  Filter,
  Layers3,
  Package,
  Palette,
  RefreshCw,
  Shirt,
  Store,
} from "lucide-react";
import { API_BASE } from "../api.js";
import "../sales-analytics-page.css";

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
    <div className="sales-analytics-page min-h-screen text-slate-800">
      {/* Header */}
      <WorkspaceTopBar>
        <div className="analytics-header-inner">
          <div className="analytics-heading">
            <Link
              to="/#dashboard"
              className="analytics-back-link"
            >
              <ChevronLeft size={16} />
              Dashboard
            </Link>
            <span className="analytics-heading-icon"><BarChart3 size={22} aria-hidden="true" /></span>
            <div className="analytics-heading-copy">
              <h1>
                Sales Analytics
              </h1>
              <p>Cross-platform pivot reports, breakdown matrices, and revenue analytics.</p>
            </div>
          </div>
        </div>
      </WorkspaceTopBar>

      {/* Main Content */}
      <main className="analytics-page-main">
        {/* Filter Bar */}
        <div className="analytics-filter-panel">
          <div className="analytics-filter-controls">
            <div>
              <label htmlFor="analytics-from-date">From date</label>
              <input
                id="analytics-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="analytics-filter-input"
              />
            </div>
            <div>
              <label htmlFor="analytics-to-date">To date</label>
              <input
                id="analytics-to-date"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="analytics-filter-input"
              />
            </div>
            <div>
              <label htmlFor="analytics-platform">Platform</label>
              <select
                id="analytics-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="analytics-filter-input"
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
                className="analytics-apply-button"
              >
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Filter size={15} />}
                {loading ? "Filtering..." : "Apply Filters"}
              </button>
            </div>
          </div>
        </div>

        {/* Reports Cards Grid */}
        <section aria-label="Sales analytics reports">
          <div className="analytics-report-grid">
            {REPORTS.map((report) => {
              const Icon = report.icon;
              return (
                <Link
                  key={report.key}
                  to={`/sales-analytics-report/${report.key}?${detailSearch}`}
                  className="analytics-report-card"
                  data-accent={report.key}
                >
                  <div className="analytics-card-top">
                    <div className="analytics-report-icon">
                      <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                    </div>
                    <div className="analytics-card-copy">
                      <h3 className="analytics-card-title">{report.title}</h3>
                      <p className="analytics-card-description">{report.description}</p>
                    </div>
                  </div>

                  <div className="analytics-card-footer">
                    <div className="analytics-record-count" aria-live="polite">
                      {loading ? "Loading records…" : <><strong>{rowCount(report).toLocaleString("en-IN")}</strong> {rowCount(report) === 1 ? "record" : "records"}</>}
                    </div>
                    <span className="analytics-card-action">View report <ArrowRight size={16} className="analytics-card-arrow" aria-hidden="true" /></span>
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
