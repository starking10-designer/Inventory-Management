import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import {
  ChevronLeft,
  ListOrdered,
  Download,
  Trash2,
  Printer,
  X,
  Eye,
  Package,
} from "lucide-react";
import { printDailyReportRows } from "../utils/printReport.js";

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

const PLATFORMS = [
  {
    name: "Flipkart",
    accent: "from-blue-500 to-indigo-600",
    badge: "bg-blue-100 text-blue-800",
  },
  {
    name: "Amazon",
    accent: "from-amber-500 to-orange-600",
    badge: "bg-amber-100 text-amber-900",
  },
  {
    name: "Ajio",
    accent: "from-rose-500 to-pink-600",
    badge: "bg-rose-100 text-rose-800",
  },
  {
    name: "Meesho",
    accent: "from-fuchsia-500 to-purple-600",
    badge: "bg-fuchsia-100 text-fuchsia-800",
  },
  {
    name: "Myntra",
    accent: "from-emerald-500 to-teal-600",
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

function ReportDetailTable({ rows }) {
  const sizeColumns = useMemo(() => buildSizeColumns(rows), [rows]);
  const styleSummaryRows = useMemo(
    () => buildStyleSummary(rows),
    [rows],
  );

  if (styleSummaryRows.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-slate-500">
        No order lines for this report.
      </p>
    );
  }

  return (
    <div className="overflow-auto max-h-[min(70vh,640px)]">
      <table className="w-full text-sm text-left min-w-[760px]">
        <thead className="sticky top-0 bg-slate-100/95 text-slate-700 text-xs uppercase tracking-wide z-10">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Platform</th>
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
        <tbody>
          {styleSummaryRows.map((row, index) => (
            <tr
              key={`${row.date}-${row.platform}-${row.style}-${row.color}-${index}`}
              className="border-t border-slate-100 hover:bg-slate-50/80"
            >
              <td className="px-4 py-2.5 whitespace-nowrap">{row.date}</td>
              <td className="px-4 py-2.5">{row.platform}</td>
              <td
                className="px-4 py-2.5 max-w-[200px] truncate"
                title={row.style}
              >
                {row.style}
              </td>
              <td
                className="px-4 py-2.5 max-w-[160px] truncate"
                title={row.color}
              >
                {row.color}
              </td>
              {sizeColumns.map((size) => (
                <td
                  key={size}
                  className="px-4 py-2.5 text-right tabular-nums"
                >
                  {row.sizes[size] ? row.sizes[size] : "-"}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportDetailModal({ card, reportDate, onClose, onDownload, downloading }) {
  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-6xl rounded-2xl border border-white/80 bg-white shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-detail-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/60">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Daily final order report
            </p>
            <h2
              id="report-detail-title"
              className="text-xl font-bold text-slate-900 mt-1"
            >
              {card.platform}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {reportDate} · {card.lineCount} style-color line
              {card.lineCount === 1 ? "" : "s"} · {card.totalQty} total pieces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                printDailyReportRows(card.rows, {
                  date: reportDate,
                  platform: card.platform,
                  title: `${card.platform} daily order details`,
                })
              }
              disabled={card.rows.length === 0}
              title="Print details"
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition"
            >
              <Printer size={18} />
            </button>
            <button
              type="button"
              onClick={() => onDownload(card.platform)}
              disabled={downloading || card.rows.length === 0}
              title="Download Excel"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              <Download size={16} />
              {downloading ? "Downloading…" : "Excel"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <ReportDetailTable rows={card.rows} />
      </div>
    </div>
  );
}

export default function DailyReportPage() {
  const [dailyReportDate, setDailyReportDate] = useState(todayYmd);
  const [dailyReportRows, setDailyReportRows] = useState([]);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingPlatform, setDownloadingPlatform] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
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
      const { data } = await axios.get(`${API_BASE}/daily-report`, { params });
      setDailyReportRows(data.rows ?? []);
    } catch (error) {
      console.error(error);
      alert("Failed to load daily report");
      setDailyReportRows([]);
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
      const totalQty = summary.reduce(
        (sum, item) => sum + item.total,
        0,
      );

      return {
        ...platformMeta,
        rows,
        lineCount: summary.length,
        totalQty,
        hasData: rows.length > 0,
      };
    }).filter((card) => card.hasData);
  }, [marketplaceRows]);

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
      setSelectedCard(null);
      await loadDailyReport();
    } catch (error) {
      console.error(error);
      const detail = error.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Delete failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-100 text-slate-800">
      <div className="border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft size={18} />
            Home
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ListOrdered className="text-indigo-600" size={22} />
            Daily final order details
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <p className="text-slate-500 text-sm mb-6">
          Browse saved daily final order reports by date. Open a platform card
          to view style, color, and size details, or download as Excel.
        </p>

        <div className="flex flex-wrap gap-3 items-end mb-6">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Date
            <input
              type="date"
              value={dailyReportDate}
              onChange={(event) => setDailyReportDate(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </label>
          <button
            type="button"
            onClick={openDeleteModal}
            disabled={
              actionLoading ||
              dailyReportLoading ||
              reportCards.length === 0
            }
            title="Delete reports for this date"
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            <Trash2 size={16} />
            Delete date
          </button>
        </div>

        {dailyReportLoading ? (
          <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm px-6 py-16 text-center text-slate-500">
            Loading reports…
          </div>
        ) : reportCards.length === 0 ? (
          <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm px-6 py-16 text-center text-slate-500">
            No daily reports for {dailyReportDate}. Generate a final report for
            this date first, or choose another date.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {reportCards.map((card) => (
              <article
                key={card.name}
                className="group rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm overflow-hidden transition hover:border-indigo-300 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCard(card)}
                  className="w-full text-left p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.accent} flex items-center justify-center shrink-0 shadow-sm`}
                    >
                      <Package className="text-white" size={22} />
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${card.badge}`}
                    >
                      {card.lineCount} lines
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 mt-4">
                    {card.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {dailyReportDate}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                        Total pieces
                      </p>
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {card.totalQty}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                        Style colors
                      </p>
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {card.lineCount}
                      </p>
                    </div>
                  </div>

                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 group-hover:text-indigo-900">
                    <Eye size={16} />
                    View details
                  </span>
                </button>

                <div className="border-t border-slate-200/80 px-5 py-3 bg-white/60 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      downloadReportExcel(card.name);
                    }}
                    disabled={
                      actionLoading && downloadingPlatform === card.name
                    }
                    className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {downloadingPlatform === card.name
                      ? "Downloading…"
                      : "Download Excel"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openDeleteModal({
                        platform: card.name,
                        label: card.name,
                      });
                    }}
                    disabled={actionLoading}
                    title={`Delete ${card.name} report`}
                    className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!dailyReportLoading && reportCards.length > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {reportCards.length} platform report
            {reportCards.length === 1 ? "" : "s"} available for {dailyReportDate}
          </p>
        )}
      </div>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => closeDeleteModal()}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/80 bg-white shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-report-title"
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-red-50">
              <div className="flex items-center gap-2 text-red-700">
                <Trash2 size={20} />
                <h2 id="delete-report-title" className="text-lg font-bold">
                  Delete daily report
                </h2>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                This will delete {deleteTarget.label} report
                {deleteTarget.platform === "All" ? "s" : ""} for{" "}
                {dailyReportDate}.
              </p>
            </div>

            <form
              className="px-5 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                deleteReport();
              }}
            >
              <label className="block text-sm font-semibold text-slate-700">
                Password
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoFocus
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </label>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => closeDeleteModal()}
                  disabled={actionLoading}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {actionLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ReportDetailModal
        card={selectedCard}
        reportDate={dailyReportDate}
        onClose={() => setSelectedCard(null)}
        onDownload={downloadReportExcel}
        downloading={
          actionLoading && downloadingPlatform === selectedCard?.name
        }
      />
    </div>
  );
}
