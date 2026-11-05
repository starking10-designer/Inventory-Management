import { ANALYTICS_BAR_COLORS } from "../chartColors.js";
import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import "../dashboard.css";
import "../return-analysis.css";
import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Calendar,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Package,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Layers,
  IndianRupee,
} from "lucide-react";
import axios from "axios";
import { API_BASE } from "../api.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LabelList,
  Cell,
} from "recharts";

const PLATFORM_COLORS = {
  Flipkart: "#2874f0",
  Amazon: "#f97316",
  Ajio: "#6b7280",
  Meesho: "#ec4899",
  Myntra: "#e11d48",
  Other: "#8b5cf6",
};

const PLATFORM_LIGHT = {
  Flipkart: "#eff6ff",
  Amazon: "#fff7ed",
  Ajio: "#f9fafb",
  Meesho: "#fdf2f8",
  Myntra: "#fff1f2",
  Other: "#f5f3ff",
};

const getStatusStyles = (status) => {
  const s = (status || "").toLowerCase();
  if (
    s.includes("approved") ||
    s.includes("delivered") ||
    s.includes("complete")
  )
    return {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      dot: "bg-emerald-400",
    };
  if (s.includes("reject") || s.includes("cancel"))
    return {
      bg: "bg-rose-50",
      text: "text-rose-700",
      border: "border-rose-200",
      dot: "bg-rose-400",
    };
  if (s.includes("return"))
    return {
      bg: "bg-orange-50",
      text: "text-orange-700",
      border: "border-orange-200",
      dot: "bg-orange-400",
    };
  if (s.includes("transit") || s.includes("progress") || s.includes("pending"))
    return {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      dot: "bg-amber-400",
    };
  return {
    bg: "glass",
    text: "text-slate-800 font-medium",
    border: "border-slate-200",
    dot: "glass",
  };
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="return-analysis-tooltip">
      <p className="text-sm font-bold text-slate-800 font-medium mb-3 uppercase tracking-wider">
        {label}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center justify-between gap-4 mb-1.5"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-sm font-semibold text-slate-800 font-medium">
              {entry.name}
            </span>
          </div>
          <span className="text-sm font-black text-slate-900">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function ReturnAnalysisPage() {
  const [data, setData] = useState([]);
  const [missingPieces, setMissingPieces] = useState([]);
  const [damagedPieces, setDamagedPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [graphPlatform, setGraphPlatform] = useState("All");
  const [activeGraph, setActiveGraph] = useState("returns");
  const [graphStartDate, setGraphStartDate] = useState("");
  const [graphEndDate, setGraphEndDate] = useState("");

  const [tableSearch, setTableSearch] = useState("");

  // Excel Filter States
  const [sortField, setSortField] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const [dynamicFilters, setDynamicFilters] = useState({});

  // Missing Pieces State
  const [missingTableSearch, setMissingTableSearch] = useState("");
  const [damagedTableSearch, setDamagedTableSearch] = useState("");
  const [missingDynamicFilters, setMissingDynamicFilters] = useState({});
  const [damagedDynamicFilters, setDamagedDynamicFilters] = useState({});
  const [missingSortField, setMissingSortField] = useState("");
  const [missingSortAsc, setMissingSortAsc] = useState(true);
  const [missingCurrentPage, setMissingCurrentPage] = useState(1);
  const [damagedCurrentPage, setDamagedCurrentPage] = useState(1);
  const [damagedSortField, setDamagedSortField] = useState("");
  const [damagedSortAsc, setDamagedSortAsc] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resData, resMissing, resDamaged] = await Promise.all([
        axios.get(`${API_BASE}/api/analytics/return-analytics`),
        axios.get(`${API_BASE}/api/analytics/missing-return-pieces`),
        axios.get(`${API_BASE}/api/analytics/damaged-return-pieces`),
      ]);
      setData(resData.data.data || []);
      setMissingPieces(
        Array.isArray(resMissing.data)
          ? resMissing.data
          : resMissing.data.data || [],
      );
      setDamagedPieces(
        Array.isArray(resDamaged.data)
          ? resDamaged.data
          : resDamaged.data.data || [],
      );
    } catch (err) {
      console.error("Failed to fetch analytics", err);
      setError("Failed to load return analytics data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── KPI Metrics ─────────────────────────────────────────────────────
  const kpiMetrics = useMemo(() => {
    if (!data.length)
      return { total: 0, totalQty: 0, platforms: 0, totalAmount: 0 };
    const totalQty = data.reduce((s, r) => s + parseInt(r.qty || 1, 10), 0);
    const platforms = new Set(data.map((r) => r.platform).filter(Boolean)).size;
    const totalAmount = data.reduce(
      (s, r) => s + (parseFloat(r.amount) || 0),
      0,
    );
    return { total: data.length, totalQty, platforms, totalAmount };
  }, [data]);

  const missingMetrics = useMemo(() => {
    if (!missingPieces || !missingPieces.length)
      return { totalQty: 0, totalAmount: 0 };
    const totalQty = missingPieces.reduce(
      (s, r) => s + parseInt(r.qty || 1, 10),
      0,
    );
    const totalAmount = missingPieces.reduce(
      (s, r) => s + (parseFloat(r.amount) || 0),
      0,
    );
    return { totalQty, totalAmount };
  }, [missingPieces]);

  const damagedMetrics = useMemo(() => {
    if (!damagedPieces || !damagedPieces.length)
      return { totalQty: 0, totalAmount: 0 };
    const totalQty = damagedPieces.reduce(
      (s, r) => s + parseInt(r.qty || 1, 10),
      0,
    );
    const totalAmount = damagedPieces.reduce(
      (s, r) => s + (parseFloat(r.amount) || 0),
      0,
    );
    return { totalQty, totalAmount };
  }, [damagedPieces]);

  // ── Platform Summary & Amount Data ──────────────────────────────────
  const platformSummary = useMemo(() => {
    const map = {};
    for (const row of data) {
      const p = row.platform || "Other";
      if (!map[p]) map[p] = { qty: 0, count: 0, amount: 0 };
      map[p].qty += parseInt(row.qty || 1, 10);
      map[p].count += 1;
      map[p].amount += parseFloat(row.amount || 0);
    }
    return Object.entries(map)
      .map(([platform, v]) => ({ platform, ...v }))
      .sort((a, b) => b.qty - a.qty);
  }, [data]);

  const statusSummary = useMemo(() => {
    const map = {};
    for (const row of data) {
      const s = row.status || "Unknown Status";
      if (!map[s]) map[s] = { status: s, count: 0 };
      map[s].count += parseInt(row.qty || 1, 10);
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [data]);

  const reasonSummary = useMemo(() => {
    const map = {};
    for (const row of data) {
      const r = row.return_reason || "Unknown Reason";
      if (!map[r]) map[r] = { reason: r, count: 0 };
      map[r].count += parseInt(row.qty || 1, 10);
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [data]);

  // ── Chart Data ────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!data.length) return [];
    const filteredForGraph = data.filter((row) => {
      if (graphPlatform !== "All" && row.platform !== graphPlatform)
        return false;
      if (graphStartDate && row.return_date && row.return_date < graphStartDate)
        return false;
      if (graphEndDate && row.return_date && row.return_date > graphEndDate)
        return false;
      return true;
    });
    const grouped = filteredForGraph.reduce((acc, row) => {
      const date = row.return_date || "Unknown";
      if (!acc[date]) {
        acc[date] = {
          date,
          Flipkart: 0,
          Amazon: 0,
          Ajio: 0,
          Meesho: 0,
          Myntra: 0,
          Other: 0,
        };
      }
      const p = row.platform || "Other";
      const qty = parseInt(row.qty || 1, 10);
      if (acc[date][p] !== undefined) {
        acc[date][p] += qty;
      } else {
        acc[date].Other += qty;
      }
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => {
      if (a.date === "Unknown") return 1;
      if (b.date === "Unknown") return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [data, graphPlatform, graphStartDate, graphEndDate]);

  const missingChartData = useMemo(() => {
    if (!missingPieces.length) return [];
    const grouped = missingPieces.reduce((acc, row) => {
      const date = row.return_date || "Unknown";
      if (!acc[date]) acc[date] = { date, qty: 0 };
      acc[date].qty += parseInt(row.qty || 1, 10);
      return acc;
    }, {});
    return Object.values(grouped).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
  }, [missingPieces]);

  const damagedChartData = useMemo(() => {
    if (!damagedPieces.length) return [];
    const grouped = damagedPieces.reduce((acc, row) => {
      const date = row.return_date || "Unknown";
      if (!acc[date]) acc[date] = { date, qty: 0 };
      acc[date].qty += parseInt(row.qty || 1, 10);
      return acc;
    }, {});
    return Object.values(grouped).sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
  }, [damagedPieces]);

  // ── Table Filtering & Sorting ──────────────────────────────────────────
  const dynamicColumns = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]).filter((k) => k !== "id");
  }, [data]);

  const filteredTableData = useMemo(() => {
    let result = [...data];

    // Column Filters
    Object.keys(dynamicFilters).forEach((colKey) => {
      const selected = dynamicFilters[colKey];
      if (selected && selected.length > 0) {
        result = result.filter((row) => selected.includes(row[colKey]));
      }
    });

    // Global Search
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }

    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Handle numeric sorting for qty and amount
        if (sortField === "qty" || sortField === "amount") {
          valA = parseFloat(valA || 0);
          valB = parseFloat(valB || 0);
          return sortAsc ? valA - valB : valB - valA;
        }

        // String sorting
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, tableSearch, dynamicFilters, sortField, sortAsc]);

  const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);
  const paginatedData = filteredTableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [tableSearch, dynamicFilters]);

  // Missing Pieces Logic
  const missingDynamicColumns = useMemo(() => {
    if (!missingPieces || missingPieces.length === 0) return [];
    return Object.keys(missingPieces[0]).filter(
      (k) => k !== "id" && k !== "reported_at",
    );
  }, [missingPieces]);

  const filteredMissingData = useMemo(() => {
    let result = [...missingPieces];

    Object.keys(missingDynamicFilters).forEach((colKey) => {
      const selected = missingDynamicFilters[colKey];
      if (selected && selected.length > 0) {
        result = result.filter((row) => selected.includes(row[colKey]));
      }
    });

    if (missingTableSearch) {
      const q = missingTableSearch.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }

    if (missingSortField) {
      result.sort((a, b) => {
        let valA = a[missingSortField];
        let valB = b[missingSortField];

        if (missingSortField === "qty" || missingSortField === "amount") {
          valA = parseFloat(valA || 0);
          valB = parseFloat(valB || 0);
          return missingSortAsc ? valA - valB : valB - valA;
        }

        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();

        if (valA < valB) return missingSortAsc ? -1 : 1;
        if (valA > valB) return missingSortAsc ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [
    missingPieces,
    missingTableSearch,
    missingDynamicFilters,
    missingSortField,
    missingSortAsc,
  ]);

  const missingTotalPages = Math.ceil(
    filteredMissingData.length / itemsPerPage,
  );
  const paginatedMissingData = filteredMissingData.slice(
    (missingCurrentPage - 1) * itemsPerPage,
    missingCurrentPage * itemsPerPage,
  );

  useEffect(() => {
    setMissingCurrentPage(1);
  }, [missingTableSearch, missingDynamicFilters]);

  const handleNextMissingPage = () => {
    if (missingCurrentPage < missingTotalPages)
      setMissingCurrentPage((p) => p + 1);
  };
  const handlePrevMissingPage = () => {
    if (missingCurrentPage > 1) setMissingCurrentPage((p) => p - 1);
  };

  const damagedDynamicColumns = useMemo(() => {
    if (!damagedPieces || damagedPieces.length === 0) return [];
    return Object.keys(damagedPieces[0]).filter(
      (k) => k !== "id" && k !== "reported_at",
    );
  }, [damagedPieces]);

  const filteredDamagedData = useMemo(() => {
    let result = [...damagedPieces];

    Object.keys(damagedDynamicFilters).forEach((colKey) => {
      const selected = damagedDynamicFilters[colKey];
      if (selected && selected.length > 0) {
        result = result.filter((row) => selected.includes(row[colKey]));
      }
    });

    if (damagedTableSearch) {
      const q = damagedTableSearch.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }

    if (damagedSortField) {
      result.sort((a, b) => {
        let valA = a[damagedSortField];
        let valB = b[damagedSortField];

        if (damagedSortField === "qty" || damagedSortField === "amount") {
          valA = parseFloat(valA || 0);
          valB = parseFloat(valB || 0);
          return damagedSortAsc ? valA - valB : valB - valA;
        }

        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();

        if (valA < valB) return damagedSortAsc ? -1 : 1;
        if (valA > valB) return damagedSortAsc ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [
    damagedPieces,
    damagedTableSearch,
    damagedDynamicFilters,
    damagedSortField,
    damagedSortAsc,
  ]);

  const damagedTotalPages = Math.ceil(
    filteredDamagedData.length / itemsPerPage,
  );
  const paginatedDamagedData = filteredDamagedData.slice(
    (damagedCurrentPage - 1) * itemsPerPage,
    damagedCurrentPage * itemsPerPage,
  );

  useEffect(() => {
    setDamagedCurrentPage(1);
  }, [damagedTableSearch, damagedDynamicFilters]);

  const handleNextDamagedPage = () => {
    if (damagedCurrentPage < damagedTotalPages)
      setDamagedCurrentPage((p) => p + 1);
  };
  const handlePrevDamagedPage = () => {
    if (damagedCurrentPage > 1) setDamagedCurrentPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  };
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const uniquePlatforms = [
    "All",
    "Flipkart",
    "Amazon",
    "Ajio",
    "Meesho",
    "Myntra",
  ];

  // Render
  return (
    <div
      className="return-analysis-page"
    >
      {/* ── Sticky Header ──────────────────────────────────────────────── */}
      <WorkspaceTopBar>
        <div className="return-analysis-heading">
          <Link to="/return-inventory" aria-label="Back to Return Inventory" className="return-analysis-back"><ArrowLeft size={18} /></Link>
          <span className="return-analysis-page-icon"><BarChart3 size={20} /></span>
          <div><h1>Return Analytics</h1><p>Returns, missing pieces &amp; damaged stock</p></div>
        </div>
      </WorkspaceTopBar>
      <main className="return-analysis-content">
        {loading ? (
          <div className="text-slate-800 font-medium">Loading...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <>
            <section className="return-analysis-kpis" aria-label="Return performance overview">
              {[
                { label: "Valid returns", value: kpiMetrics.totalQty.toLocaleString("en-IN"), sub: "Returned units", icon: Package, tone: "blue" },
                { label: "Return value", value: `₹${kpiMetrics.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, sub: "Value of valid returns", icon: IndianRupee, tone: "blue" },
                { label: "Damaged pieces", value: damagedMetrics.totalQty.toLocaleString("en-IN"), sub: "Damaged return units", icon: RotateCcw, tone: "orange" },
                { label: "Damaged value", value: `₹${damagedMetrics.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, sub: "Value of damaged pieces", icon: IndianRupee, tone: "orange" },
                { label: "Missing pieces", value: missingMetrics.totalQty.toLocaleString("en-IN"), sub: "Units not received", icon: AlertCircle, tone: "red" },
                { label: "Missing value", value: `₹${missingMetrics.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, sub: "Value of missing pieces", icon: IndianRupee, tone: "red" },
              ].map(card => (
                <article key={card.label} className="dashboard-stat" data-tone={card.tone}>
                  <div className="dashboard-card-top"><span>{card.label}</span><span className="dashboard-icon"><card.icon size={20} /></span></div>
                  <strong>{card.value}</strong><p>{card.sub}</p>
                </article>
              ))}
            </section>

            <section className="return-analysis-charts" aria-labelledby="return-performance-heading">
              <div className="return-analysis-chart-header">
                <div><h2 id="return-performance-heading"><BarChart3 size={19} /> Return performance</h2><p>Compare return trends and the issues behind them.</p></div>
                <div className="return-analysis-chart-tabs" role="tablist" aria-label="Return performance graphs">
                  {[["returns", "Returns"], ["reasons", "Return reasons"], ["missing", "Missing pieces"], ["damaged", "Damaged pieces"]].map(([id, label], index, tabs) => (
                    <button key={id} id={`return-graph-tab-${id}`} type="button" role="tab" aria-selected={activeGraph === id} aria-controls={`return-graph-${id}`} tabIndex={activeGraph === id ? 0 : -1}
                      onClick={() => setActiveGraph(id)}
                      onKeyDown={event => {
                        const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                        if (nextIndex === null) return;
                        event.preventDefault();
                        setActiveGraph(tabs[nextIndex][0]);
                        event.currentTarget.parentElement.children[nextIndex].focus();
                      }}>{label}</button>
                  ))}
                </div>
              </div>
              {activeGraph === "returns" && (
                <div className="return-analysis-chart" role="tabpanel" id="return-graph-returns" aria-labelledby="return-graph-tab-returns">
                <h2 className="text-lg font-black text-emerald-600 mb-6 flex items-center gap-2">
                  <TrendingDown size={20} className="text-emerald-600" />{" "}
                  Returns Over Time
                </h2>
                <div className="return-analysis-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        {uniquePlatforms
                          .filter((p) => p !== "All")
                          .map((p) => (
                            <linearGradient
                              key={p}
                              id={`color${p}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor={
                                  PLATFORM_COLORS[p] || PLATFORM_COLORS.Other
                                }
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="95%"
                                stopColor={
                                  PLATFORM_COLORS[p] || PLATFORM_COLORS.Other
                                }
                                stopOpacity={0}
                              />
                            </linearGradient>
                          ))}
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 12,
                          fill: "#64748b",
                          fontWeight: 600,
                        }}
                        minTickGap={30}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#64748b",
                        }}
                      />
                      {uniquePlatforms
                        .filter((p) => p !== "All")
                        .map((p) => (
                          <Area
                            key={p}
                            type="monotone"
                            dataKey={p}
                            stackId="1"
                            stroke={PLATFORM_COLORS[p] || PLATFORM_COLORS.Other}
                            strokeWidth={2}
                            fill={`url(#color${p})`}
                          />
                        ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              )}
              {activeGraph === "reasons" && (
                <div className="return-analysis-chart" role="tabpanel" id="return-graph-reasons" aria-labelledby="return-graph-tab-reasons">
                <h2 className="text-lg font-black text-blue-600 mb-6 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-600" /> Top Return
                  Reasons
                </h2>
                <div className="return-reasons-scroll" data-lenis-prevent>
                  <div className="return-analysis-chart-canvas" style={{ minWidth: Math.max(reasonSummary.length * 135, 300), height: 360 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reasonSummary} margin={{ top: 26, right: 24, left: 0, bottom: 10 }} barCategoryGap="28%">
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#bacde04d" />
                        <XAxis dataKey="reason" interval={0} angle={-20} textAnchor="end" height={90} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} tickMargin={12} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={42} tick={{ fontSize: 12, fill: "#7a8da4" }} />
                        <Tooltip cursor={{ fill: "#315f9b08" }} formatter={value => [value, "Returns"]} contentStyle={{ borderRadius: 12, border: "1px solid #d4e1ed", background: "#f8fbff" }} />
                        <Bar dataKey="count" radius={[7, 7, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                          {reasonSummary.map((item, index) => <Cell key={item.reason} fill={ANALYTICS_BAR_COLORS[index % ANALYTICS_BAR_COLORS.length]} />)}
                          <LabelList dataKey="count" position="top" offset={9} fill="#183654" fontSize={12} fontWeight={700} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              )}
              {activeGraph === "missing" && (
                <div className="return-analysis-chart" role="tabpanel" id="return-graph-missing" aria-labelledby="return-graph-tab-missing">
                <h2 className="text-lg font-black text-rose-600 mb-6 flex items-center gap-2">
                  <TrendingUp size={20} className="text-rose-600" /> Missing
                  Pieces Over Time
                </h2>
                <div className="return-analysis-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={missingChartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorMissing"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#e11d48"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#e11d48"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 12,
                          fill: "#64748b",
                          fontWeight: 600,
                        }}
                        minTickGap={30}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="qty"
                        stroke="#e11d48"
                        strokeWidth={3}
                        fill="url(#colorMissing)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              )}
              {activeGraph === "damaged" && (
                <div className="return-analysis-chart" role="tabpanel" id="return-graph-damaged" aria-labelledby="return-graph-tab-damaged">
                <h2 className="text-lg font-black text-orange-600 mb-6 flex items-center gap-2">
                  <TrendingUp size={20} className="text-orange-600" /> Damaged
                  Pieces Over Time
                </h2>
                <div className="return-analysis-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={damagedChartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorDamaged"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ea580c"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ea580c"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 12,
                          fill: "#64748b",
                          fontWeight: 600,
                        }}
                        minTickGap={30}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="qty"
                        stroke="#ea580c"
                        strokeWidth={3}
                        fill="url(#colorDamaged)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              )}
            </section>

            <div className="return-analysis-table" data-kind="valid">
              <div className="return-analysis-table-heading">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <Package className="text-emerald-500" /> Valid Returns
                </h2>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-800 font-medium"
                  />
                  <input
                    type="text"
                    placeholder="Search valid returns..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 glass border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all w-64"
                  />
                </div>
              </div>
              <div className="return-analysis-table-scroll" data-lenis-prevent>
                <table className="glass-table return-analysis-data-table">
                  <thead className="glass border-b border-slate-100">
                    <tr>
                      {dynamicColumns.map((col) => (
                        <th
                          key={col}
                          className="px-6 py-4 text-xs font-bold text-slate-800 font-medium uppercase tracking-widest whitespace-nowrap"
                        >
                          <ExcelHeaderFilter
                            label={col.replace(/_/g, " ")}
                            columnKey={col}
                            values={Array.from(
                              new Set(data.map((r) => r[col])),
                            ).filter(Boolean)}
                            selectedValues={dynamicFilters[col] || []}
                            onFilterChange={(v) =>
                              setDynamicFilters((p) => ({ ...p, [col]: v }))
                            }
                            sortField={sortField}
                            sortAsc={sortAsc}
                            onSort={(f, a) => {
                              setSortField(f);
                              setSortAsc(a);
                            }}
                            align={
                              ["qty", "amount"].includes(col) ? "right" : "left"
                            }
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={dynamicColumns.length}
                          className="py-12 text-center text-slate-800 font-medium"
                        >
                          No valid returns found.
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((row, i) => (
                        <tr
                          key={i}
                          className="hover:glass/60 transition-colors"
                        >
                          {dynamicColumns.map((col) => (
                            <td
                              key={col}
                              className={`px-6 py-4 text-sm text-slate-800 font-medium ${["qty", "amount"].includes(col) ? "text-right font-semibold tabular-nums text-slate-800" : ""}`}
                            >
                              {col === "status" ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${getStatusStyles(row[col]).bg} ${getStatusStyles(row[col]).text} ${getStatusStyles(row[col]).border}`}
                                >
                                  {row[col]}
                                </span>
                              ) : col === "amount" ? (
                                `₹${parseFloat(row[col] || 0).toLocaleString("en-IN")}`
                              ) : (
                                row[col]
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="return-analysis-pagination">
                  <span className="text-sm font-medium text-slate-800 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Previous valid returns page"
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg glass border border-slate-200 text-slate-800 font-medium hover:glass disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      aria-label="Next valid returns page"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg glass border border-slate-200 text-slate-800 font-medium hover:glass disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="return-analysis-table" data-kind="missing">
              <div className="return-analysis-table-heading">
                <h2 className="text-xl font-black text-rose-800 flex items-center gap-2">
                  <AlertCircle className="text-rose-500" /> Missing Return
                  Pieces
                </h2>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400"
                  />
                  <input
                    type="text"
                    placeholder="Search missing pieces..."
                    value={missingTableSearch}
                    onChange={(e) => setMissingTableSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 glass border border-rose-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all w-64"
                  />
                </div>
              </div>
              <div className="return-analysis-table-scroll" data-lenis-prevent>
                <table className="glass-table return-analysis-data-table">
                  <thead className="bg-rose-50/50 border-b border-rose-100">
                    <tr>
                      {missingDynamicColumns.map((col) => (
                        <th
                          key={col}
                          className="px-6 py-4 text-xs font-bold text-rose-700 uppercase tracking-widest whitespace-nowrap"
                        >
                          <ExcelHeaderFilter
                            label={col.replace(/_/g, " ")}
                            columnKey={col}
                            values={Array.from(
                              new Set(missingPieces.map((r) => r[col])),
                            ).filter(Boolean)}
                            selectedValues={missingDynamicFilters[col] || []}
                            onFilterChange={(v) =>
                              setMissingDynamicFilters((p) => ({
                                ...p,
                                [col]: v,
                              }))
                            }
                            sortField={missingSortField}
                            sortAsc={missingSortAsc}
                            onSort={(f, a) => {
                              setMissingSortField(f);
                              setMissingSortAsc(a);
                            }}
                            align={
                              ["qty", "amount"].includes(col) ? "right" : "left"
                            }
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50">
                    {paginatedMissingData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={missingDynamicColumns.length}
                          className="py-12 text-center text-rose-400"
                        >
                          No missing pieces found.
                        </td>
                      </tr>
                    ) : (
                      paginatedMissingData.map((row, i) => (
                        <tr
                          key={i}
                          className="hover:bg-rose-50/30 transition-colors"
                        >
                          {missingDynamicColumns.map((col) => (
                            <td
                              key={col}
                              className={`px-6 py-4 text-sm text-slate-700 ${["qty", "amount"].includes(col) ? "text-right font-bold tabular-nums" : ""}`}
                            >
                              {col === "amount"
                                ? `₹${parseFloat(row[col] || 0).toLocaleString("en-IN")}`
                                : row[col]}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {missingTotalPages > 1 && (
                <div className="return-analysis-pagination">
                  <span className="text-sm font-medium text-rose-600">
                    Page {missingCurrentPage} of {missingTotalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Previous missing pieces page"
                      onClick={handlePrevMissingPage}
                      disabled={missingCurrentPage === 1}
                      className="p-2 rounded-lg glass border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      aria-label="Next missing pieces page"
                      onClick={handleNextMissingPage}
                      disabled={missingCurrentPage === missingTotalPages}
                      className="p-2 rounded-lg glass border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="return-analysis-table" data-kind="damaged">
              <div className="return-analysis-table-heading">
                <h2 className="text-xl font-black text-orange-800 flex items-center gap-2">
                  <AlertCircle className="text-orange-500" /> Damaged Return
                  Pieces
                </h2>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400"
                  />
                  <input
                    type="text"
                    placeholder="Search damaged pieces..."
                    value={damagedTableSearch}
                    onChange={(e) => setDamagedTableSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 glass border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all w-64"
                  />
                </div>
              </div>
              <div className="return-analysis-table-scroll" data-lenis-prevent>
                <table className="glass-table return-analysis-data-table">
                  <thead className="bg-orange-50/50 border-b border-orange-100">
                    <tr>
                      {damagedDynamicColumns.map((col) => (
                        <th
                          key={col}
                          className="px-6 py-4 text-xs font-bold text-orange-700 uppercase tracking-widest whitespace-nowrap"
                        >
                          <ExcelHeaderFilter
                            label={col.replace(/_/g, " ")}
                            columnKey={col}
                            values={Array.from(
                              new Set(damagedPieces.map((r) => r[col])),
                            ).filter(Boolean)}
                            selectedValues={damagedDynamicFilters[col] || []}
                            onFilterChange={(v) =>
                              setDamagedDynamicFilters((p) => ({
                                ...p,
                                [col]: v,
                              }))
                            }
                            sortField={damagedSortField}
                            sortAsc={damagedSortAsc}
                            onSort={(f, a) => {
                              setDamagedSortField(f);
                              setDamagedSortAsc(a);
                            }}
                            align={
                              ["qty", "amount"].includes(col) ? "right" : "left"
                            }
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-50">
                    {paginatedDamagedData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={damagedDynamicColumns.length}
                          className="py-12 text-center text-orange-400"
                        >
                          No damaged pieces found.
                        </td>
                      </tr>
                    ) : (
                      paginatedDamagedData.map((row, i) => (
                        <tr
                          key={i}
                          className="hover:bg-orange-50/30 transition-colors"
                        >
                          {damagedDynamicColumns.map((col) => (
                            <td
                              key={col}
                              className={`px-6 py-4 text-sm text-slate-700 ${["qty", "amount"].includes(col) ? "text-right font-bold tabular-nums" : ""}`}
                            >
                              {col === "amount"
                                ? `₹${parseFloat(row[col] || 0).toLocaleString("en-IN")}`
                                : row[col]}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {damagedTotalPages > 1 && (
                <div className="return-analysis-pagination">
                  <span className="text-sm font-medium text-orange-600">
                    Page {damagedCurrentPage} of {damagedTotalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Previous damaged pieces page"
                      onClick={handlePrevDamagedPage}
                      disabled={damagedCurrentPage === 1}
                      className="p-2 rounded-lg glass border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      aria-label="Next damaged pieces page"
                      onClick={handleNextDamagedPage}
                      disabled={damagedCurrentPage === damagedTotalPages}
                      className="p-2 rounded-lg glass border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
