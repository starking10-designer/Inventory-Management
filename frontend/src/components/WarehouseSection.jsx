import "../dashboard.css";
import "../stock-inventory.css";
import "../return-analysis.css";
import "../warehouse.css";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Eye,
  Trash2,
  Package,
  RefreshCw,
  Search,
  X,
  TrendingUp,
  BarChart3,
  Layers,
  Check,
  IndianRupee,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_BASE } from "../api.js";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL"];
const CHART_RANGE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom Date" },
];

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
    const style = row.style || "Unknown";
    const color = row.color || "Unknown";
    const size = String(row.size || "").toUpperCase().trim();
    const key = `${style}\u0000${color}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: row.date,
        style,
        color,
        sizes: {},
        total: 0,
      });
    }

    const item = grouped.get(key);
    const qty = Number(row.piece_qty || 0);
    item.sizes[size] = (item.sizes[size] || 0) + qty;
    item.total += qty;
  }

  return [...grouped.values()].sort(
    (a, b) => a.style.localeCompare(b.style) || a.color.localeCompare(b.color),
  );
}

function uniqueSalesAmount(rows) {
  const seen = new Set();
  let total = 0;
  for (const row of rows) {
    const key = `${row.date}\u0000${row.order_id}\u0000${row.sku}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += Number(row.invoice_amount || 0);
  }
  return total;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};

  return (
    <div className="rounded-2xl border border-white/90 glass/95 p-3.5 shadow-xl backdrop-blur-xl text-xs">
      <p className="font-bold text-slate-900 mb-1.5 border-b border-slate-100 pb-1">{label}</p>
      <div className="space-y-1">
        <p className="text-slate-800 font-medium flex justify-between gap-4">
          <span>Orders:</span>
          <span className="font-bold text-slate-900">{item.orders || 0}</span>
        </p>
        <p className="text-slate-800 font-medium flex justify-between gap-4">
          <span>Total Pieces:</span>
          <span className="font-bold text-slate-900">{item.pieces || 0}</span>
        </p>
        <p className="text-slate-800 font-medium flex justify-between gap-4">
          <span>Sales:</span>
          <span className="font-bold text-emerald-700">{formatMoney(item.salesAmount)}</span>
        </p>
      </div>
    </div>
  );
}

function DetailTable({ rows }) {
  const sizeColumns = useMemo(() => buildSizeColumns(rows), [rows]);
  const summaryRows = useMemo(() => buildStyleSummary(rows), [rows]);

  if (summaryRows.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-slate-800 font-medium">
        No warehouse lines for this report.
      </p>
    );
  }

  return (
    <div className="warehouse-detail-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable warehouse batch details">
      <table className="glass-table stock-data-table stock-matrix-table warehouse-detail-table">
        <thead className="sticky top-0 z-10 glass/95 backdrop-blur-md text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
          <tr>
            <th>Style</th>
            <th>Color</th>
            {sizeColumns.map((size) => (
              <th key={size} className="px-4 py-3 text-right">
                {size}
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summaryRows.map((row, index) => (
            <tr
              key={`${row.style}-${row.color}-${index}`}
              className="warehouse-detail-row"
            >
              <td>{row.style}</td>
              <td>{row.color}</td>
              {sizeColumns.map((size) => (
                <td key={size} className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-medium">
                  {row.sizes[size] || "-"}
                </td>
              ))}
              <td>
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={2}>Grand total</td>{sizeColumns.map(size => <td key={size}>{summaryRows.reduce((sum, row) => sum + Number(row.sizes[size] || 0), 0).toLocaleString("en-IN")}</td>)}<td>{summaryRows.reduce((sum, row) => sum + row.total, 0).toLocaleString("en-IN")}</td></tr></tfoot>
      </table>
    </div>
  );
}

function DetailModal({ card, onClose, onDownload, downloading }) {
  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass/40 p-4 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="stock-preview-modal warehouse-detail-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-detail-title"
      >
        <div className="warehouse-detail-heading">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-800 font-medium">
              Flipkart Batch
            </p>
            <h2
              id="warehouse-detail-title"
              className="mt-1 text-xl font-black text-slate-900"
            >
              {card.date}
            </h2>
            <p className="mt-1 text-xs text-slate-800 font-medium">
              {card.lineCount} style-color line{card.lineCount === 1 ? "" : "s"}{" "}
              · {card.totalPieces} pieces · {formatMoney(card.salesAmount)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload(card.date)}
              disabled={downloading || card.rows.length === 0}
              className="stock-export-button"
            >
              <Download size={14} />
              {downloading ? "Downloading..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close warehouse details"
              className="rounded-xl border border-slate-200 glass p-2 text-slate-800 font-medium hover:glass shadow-xs transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <DetailTable rows={card.rows} />
      </div>
    </div>
  );
}

function WarehouseUpload({ title, description, file, onFile, accept, busy, onGenerate, action }) {
  return (
    <section className={`stock-import-panel warehouse-upload-panel ${title === "Malur labels" ? "warehouse-upload-labels" : "warehouse-upload-sales"}`} aria-label={title}>
      <div className="stock-import-heading"><span className="stock-import-icon">{title === "Malur labels" ? <Layers size={20} /> : <Upload size={20} />}</span><h2>{title}</h2><span className="stock-file-status">{file ? "File ready" : "Excel"}</span></div>
      <p className="warehouse-upload-description">{description}</p>
      <div className="stock-upload-field" data-ready={!!file}>
        <label className="stock-upload-label">
          <input type="file" accept={accept} aria-label={`Choose ${title.toLowerCase()} file`} className="stock-file-input" disabled={busy || !!file} onChange={event => { onFile(event.target.files?.[0] || null); event.target.value = ""; }} />
          <span className="stock-file-icon">{file ? <Check size={25} /> : <FileSpreadsheet size={25} />}</span><strong title={file?.name}>{file ? file.name : "Choose spreadsheet"}</strong><span>{file ? "Ready to generate" : accept.replaceAll(".", "").toUpperCase().replaceAll(",", ", ")}</span>
        </label>
      </div>
      <div className="stock-import-footer"><button type="button" onClick={() => onFile(null)} disabled={!file || busy} className="stock-clear-button"><Trash2 size={14} />Clear file</button><button type="button" onClick={onGenerate} disabled={!file || busy} className="stock-preview-button">{busy ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}{busy ? "Generating..." : action}</button></div>
    </section>
  );
}

export default function Section() {
  const [file, setFile] = useState(null);
  const [labelFile, setLabelFile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [downloadDate, setDownloadDate] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [chartRange, setChartRange] = useState("weekly");
  const [customFromDate, setCustomFromDate] = useState(() => shiftDate(todayYmd(), -6));
  const [customToDate, setCustomToDate] = useState(todayYmd);
  const [data, setData] = useState({
    count: 0,
    total_orders: 0,
    total_piece_qty: 0,
    total_invoice_amount: 0,
    items: [],
  });

  const loadRows = async (query = "") => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await axios.get(`${API_BASE}/flipkart-warehouse-report`, {
        params: query ? { search: query } : {},
      });
      setData({
        count: response.data.count || 0,
        total_orders: response.data.total_orders || 0,
        total_piece_qty: response.data.total_piece_qty || 0,
        total_invoice_amount: response.data.total_invoice_amount || 0,
        items: response.data.items || [],
      });
    } catch (error) {
      console.error("Failed to load Flipkart data", error);
      setLoadError("Unable to load warehouse reports. Please refresh to try again.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadRows();
  }, []);

  const reportCards = useMemo(() => {
    const byDate = new Map();
    for (const row of data.items || []) {
      const date = row.date || todayYmd();
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    }

    return [...byDate.entries()]
      .map(([date, rows]) => {
        const summary = buildStyleSummary(rows);
        return {
          date,
          rows,
          lineCount: summary.length,
          totalPieces: summary.reduce((sum, item) => sum + item.total, 0),
          itemCount: new Set(
            rows.map((row) => `${row.order_id}\u0000${row.sku}`),
          ).size,
          salesAmount: uniqueSalesAmount(rows),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.items]);

  const chartRows = useMemo(
    () =>
      [...reportCards]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((card) => ({
          date: card.date,
          orders: card.itemCount,
          pieces: card.totalPieces,
          salesAmount: card.salesAmount,
        })),
    [reportCards],
  );

  const chartBounds = useMemo(() => {
    if (chartRows.length === 0) {
      return { from: "", to: "" };
    }

    const latestDate = chartRows[chartRows.length - 1].date;

    if (chartRange === "monthly") {
      return {
        from: shiftDate(latestDate, -29),
        to: latestDate,
      };
    }

    if (chartRange === "custom") {
      return {
        from: customFromDate,
        to: customToDate,
      };
    }

    return {
      from: shiftDate(latestDate, -6),
      to: latestDate,
    };
  }, [chartRange, chartRows, customFromDate, customToDate]);

  const visibleChartRows = useMemo(
    () =>
      chartRows.filter((row) => {
        if (chartBounds.from && row.date < chartBounds.from) return false;
        if (chartBounds.to && row.date > chartBounds.to) return false;
        return true;
      }),
    [chartBounds, chartRows],
  );

  const generateReport = async () => {
    if (!(file instanceof File)) {
      alert("Select a Flipkart CSV or Excel file first.");
      return;
    }

    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await axios.post(
        `${API_BASE}/flipkart-warehouse-report`,
        formData,
      );

      setFile(null);
      await loadRows("");
      alert(response.data.message || "Flipkart report generated.");
    } catch (error) {
      console.error(error);
      const detail = error.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : detail?.message || "Failed to generate report";
      alert(msg);
    } finally {
      setGenerating(false);
    }
  };

  const generateLabels = async () => {
    if (!(labelFile instanceof File)) {
      alert("Select a Malur Label Excel file first.");
      return;
    }

    setGeneratingLabels(true);
    try {
      const formData = new FormData();
      formData.append("file", labelFile, labelFile.name);

      const response = await axios.post(
        `${API_BASE}/flipkart-warehouse-labels`,
        formData,
        { responseType: "blob" },
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Malur__Labels_${todayYmd()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setLabelFile(null);
    } catch (error) {
      console.error(error);
      alert("Failed to generate warehouse labels PDF.");
    } finally {
      setGeneratingLabels(false);
    }
  };

  const downloadReportExcel = async (date) => {
    setDownloadDate(date);
    try {
      const response = await axios.get(
        `${API_BASE}/flipkart-warehouse-report/export`,
        {
          params: { report_date: date },
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
        `flipkart_warehouse_report_${date || "all"}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Failed to download warehouse report");
    } finally {
      setDownloadDate(null);
    }
  };

  const deleteReport = async (date) => {
    if (!window.confirm(`Are you sure you want to delete warehouse report for ${date}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/flipkart-warehouse-report`, {
        params: { report_date: date },
      });
      await loadRows("");
      alert(`Report for ${date} deleted successfully.`);
    } catch (error) {
      console.error(error);
      alert("Failed to delete warehouse report");
    }
  };

  return (
    <div className="warehouse-page">
      <section className="warehouse-kpis" aria-label="Warehouse overview">
        {[
          { label: "Total orders", value: data.total_orders.toLocaleString("en-IN"), description: "Line orders in saved reports", icon: Package, tone: "" },
          { label: "Total pieces", value: data.total_piece_qty.toLocaleString("en-IN"), description: "Stock units dispatched", icon: Layers, tone: "blue" },
          { label: "Invoice amount", value: formatMoney(data.total_invoice_amount), description: "Total invoice value", icon: IndianRupee, tone: "violet" },
          { label: "Saved reports", value: reportCards.length.toLocaleString("en-IN"), description: "Daily dispatch batches", icon: FileSpreadsheet, tone: "amber" },
        ].map(({ label, value, description, icon: Icon, tone }) => <article className="dashboard-stat" key={label}><div className="dashboard-card-top"><span>{label}</span><span className={`dashboard-icon ${tone}`}><Icon size={21} /></span></div><strong>{loading ? "..." : value}</strong><p>{description}</p></article>)}
      </section>
      {loadError && <div className="warehouse-error" role="alert">{loadError}</div>}
      <div className="warehouse-workspace">
        <section className="return-analysis-charts warehouse-performance" aria-labelledby="warehouse-chart-title">
          <div className="return-analysis-chart-header"><div><span className="warehouse-card-eyebrow">Dispatch insights</span><h2 id="warehouse-chart-title"><BarChart3 size={19} /> Warehouse performance</h2><p>Date-wise order volume</p></div></div>
          <div className="warehouse-chart-controls">
            <div className="return-analysis-chart-tabs" role="group" aria-label="Warehouse chart period">
              {CHART_RANGE_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={chartRange === option.value} onClick={() => setChartRange(option.value)}>{option.label}</button>)}
            </div>
            {chartRange === "custom" && <div className="warehouse-chart-dates"><label>From<input type="date" aria-label="Chart from date" value={customFromDate} max={customToDate || undefined} onChange={e => setCustomFromDate(e.target.value)} /></label><label>To<input type="date" aria-label="Chart to date" value={customToDate} min={customFromDate || undefined} onChange={e => setCustomToDate(e.target.value)} /></label></div>}
          </div>
          <div className="warehouse-chart-canvas">
            {!visibleChartRows.length ? <div className="warehouse-empty">{loading ? "Loading warehouse data..." : chartRows.length ? "No reports in the selected date range." : "Upload a sales report to see warehouse performance."}</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={visibleChartRows} margin={{ top: 20, right: 18, left: 0, bottom: 10 }} barCategoryGap="28%"><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d5dde5" /><XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} tick={{ fontSize: 13, fill: "#43566b" }} tickFormatter={value => value.slice(5)} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={42} tick={{ fontSize: 13, fill: "#43566b" }} /><Tooltip content={<ChartTooltip />} cursor={{ fill: "#315f9b08" }} /><Bar dataKey="orders" name="Orders" radius={[7, 7, 0, 0]} maxBarSize={56} isAnimationActive={false}>{visibleChartRows.map(entry => <Cell key={entry.date} fill={entry.orders < 5 ? "#ce5965" : entry.orders < 20 ? "#dc9234" : "#25856a"} />)}</Bar></BarChart></ResponsiveContainer>}
          </div>
          <div className="warehouse-chart-legend"><span><i style={{ background: "#ce5965" }} />0-4 orders</span><span><i style={{ background: "#dc9234" }} />5-19 orders</span><span><i style={{ background: "#25856a" }} />20+ orders</span></div>
        </section>
        <div className="warehouse-uploads">
          <WarehouseUpload title="Sales report" description="Flipkart warehouse daily dispatches" file={file} onFile={setFile} accept=".csv,.xlsx,.xls" busy={generating} onGenerate={generateReport} action="Generate report" />
          <WarehouseUpload title="Malur labels" description="Create printable labels from your Excel file" file={labelFile} onFile={setLabelFile} accept=".xlsx,.xls" busy={generatingLabels} onGenerate={generateLabels} action="Generate PDF" />
        </div>
      </div>
      <section className="warehouse-reports" aria-labelledby="warehouse-reports-title">
        <div className="stock-table-toolbar">
          <div className="warehouse-reports-heading"><h2 id="warehouse-reports-title">Saved report batches</h2><p>View details or export a daily dispatch batch</p></div>
          <form className="stock-table-controls" onSubmit={event => { event.preventDefault(); loadRows(search); }}>
            <label className="stock-search"><Search size={16} /><input type="search" aria-label="Search warehouse reports" placeholder="Search date or SKU..." value={search} onChange={event => setSearch(event.target.value)} /></label>
            <button type="submit" className="warehouse-search-button" disabled={loading}>Search</button>
            <button type="button" onClick={() => loadRows(search)} disabled={loading} className="stock-refresh-button" aria-label="Refresh warehouse reports"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
          </form>
        </div>
        <div className="warehouse-reports-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable warehouse reports">
          <table className="glass-table stock-data-table warehouse-reports-table">
            <thead><tr><th>Report date</th><th>Orders</th><th>Total pieces</th><th>Sales amount</th><th>Actions</th></tr></thead>
            <tbody>{!reportCards.length ? <tr><td colSpan={5} className="warehouse-empty-cell">{loading ? "Loading reports..." : "No warehouse reports found."}</td></tr> : reportCards.map(card => <tr key={card.date}><td>{card.date}</td><td>{card.itemCount.toLocaleString("en-IN")}</td><td>{card.totalPieces.toLocaleString("en-IN")}</td><td className="warehouse-money">{formatMoney(card.salesAmount)}</td><td><div className="warehouse-row-actions"><button type="button" onClick={() => setSelectedCard(card)} aria-label={`View report ${card.date}`}><Eye size={14} />View</button><button type="button" disabled={downloadDate === card.date} onClick={() => downloadReportExcel(card.date)} className="warehouse-row-export" aria-label={`Export report ${card.date}`}><Download size={14} />Excel</button><button type="button" onClick={() => deleteReport(card.date)} className="warehouse-row-delete" aria-label={`Delete report ${card.date}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody>
            {reportCards.length > 0 && <tfoot><tr><td>Grand total</td><td>{data.total_orders.toLocaleString("en-IN")}</td><td>{data.total_piece_qty.toLocaleString("en-IN")}</td><td>{formatMoney(data.total_invoice_amount)}</td><td /></tr></tfoot>}
          </table>
        </div>
      </section>
      <DetailModal card={selectedCard} onClose={() => setSelectedCard(null)} onDownload={downloadReportExcel} downloading={Boolean(downloadDate)} />
    </div>
  );
}
