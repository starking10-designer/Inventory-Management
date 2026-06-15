import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import {
  ChevronLeft,
  TrendingUp,
  Download,
  X,
  Eye,
  IndianRupee,
} from "lucide-react";

const PLATFORM_ACCENTS = {
  Flipkart: "from-blue-500 to-indigo-600",
  Amazon: "from-amber-500 to-orange-600",
  Ajio: "from-rose-500 to-pink-600",
  Meesho: "from-fuchsia-500 to-purple-600",
  Myntra: "from-emerald-500 to-teal-600",
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function SalesDetailModal({ report, onClose, onDownload, downloading }) {
  if (!report) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-white/80 bg-white shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-detail-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-indigo-50/60">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Daily sales report
            </p>
            <h2
              id="sales-detail-title"
              className="text-xl font-bold text-slate-900 mt-1"
            >
              {report.report_date}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {report.platform_count} platform
              {report.platform_count === 1 ? "" : "s"} ·{" "}
              {report.total_piece_qty} pieces ·{" "}
              {formatMoney(report.total_invoice_amount)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload(report.report_date, "All")}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition"
            >
              <Download size={16} />
              {downloading ? "Downloading…" : "Download Excel"}
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

        <div className="overflow-auto max-h-[min(70vh,520px)]">
          <table className="w-full text-sm text-left min-w-[560px]">
            <thead className="sticky top-0 bg-slate-100/95 text-slate-700 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Pieces</th>
                <th className="px-4 py-3 text-right">Invoice</th>
                <th className="px-4 py-3 text-right">Excel</th>
              </tr>
            </thead>
            <tbody>
              {report.platforms.map((platform) => (
                <tr
                  key={platform.platform}
                  className="border-t border-slate-100 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3 font-medium">
                    {platform.platform}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {platform.total_orders}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {platform.total_piece_qty}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(platform.total_invoice_amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onDownload(report.report_date, platform.platform)
                      }
                      disabled={downloading}
                      className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900 text-xs font-semibold disabled:opacity-50"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-violet-200 bg-violet-50/80 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {report.total_orders}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {report.total_piece_qty}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoney(report.total_invoice_amount)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SalesReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/sales-reports`);
      setReports(data.reports ?? []);
    } catch (error) {
      console.error(error);
      alert("Failed to load sales reports");
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const downloadSalesExcel = async (reportDate, platform = "All") => {
    const key = `${reportDate}-${platform}`;
    setDownloadingKey(key);
    try {
      const response = await axios.get(
        `${API_BASE}/sales-analytics/export`,
        {
          params: { report_date: reportDate, platform },
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
        `final_sale_report_${reportDate}_${platform.toLowerCase()}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Download failed");
    } finally {
      setDownloadingKey(null);
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
            <TrendingUp className="text-violet-600" size={22} />
            Daily sales reports
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <p className="text-slate-500 text-sm mb-6">
          Browse saved daily sales reports by date. Open a report to see
          platform-wise totals, or download as Excel.
        </p>

        {loading ? (
          <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm px-6 py-16 text-center text-slate-500">
            Loading sales reports…
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm px-6 py-16 text-center text-slate-500">
            No sales reports saved yet. Generate a final report first to
            record platform sales.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {reports.map((report) => {
              const accent =
                PLATFORM_ACCENTS[report.platforms[0]?.platform] ||
                "from-violet-500 to-purple-600";

              return (
                <article
                  key={report.report_date}
                  className="group rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm overflow-hidden transition hover:border-violet-300 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedReport(report)}
                    className="w-full text-left p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center shrink-0 shadow-sm`}
                      >
                        <TrendingUp className="text-white" size={22} />
                      </div>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-violet-100 text-violet-800">
                        {report.platform_count} platform
                        {report.platform_count === 1 ? "" : "s"}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-slate-900 mt-4">
                      {report.report_date}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {report.platforms.map((p) => p.platform).join(", ")}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          Total orders
                        </p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">
                          {report.total_orders}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          Total pieces
                        </p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">
                          {report.total_piece_qty}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-violet-50 px-3 py-2 flex items-center gap-2">
                      <IndianRupee size={16} className="text-violet-700" />
                      <span className="text-sm font-semibold text-violet-900 tabular-nums">
                        {formatMoney(report.total_invoice_amount)}
                      </span>
                    </div>

                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 group-hover:text-violet-900">
                      <Eye size={16} />
                      View details
                    </span>
                  </button>

                  <div className="border-t border-slate-200/80 px-5 py-3 bg-white/60">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        downloadSalesExcel(report.report_date, "All");
                      }}
                      disabled={
                        downloadingKey === `${report.report_date}-All`
                      }
                      className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-50"
                    >
                      <Download size={16} />
                      {downloadingKey === `${report.report_date}-All`
                        ? "Downloading…"
                        : "Download Excel"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && reports.length > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {reports.length} daily sales report
            {reports.length === 1 ? "" : "s"} available
          </p>
        )}
      </div>

      <SalesDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onDownload={downloadSalesExcel}
        downloading={!!downloadingKey}
      />
    </div>
  );
}
