import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import { ChevronLeft, ListOrdered, Download, Trash2, Printer } from "lucide-react";
import { printDailyReportRows } from "../utils/printReport.js";

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];

export default function DailyReportPage() {
  const [dailyReportDate, setDailyReportDate] = useState(todayYmd);
  const [dailyReportPlatform, setDailyReportPlatform] = useState("All");
  const [dailyReportRows, setDailyReportRows] = useState([]);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadDailyReport = async () => {
    setDailyReportLoading(true);
    try {
      const params = {};
      if (dailyReportDate) params.report_date = dailyReportDate;
      if (dailyReportPlatform) params.platform = dailyReportPlatform;
      const { data } = await axios.get(`${API_BASE}/daily-report`, { params });
      setDailyReportRows(data.rows ?? []);
    } catch (e) {
      console.error(e);
      alert("Failed to load daily report");
      setDailyReportRows([]);
    } finally {
      setDailyReportLoading(false);
    }
  };

  useEffect(() => {
    loadDailyReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marketplaceRows = useMemo(
    () => dailyReportRows.filter((row) => row.platform !== "All"),
    [dailyReportRows],
  );

  const sizeColumns = useMemo(() => {
    const sizes = new Set();

    for (const row of marketplaceRows) {
      const size = String(row.size || "").toUpperCase().trim();
      if (size) sizes.add(size);
    }

    return [
      ...SIZE_ORDER.filter((size) => sizes.has(size)),
      ...[...sizes].filter((size) => !SIZE_ORDER.includes(size)).sort(),
    ];
  }, [marketplaceRows]);

  const styleSummaryRows = useMemo(() => {
    const grouped = new Map();

    for (const row of marketplaceRows) {
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

    return [...grouped.values()].sort((a, b) =>
      a.platform.localeCompare(b.platform) ||
      a.style.localeCompare(b.style) ||
      a.color.localeCompare(b.color),
    );
  }, [marketplaceRows]);

  const downloadReport = async () => {
    setActionLoading(true);
    try {
      const params = {};
      if (dailyReportDate) params.report_date = dailyReportDate;
      if (dailyReportPlatform) params.platform = dailyReportPlatform;

      const response = await axios.get(`${API_BASE}/daily-report/export`, {
        params,
        responseType: "blob",
      });

      const plat = dailyReportPlatform || "all";
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `daily_report_${dailyReportDate}_${plat}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error(e);
      alert("Download failed");
    } finally {
      setActionLoading(false);
    }
  };

  const printReport = () => {
    printDailyReportRows(marketplaceRows, {
      date: dailyReportDate,
      platform: dailyReportPlatform,
      title: "Daily Final Order Details",
    });
  };

  const deleteReport = async () => {
    if (!dailyReportDate) {
      alert("Select a date to delete");
      return;
    }

    const platLabel = dailyReportPlatform === "All"
      ? "all marketplace platforms for this date"
      : dailyReportPlatform;
    const ok = window.confirm(
      `Delete daily report for ${dailyReportDate} (${platLabel})? This cannot be undone.`,
    );
    if (!ok) return;

    setActionLoading(true);
    try {
      const params = { report_date: dailyReportDate };
      if (dailyReportPlatform) params.platform = dailyReportPlatform;

      const { data } = await axios.delete(`${API_BASE}/daily-report`, {
        params,
      });
      alert(
        `Deleted ${data.deleted_rows ?? 0} row(s) for ${data.report_date}`,
      );
      await loadDailyReport();
    } catch (e) {
      console.error(e);
      const d = e.response?.data?.detail;
      alert(typeof d === "string" ? d : "Delete failed");
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
          detailed daily report of final order quantities by style, color, and size for each marketplace platform.
        </p>

        <div className="flex flex-wrap gap-3 items-end mb-6">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Date
            <input
              type="date"
              value={dailyReportDate}
              onChange={(e) => setDailyReportDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Platform
            <select
              value={dailyReportPlatform}
              onChange={(e) => setDailyReportPlatform(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 min-w-[180px]"
            >
              <option value="All">All platforms</option>
              <option value="Flipkart">Flipkart</option>
              <option value="Amazon">Amazon</option>
              <option value="Ajio">Ajio</option>
              <option value="Meesho">Meesho</option>
              <option value="Myntra">Myntra</option>
            </select>
          </label>
          <button
            type="button"
            onClick={loadDailyReport}
            disabled={dailyReportLoading}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {dailyReportLoading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={downloadReport}
            disabled={actionLoading || styleSummaryRows.length === 0}
            title="Download CSV"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition"
          >
            <Download size={20} />
          </button>
          <button
            type="button"
            onClick={printReport}
            disabled={marketplaceRows.length === 0}
            title="Print table"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition"
          >
            <Printer size={20} />
          </button>
          <button
            type="button"
            onClick={deleteReport}
            disabled={actionLoading || !dailyReportDate}
            title="Delete report for selected date/platform"
            className="p-2.5 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition"
          >
            <Trash2 size={20} />
          </button>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="max-h-[calc(100vh-16rem)] overflow-auto">
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
                {styleSummaryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5 + sizeColumns.length}
                      className="px-4 py-16 text-center text-slate-500"
                    >
                      No rows for this filter. Generate a report for this date
                      first, or change filters and refresh.
                    </td>
                  </tr>
                ) : (
                  styleSummaryRows.map((r, i) => (
                    <tr
                      key={`${r.date}-${r.platform}-${r.style}-${r.color}-${i}`}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-2.5">{r.platform}</td>
                      <td
                        className="px-4 py-2.5 max-w-[200px] truncate"
                        title={r.style}
                      >
                        {r.style}
                      </td>
                      <td
                        className="px-4 py-2.5 max-w-[160px] truncate"
                        title={r.color}
                      >
                        {r.color}
                      </td>
                      {sizeColumns.map((size) => (
                        <td
                          key={size}
                          className="px-4 py-2.5 text-right tabular-nums"
                        >
                          {r.sizes[size] ? r.sizes[size] : "-"}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {r.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </div>
          <div className="border-t border-slate-200/80 px-4 py-2 text-xs text-slate-500 bg-white/60">
            {styleSummaryRows.length} style summary row
            {styleSummaryRows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </div>
  );
}
