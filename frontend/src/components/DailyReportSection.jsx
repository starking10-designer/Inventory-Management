import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import {
  ListOrdered,
  Download,
  Trash2,
  Printer,
  X,
  Package,
  Calendar,
  Layers,
  Sparkles,
  Filter,
} from "lucide-react";
import { printDailyReportRows } from "../utils/printReport.js";

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatReportDate(value) {
  if (!value) return "";

  const [year, month, day] = String(value).split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replace(/ /g, "-");
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

const PLATFORMS = [
  {
    name: "Flipkart",
    accent: "from-blue-600 to-indigo-700",
    badge: "bg-blue-100 text-blue-800",
  },
  {
    name: "Amazon",
    accent: "from-slate-800 to-slate-900",
    badge: "bg-amber-100 text-amber-900",
  },
  {
    name: "Ajio",
    accent: "from-slate-700 to-slate-800",
    badge: "bg-rose-100 text-rose-800",
  },
  {
    name: "Meesho",
    accent: "from-fuchsia-600 to-purple-700",
    badge: "bg-fuchsia-100 text-fuchsia-800",
  },
  {
    name: "Myntra",
    accent: "from-pink-600 to-rose-600",
    badge: "bg-emerald-100 text-emerald-800",
  },
];

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
    const platform = row.platform || "";
    const style = row.style || "";
    const color = row.color || "";
    const size = String(row.size || "").toUpperCase().trim();
    const key = `${platform}\u0000${style}\u0000${color}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: row.date,
        platform,
        style,
        color,
        sizes: {},
        total: 0,
      });
    }

    const item = grouped.get(key);
    const qty = Number(row.total_order_qty || 0);
    item.sizes[size] = (item.sizes[size] || 0) + qty;
    item.total += qty;
  }

  return [...grouped.values()].sort(
    (a, b) =>
      a.platform.localeCompare(b.platform) ||
      a.style.localeCompare(b.style) ||
      a.color.localeCompare(b.color),
  );
}

function ColumnFilter({ title, columnKey, options, activeFilters, onFilterChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const isActive = activeFilters.size > 0;

  const handleToggle = (option) => {
    const next = new Set(activeFilters);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onFilterChange(columnKey, next);
  };

  const handleClear = () => {
    onFilterChange(columnKey, new Set());
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{title}</span>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded transition-colors ${isActive ? 'text-blue-600 bg-blue-100 hover:bg-blue-200' : 'text-slate-800 font-medium hover:glass'}`}
        title={`Filter ${title}`}
      >
        <Filter size={13} strokeWidth={isActive ? 3 : 2} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="order-preview-filter absolute top-full left-0 mt-2 w-56 max-h-64 overflow-y-auto glass border border-slate-200 shadow-xl rounded-xl z-50 p-2 flex flex-col gap-1 font-normal normal-case tracking-normal">
            <div className="flex justify-between items-center px-2 py-1 mb-1 border-b border-slate-100 sticky top-0 glass">
              <span className="text-[10px] font-bold text-slate-800 font-medium uppercase tracking-wider">Filter by {title}</span>
              {isActive && (
                <button onClick={handleClear} className="text-[10px] font-bold text-rose-600 hover:underline">
                  Clear
                </button>
              )}
            </div>
            {options.map(opt => (
              <label key={opt} className="flex items-start gap-2.5 px-2 py-1.5 hover:glass rounded cursor-pointer text-xs font-medium text-slate-700">
                <input 
                  type="checkbox"
                  checked={activeFilters.has(opt)}
                  onChange={() => handleToggle(opt)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-none"
                />
                <span className="break-all">{opt}</span>
              </label>
            ))}
            {options.length === 0 && (
              <span className="px-2 py-3 text-xs text-slate-800 font-medium text-center">No options</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ReportDetailTable({ rows, hidePlatformColumn }) {
  const [filters, setFilters] = useState({
    platform: new Set(),
    style: new Set(),
    color: new Set()
  });
  
  const sizeColumns = useMemo(() => buildSizeColumns(rows), [rows]);
  const styleSummaryRows = useMemo(
    () => buildStyleSummary(rows),
    [rows],
  );

  const uniqueValues = useMemo(() => {
    return {
      platform: [...new Set(styleSummaryRows.map(r => r.platform || ""))].sort(),
      style: [...new Set(styleSummaryRows.map(r => r.style || ""))].sort(),
      color: [...new Set(styleSummaryRows.map(r => r.color || ""))].sort()
    };
  }, [styleSummaryRows]);

  const handleFilterChange = (columnKey, selectedSet) => {
    setFilters(prev => ({ ...prev, [columnKey]: selectedSet }));
  };

  const filteredRows = useMemo(() => {
    return styleSummaryRows.filter(row => {
      const matchPlatform = filters.platform.size === 0 || filters.platform.has(row.platform || "");
      const matchStyle = filters.style.size === 0 || filters.style.has(row.style || "");
      const matchColor = filters.color.size === 0 || filters.color.has(row.color || "");
      return matchPlatform && matchStyle && matchColor;
    });
  }, [styleSummaryRows, filters]);

  if (styleSummaryRows.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-slate-800 font-medium">
        No order lines for this report.
      </p>
    );
  }

  // Build rows list with style-subtotal rows inserted
  const rowsWithSubtotals = (() => {
    const result = [];
    let i = 0;
    
    const grandTotalSizes = {};
    let grandTotal = 0;

    while (i < filteredRows.length) {
      const currentStyle = filteredRows[i].style;
      const groupStart = i;
      const groupRows = [];

      while (i < filteredRows.length && filteredRows[i].style === currentStyle) {
        groupRows.push({ ...filteredRows[i], _idx: i });
        i++;
      }

      // Push all colour rows for this style
      for (const row of groupRows) {
        result.push({ type: "row", row });
      }

      const subtotalSizes = {};
      let subtotalTotal = 0;
      for (const r of groupRows) {
        for (const sz of sizeColumns) {
          subtotalSizes[sz] = (subtotalSizes[sz] || 0) + (r.sizes[sz] || 0);
          grandTotalSizes[sz] = (grandTotalSizes[sz] || 0) + (r.sizes[sz] || 0);
        }
        subtotalTotal += r.total;
        grandTotal += r.total;
      }

      // Push subtotal row if more than 1 colour in this style
      if (groupRows.length > 1) {
        result.push({
          type: "subtotal",
          style: currentStyle,
          colourCount: groupRows.length,
          subtotalSizes,
          subtotalTotal,
          key: `subtotal-${currentStyle}-${groupStart}`,
        });
      }
    }
    
    if (filteredRows.length > 0) {
      result.push({
        type: "grand_total",
        grandTotalSizes,
        grandTotal,
        key: "grand-total",
      });
    }

    return result;
  })();

  return (
    <div data-lenis-prevent tabIndex={0} aria-label="Scrollable order details" className="report-table-scroll overflow-auto max-h-[min(70vh,640px)]">
      <table className="glass-table report-detail-table">
        <colgroup>
          {!hidePlatformColumn && <col />}
          <col style={{ width: "30%" }} />
          <col style={{ width: "28%" }} />
          {sizeColumns.map(size => <col key={size} />)}
          <col style={{ width: "112px" }} />
        </colgroup>
        <thead className="sticky top-0 glass/95 backdrop-blur-md text-slate-700 text-xs font-bold uppercase tracking-wider z-10 border-b border-slate-200 shadow-sm">
          <tr>
            {!hidePlatformColumn && (
              <th>
                <ColumnFilter 
                  title="Platform" 
                  columnKey="platform" 
                  options={uniqueValues.platform} 
                  activeFilters={filters.platform} 
                  onFilterChange={handleFilterChange} 
                />
              </th>
            )}
            <th>
              <ColumnFilter 
                title="Style" 
                columnKey="style" 
                options={uniqueValues.style} 
                activeFilters={filters.style} 
                onFilterChange={handleFilterChange} 
              />
            </th>
            <th>
              <ColumnFilter 
                title="Color" 
                columnKey="color" 
                options={uniqueValues.color} 
                activeFilters={filters.color} 
                onFilterChange={handleFilterChange} 
              />
            </th>
            {sizeColumns.map((size) => (
              <th key={size} className="px-4 py-3.5 text-right align-middle">
                {size}
              </th>
            ))}
            <th>
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={100} className="px-4 py-8 text-center text-slate-800 font-medium text-sm">
                No matching rows found.
              </td>
            </tr>
          ) : rowsWithSubtotals.map((item) => {
            if (item.type === "grand_total") {
              return (
                <tr
                  key={item.key}
                  className="report-grand-total border-t border-slate-800 sticky bottom-0 z-10"
                >
                  {!hidePlatformColumn && <td />}
                  <td colSpan={2} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right text-slate-200">
                    Grand Total
                  </td>
                  {sizeColumns.map((size) => (
                    <td
                      key={size}
                      className="px-4 py-3 text-right text-sm font-black tabular-nums"
                    >
                      {item.grandTotalSizes[size] ? item.grandTotalSizes[size] : "-"}
                    </td>
                  ))}
                  <td>
                    <span className="report-total-value">{item.grandTotal}</span>
                  </td>
                </tr>
              );
            }

            if (item.type === "subtotal") {
              return (
                <tr
                  key={item.key}
                  className="report-subtotal border-t border-slate-200"
                >
                  {!hidePlatformColumn && <td />}
                  <td>
                    {item.style} — Subtotal
                  </td>
                  <td>
                    {item.colourCount} colours
                  </td>
                  {sizeColumns.map((size) => (
                    <td
                      key={size}
                      className="px-4 py-2 text-right text-[11px] font-black text-slate-800 tabular-nums"
                    >
                      {item.subtotalSizes[size] ? item.subtotalSizes[size] : "-"}
                    </td>
                  ))}
                  <td>
                    <span className="report-total-value">{item.subtotalTotal}</span>
                  </td>
                </tr>
              );
            }

            const row = item.row;
            return (
              <tr
                key={`${row.date}-${row.platform}-${row.style}-${row.color}-${row._idx}`}
                className="report-data-row hover:glass/80 transition"
              >
                {!hidePlatformColumn && (
                  <td>{row.platform}</td>
                )}
                <td
                  title={row.style}
                >
                  {row.style}
                </td>
                <td
                  title={row.color}
                >
                  <span className="report-color-label">{row.color}</span>
                </td>
                {sizeColumns.map((size) => (
                  <td
                    key={size}
                    className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium"
                  >
                    {row.sizes[size] ? row.sizes[size] : <span className="report-empty-value">—</span>}
                  </td>
                ))}
                <td>
                  <span className="report-total-value">{row.total}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function MultiQtyOrdersModal({ rows, reportDate, onClose }) {
  if (!rows) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 glass/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-5xl rounded-3xl border border-slate-200 glass shadow-xl overflow-hidden rounded-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-qty-title"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200/80 glass">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Daily final order report
            </p>
            <h2 id="multi-qty-title" className="text-xl font-black text-slate-900 mt-1">
              Orders with quantity greater than 1
            </h2>
            <p className="text-xs text-slate-800 font-medium mt-1">
              {reportDate} · {rows.length} order line{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl glass border border-slate-200 text-slate-800 font-medium hover:glass transition shadow-xs"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto max-h-[min(70vh,640px)]">
          <table className="glass-table">
            <thead className="sticky top-0 glass/95 backdrop-blur-md text-slate-700 text-xs font-bold uppercase tracking-wider z-10 border-b border-slate-200">
              <tr>
                <th>Platform</th>
                <th>Order ID</th>
                <th>SKU</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr
                  key={`${row.platform}-${row.order_id}-${row.sku}-${index}`}
                  className="hover:glass/80 transition"
                >
                  <td>{row.platform || "-"}</td>
                  <td>{row.order_id || "-"}</td>
                  <td>{row.sku || "-"}</td>
                  <td>{row.qty || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ZoneSummaryPanel({ show, summary, reportDate, onClose, onViewBatch, onDeleteBatch }) {
  const groupedItems = summary?.items ? summary.items.reduce((acc, item) => {
    const platform = item.platform || "Flipkart";
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(item);
    return acc;
  }, {}) : {};

  if (!show) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 glass/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-5xl rounded-xl border border-slate-200/60 glass shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 glass/50">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100/60 p-2.5 rounded-xl text-blue-600">
              <Package size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 id="flipkart-zone-title" className="text-lg font-black text-slate-900 leading-tight tracking-tight">
                Zone Summary
              </h2>
              <p className="text-xs font-bold text-slate-800 font-medium mt-0.5">
                {formatReportDate(reportDate)} &bull; {summary.total || 0} Label{summary.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-800 font-medium hover:glass hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
          {Object.entries(groupedItems).map(([platform, items]) => {
            const platformTotal = items.reduce((sum, it) => sum + it.label_count, 0);
            return (
              <div key={platform} className="flex flex-col gap-3">
                <div className="flex items-center gap-3 px-1">
                  <h3 className="font-black text-slate-800 text-sm tracking-tight">{platform}</h3>
                  <span className="glass text-slate-800 font-medium px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums">
                    {platformTotal}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {items.map((item) => (
                    <div
                      key={item.zone}
                      className="group glass px-3 py-2 rounded-[14px] border border-slate-200 shadow-sm flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all cursor-default"
                    >
                      <span className="text-[11px] text-slate-800 font-medium font-bold uppercase tracking-wide">
                        {item.zone}
                      </span>
                      <span className="text-base font-black text-[#0F2137] tabular-nums">
                        {item.label_count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {(summary.batches ?? []).length > 0 && (
          <div className="border-t border-slate-100 glass/50 px-6 py-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 font-medium mb-3.5 px-1">
              Processed Batches
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {summary.batches.map((batch, index) => (
                <div
                  key={batch.id}
                  className="group flex flex-col glass-card shadow-sm hover:border-blue-200 hover:shadow-md transition-all overflow-hidden"
                >
                  <div className="px-3.5 py-3 flex justify-between items-center border-b border-slate-50">
                    <span className="text-slate-800 font-medium font-bold text-[10px] uppercase tracking-wider truncate pr-2">
                      {batch.platform || "Flipkart"} #{index + 1}
                    </span>
                    <span className="font-black text-[#0F2137] text-sm tabular-nums shrink-0">
                      {batch.label_count}
                    </span>
                  </div>
                  <div className="flex glass/50 divide-x divide-slate-100">
                    <button
                      type="button"
                      onClick={() => onDeleteBatch && onDeleteBatch(batch)}
                      className="flex-1 py-2 text-slate-800 font-medium hover:text-rose-600 hover:bg-rose-50 transition-colors flex justify-center"
                      title="Delete Batch"
                    >
                      <Trash2 size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function FlipkartZoneBatchModal({ batch, onClose }) {
  if (!batch) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 glass/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-slate-200 glass shadow-xl overflow-hidden rounded-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flipkart-zone-batch-title"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200/80 glass">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-800 font-medium">
              Processed label batch
            </p>
            <h2 id="flipkart-zone-batch-title" className="text-xl font-black text-slate-900 mt-1">
              Zone report
            </h2>
            <p className="text-xs text-slate-800 font-medium mt-1">
              {batch.date} - {batch.label_count || batch.total || 0} labels
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl glass border border-slate-200 text-slate-800 font-medium hover:glass transition shadow-xs"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto max-h-[min(70vh,520px)]">
          <table className="glass-table">
            <thead className="sticky top-0 glass/95 backdrop-blur-md text-slate-700 text-xs font-bold uppercase tracking-wider z-10 border-b border-slate-200">
              <tr>
                <th>Zone</th>
                <th>Labels</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(batch.items ?? []).map((item) => (
                <tr
                  key={item.zone}
                  className="hover:glass/80 transition"
                >
                  <td>{item.zone}</td>
                  <td>
                    {item.label_count}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total Labels</td>
                <td>
                  {batch.total || batch.label_count || 0}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DailyReportSection() {
  const [dailyReportDate, setDailyReportDate] = useState(todayYmd);
  const [dailyReportRows, setDailyReportRows] = useState([]);
  const [salesReportSummary, setSalesReportSummary] = useState(null);
  const [multiQtyOrders, setMultiQtyOrders] = useState([]);
  const [flipkartZoneSummary, setFlipkartZoneSummary] = useState(null);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingPlatform, setDownloadingPlatform] = useState(null);
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState("All");
  const [selectedZoneBatch, setSelectedZoneBatch] = useState(null);
  const [loadingZoneBatch, setLoadingZoneBatch] = useState(false);
  const [showMultiQtyOrders, setShowMultiQtyOrders] = useState(false);
  const [showFlipkartZoneSummary, setShowFlipkartZoneSummary] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState({
    platform: "All",
    label: "all platforms",
  });

  const loadDailyReport = async () => {
    setDailyReportLoading(true);
    try {
      const params = { platform: "All" };
      if (dailyReportDate) params.report_date = dailyReportDate;
      const [
        reportResponse,
        multiQtyResponse,
        salesResponse,
        flipkartZoneResponse,
      ] = await Promise.all([
        axios.get(`${API_BASE}/daily-report`, { params }),
        axios.get(`${API_BASE}/daily-report/multi-qty-orders`, { params }),
        axios.get(`${API_BASE}/sales-reports`),
        axios.get(`${API_BASE}/daily-report/flipkart-zone-summary`, {
          params: { report_date: dailyReportDate },
        }),
      ]);
      setDailyReportRows(reportResponse.data.rows ?? []);
      setMultiQtyOrders(multiQtyResponse.data.items ?? []);
      setFlipkartZoneSummary(flipkartZoneResponse.data ?? null);
      setSalesReportSummary(
        (salesResponse.data.reports ?? []).find(
          (report) => report.report_date === dailyReportDate,
        ) ?? null,
      );
    } catch (error) {
      console.error(error);
      setDailyReportRows([]);
      setMultiQtyOrders([]);
      setFlipkartZoneSummary(null);
      setSalesReportSummary(null);
    } finally {
      setDailyReportLoading(false);
    }
  };

  useEffect(() => {
    loadDailyReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyReportDate]);

  const marketplaceRows = useMemo(
    () => dailyReportRows.filter((row) => row.platform !== "All"),
    [dailyReportRows],
  );

  const reportCards = useMemo(() => {
    const byPlatform = new Map();

    for (const row of marketplaceRows) {
      const platform = row.platform || "Unknown";
      if (!byPlatform.has(platform)) {
        byPlatform.set(platform, []);
      }
      byPlatform.get(platform).push(row);
    }

    return PLATFORMS.map((platformMeta) => {
      const rows = byPlatform.get(platformMeta.name) || [];
      const summary = buildStyleSummary(rows);
      const platformSummary = (salesReportSummary?.platforms ?? []).find(
        (item) => item.platform === platformMeta.name,
      );
      const totalQty = summary.reduce(
        (sum, item) => sum + item.total,
        0,
      );

      return {
        ...platformMeta,
        rows,
        lineCount: summary.length,
        orderCount: platformSummary?.total_orders ?? 0,
        totalQty,
        hasData: rows.length > 0,
      };
    }).filter((card) => card.hasData);
  }, [marketplaceRows, salesReportSummary]);

  const displayedRows = useMemo(() => {
    if (selectedPlatformFilter === "All") {
      return marketplaceRows;
    }
    return marketplaceRows.filter(row => row.platform === selectedPlatformFilter);
  }, [selectedPlatformFilter, marketplaceRows]);

  const multiQtyTotal = useMemo(
    () => multiQtyOrders.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    [multiQtyOrders],
  );

  const hasFlipkartZoneSummary = (flipkartZoneSummary?.items ?? []).length > 0;

  const openZoneBatch = async (batch) => {
    if (!batch?.id) return;

    setLoadingZoneBatch(true);
    try {
      const { data } = await axios.get(
        `${API_BASE}/daily-report/flipkart-zone-summary/batches/${batch.id}`,
      );
      setSelectedZoneBatch(data);
    } catch (error) {
      console.error(error);
      alert("Failed to load Flipkart zone batch");
    } finally {
      setLoadingZoneBatch(false);
    }
  };

  const downloadReportExcel = async (platform) => {
    setDownloadingPlatform(platform);
    setActionLoading(true);
    try {
      const params = { platform };
      if (dailyReportDate) params.report_date = dailyReportDate;

      const response = await axios.get(
        `${API_BASE}/daily-report/export-excel`,
        {
          params,
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
        `daily_report_${dailyReportDate}_${platform.toLowerCase()}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Download failed");
    } finally {
      setDownloadingPlatform(null);
      setActionLoading(false);
    }
  };

  const openDeleteModal = (target = null) => {
    if (!dailyReportDate) {
      alert("Select a date to delete");
      return;
    }

    setDeleteTarget(
      target || {
        platform: "All",
        label: "all platforms",
      },
    );
    setDeletePassword("");
    setShowDeleteModal(true);
  };

  const closeDeleteModal = (force = false) => {
    if (actionLoading && !force) return;

    setShowDeleteModal(false);
    setDeletePassword("");
  };

  const deleteReport = async () => {
    if (deletePassword !== "Admin") {
      alert("Invalid password");
      return;
    }

    setActionLoading(true);
    try {
      const { data } = await axios.delete(`${API_BASE}/daily-report`, {
        params: {
          report_date: dailyReportDate,
          platform: deleteTarget.platform,
          password: deletePassword,
        },
      });
      alert(
        (
          `Deleted ${data.deleted_rows ?? 0} row(s) for `
          + `${deleteTarget.label} on ${data.report_date}. `
          + `Restored ${data.restored_inventory_qty ?? 0} inventory pieces.`
        ),
      );
      closeDeleteModal(true);
      await loadDailyReport();
    } catch (error) {
      console.error(error);
      const detail = error.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Delete failed");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteZoneBatch = async (batch) => {
    if (!window.confirm(`Delete ${batch.platform || "Flipkart"} Batch with ${batch.label_count} labels?`)) {
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.delete(`${API_BASE}/daily-report/flipkart-zone-summary/batches/${batch.id}`);
      await loadDailyReport();
      if ((flipkartZoneSummary?.batches?.length || 0) <= 1) {
          setShowFlipkartZoneSummary(false);
      }
    } catch (error) {
      console.error(error);
      alert("Delete failed: " + (error.response?.data?.detail || error.message));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="daily-final-orders">
      {/* Header & Date Controls */}
      <div className="daily-final-orders-header">
        <div className="daily-final-orders-heading">
          <span className="daily-final-orders-icon"><ListOrdered size={21} aria-hidden="true" /></span>
          <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Order breakdown
          </h2>
          <p className="mt-1 text-xs text-slate-800 font-medium">
            Style, color, and size quantities for the selected date.
          </p>
          </div>
        </div>

        <div className="daily-final-orders-date-controls">
          <label className="daily-final-orders-date">
            <Calendar size={15} className="text-[#0F2137]" />
            <span>Date:</span>
            <input
              type="date"
              value={dailyReportDate}
              onChange={(event) => setDailyReportDate(event.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => openDeleteModal()}
            disabled={
              actionLoading ||
              dailyReportLoading ||
              reportCards.length === 0
            }
            title="Delete reports for this date"
            className="daily-final-orders-delete-date inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40 transition shadow-xs"
          >
            <Trash2 size={14} />
            Delete Date
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {dailyReportLoading ? (
        <div className="rounded-xl border border-slate-200 glass px-6 py-14 text-center text-slate-800 font-medium text-sm font-medium">
          Loading report dispatches for {dailyReportDate}...
        </div>
      ) : reportCards.length === 0 && multiQtyOrders.length === 0 && !hasFlipkartZoneSummary ? (
        <div className="rounded-xl border border-dashed border-slate-300 glass px-6 py-14 text-center text-slate-800 font-medium">
          <Package className="mx-auto h-12 w-12 text-slate-800 font-medium mb-2" />
          <p className="text-sm font-bold text-slate-700">No daily reports for {dailyReportDate}</p>
          <p className="text-xs text-slate-800 font-medium mt-1">Upload daily order files above to generate reports for this date.</p>
        </div>
      ) : (
        <div className="daily-final-orders-body">
          {/* Main Table View */}
          <div className="order-preview daily-final-orders-matrix">
            {/* Toolbar Tabs */}
            <div className="daily-final-orders-toolbar">
              <div className="daily-final-orders-platforms" role="group" aria-label="Filter orders by platform">
                {["All", ...reportCards.map(c => c.name)].map(platform => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setSelectedPlatformFilter(platform)}
                    aria-pressed={selectedPlatformFilter === platform}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 ${
                      selectedPlatformFilter === platform
                        ? "bg-[#0F2137] text-white"
                        : "glass text-slate-800 font-medium border border-slate-200 hover:glass"
                    }`}
                  >
                    <span>{platform === "All" ? "All Platforms" : platform}</span>
                  </button>
                ))}
              </div>

              <div className="daily-final-orders-actions">
                <button
                  type="button"
                  onClick={() => printDailyReportRows(displayedRows, {
                    date: dailyReportDate,
                    platform: selectedPlatformFilter,
                    title: `${selectedPlatformFilter} daily order details`,
                  })}
                  disabled={displayedRows.length === 0}
                  title="Print details"
                  className="p-2 rounded-xl glass border border-slate-200 text-[#0F2137] hover:glass disabled:opacity-40 transition shadow-xs"
                >
                  <Printer size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => downloadReportExcel(selectedPlatformFilter)}
                  disabled={actionLoading || displayedRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] text-white text-xs font-bold hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50 transition shadow-xs"
                >
                  <Download size={14} />
                  {downloadingPlatform === selectedPlatformFilter && actionLoading ? "Downloading…" : "Excel"}
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteModal({
                    platform: selectedPlatformFilter,
                    label: selectedPlatformFilter === "All" ? "all platforms" : selectedPlatformFilter,
                  })}
                  disabled={actionLoading}
                  title={`Delete ${selectedPlatformFilter} report`}
                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 glass p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40 shadow-xs"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Table */}
            <ReportDetailTable 
              rows={displayedRows} 
              hidePlatformColumn={true} 
            />
          </div>

          {/* Small Cards Grid for Multi Qty & Zone Summary */}
          {(multiQtyOrders.length > 0 || hasFlipkartZoneSummary) && (
            <div className="daily-final-orders-extras grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {multiQtyOrders.length > 0 && (
                <article className="group rounded-lg border border-slate-200 glass shadow-sm overflow-hidden transition hover:glass">
                  <button
                    type="button"
                    onClick={() => setShowMultiQtyOrders(true)}
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md glass flex items-center justify-center shrink-0 text-slate-700">
                        <ListOrdered size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Multiple Quantity
                        </h3>
                        <p className="text-xs text-slate-800 font-medium font-medium mt-0.5">
                          {multiQtyOrders.length} orders · {multiQtyTotal} pcs
                        </p>
                      </div>
                    </div>
                  </button>
                </article>
              )}

              {hasFlipkartZoneSummary && (
                <article className="group rounded-lg border border-slate-200 glass shadow-sm overflow-hidden transition hover:glass">
                  <button
                    type="button"
                    onClick={() => setShowFlipkartZoneSummary(true)}
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md glass flex items-center justify-center shrink-0 text-slate-700">
                        <Package size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Zone Summary
                        </h3>
                        <p className="text-xs text-slate-800 font-medium font-medium mt-0.5">
                          {flipkartZoneSummary.items.length} zones · {flipkartZoneSummary.total || 0} labels
                        </p>
                      </div>
                    </div>
                  </button>
                </article>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 glass/50"
          onClick={() => closeDeleteModal()}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 glass shadow-xl overflow-hidden rounded-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-report-title"
          >
            <div className="px-6 py-5 border-b border-slate-200/80 bg-rose-50/70">
              <div className="flex items-center gap-2 text-rose-700 font-bold">
                <Trash2 size={20} />
                <h2 id="delete-report-title" className="text-base font-black">
                  Delete daily report
                </h2>
              </div>
              <p className="mt-2 text-xs text-slate-800 font-medium">
                This will delete {deleteTarget.label} report
                {deleteTarget.platform === "All" ? "s" : ""} for{" "}
                <span className="font-bold text-slate-900">{dailyReportDate}</span>.
              </p>
            </div>

            <form
              className="px-6 py-5"
              onSubmit={(event) => {
                event.preventDefault();
                deleteReport();
              }}
            >
              <label className="block text-xs font-bold text-slate-700">
                Admin Password
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  placeholder="Enter admin password"
                  autoFocus
                  className="mt-2 w-full rounded-xl border border-slate-200 glass px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F2137] shadow-xs"
                />
              </label>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => closeDeleteModal()}
                  disabled={actionLoading}
                  className="rounded-xl border border-slate-200 glass px-4 py-2 text-xs font-bold text-slate-800 font-medium hover:glass disabled:opacity-50 shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 shadow-xs"
                >
                  <Trash2 size={14} />
                  {actionLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zone Summary Inline Panel */}
      <ZoneSummaryPanel
        show={showFlipkartZoneSummary}
        summary={flipkartZoneSummary}
        reportDate={dailyReportDate}
        onClose={() => setShowFlipkartZoneSummary(false)}
        onViewBatch={openZoneBatch}
        onDeleteBatch={deleteZoneBatch}
      />

      <FlipkartZoneBatchModal
        batch={selectedZoneBatch}
        onClose={() => setSelectedZoneBatch(null)}
      />

      <MultiQtyOrdersModal
        rows={showMultiQtyOrders ? multiQtyOrders : null}
        reportDate={dailyReportDate}
        onClose={() => setShowMultiQtyOrders(false)}
      />
    </div>
  );
}
