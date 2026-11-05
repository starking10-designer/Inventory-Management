import "../dashboard.css";
import "../stock-inventory.css";
import "../return-analysis.css";
import "../packing-inventory.css";
import { PACKING_SERIES, buildPackingTrend } from "../utils/packingTrend.js";
import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import {
  useEffect,
  useMemo,
  useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {  ChevronLeft,
  Download,
  Layers,
  Search,
  Box,
  Package,
  Tag,
  FileText,
  Hash,
  X,
  Activity,
  TrendingUp,
  Upload,
  Eye,
  Trash2,
  Check,
  FileSpreadsheet,
  RefreshCw
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { API_BASE } from "../api.js";
import * as XLSX from "xlsx";

const TABLES = PACKING_SERIES;

const makeKey = () => `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function normalizeRows(rows, platforms) {
  const nextRows = rows.map((row) => ({
    ...row,
    _key: row.id ?? makeKey(),
    qty: Number(row.qty || 0),
  }));

  const coverRows = new Map(
    nextRows
      .filter((row) => row.item_type === "shipping_cover")
      .map((row) => [row.platform, row]),
  );

  for (const platform of platforms) {
    if (!coverRows.has(platform)) {
      nextRows.push({
        _key: makeKey(),
        id: null,
        item_type: "shipping_cover",
        platform,
        qty: 0,
      });
    }
  }

  return nextRows;
}

async function downloadPackingExcel() {
  const response = await axios.get(`${API_BASE}/packing-inventory/export`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "packing_inventory.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function PackingInventoryPage() {
  const [rows, setRows] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTab, setActiveTab] = useState(TABLES[0].type);

  const [historyData, setHistoryData] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await axios.get(`${API_BASE}/packing-inventory-analysis/history`);
      setHistoryData(data.history || {});
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const chartData = useMemo(() => buildPackingTrend(historyData), [historyData]);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState([]);

  const groupedRows = useMemo(() => {
    const grouped = {};
    for (const table of TABLES) grouped[table.type] = [];
    for (const row of rows) {
      if (grouped[row.item_type]) grouped[row.item_type].push(row);
    }
    for (const table of TABLES) {
      grouped[table.type].sort((a, b) =>
        String(a.platform || "").localeCompare(String(b.platform || "")),
      );
    }
    return grouped;
  }, [rows]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/packing-inventory`);
      const platformList = data.platforms ?? [];
      const normalized = normalizeRows(data.rows ?? [], platformList);
      setPlatforms(platformList);
      setRows(normalized);
    } catch (error) {
      console.error(error);
      alert("Failed to load packing inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setUploadFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        setPreviewData(data.slice(0, 10)); // preview first 10 rows
      };
      reader.readAsBinaryString(file);
    } else {
      setPreviewData([]);
    }
  };

  const submitUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      await axios.post(`${API_BASE}/packing-inventory-analysis/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert("Analysis data uploaded successfully");
      setUploadFile(null);
      setPreviewModal(false);
      setPreviewData([]);
      fetchHistory();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadAllTables = async () => {
    setDownloading(true);
    try {
      await downloadPackingExcel();
    } catch (error) {
      console.error(error);
      alert("Failed to download packing inventory Excel");
    } finally {
      setDownloading(false);
    }
  };

  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const totalItems = rows.filter(r => r.qty > 0).length;

  const renderTable = (table) => {
    const tableRows = (groupedRows[table.type] || []).filter(row =>
      !searchFilter.trim() || String(row.platform || table.title).toLowerCase().includes(searchFilter.trim().toLowerCase()),
    );
    const total = tableRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    return (
      <div className="packing-table-section">
        <div className="packing-table-caption"><h2>{table.title}</h2><span>{tableRows.length} items</span></div>
        <div className="packing-table-scroll" data-lenis-prevent tabIndex={0} aria-label={`Scrollable ${table.title} inventory`}>
          <table className="glass-table stock-data-table packing-data-table">
            <thead><tr><th>{table.type === "shipping_cover" ? "Platform" : "Item name"}</th><th>Quantity</th></tr></thead>
            <tbody>
              {tableRows.length ? tableRows.map(row => (
                <tr key={row._key}><td><span className="packing-item-name"><span style={{ backgroundColor: table.color }} />{row.platform || table.title}</span></td><td>{Number(row.qty || 0).toLocaleString("en-IN")}</td></tr>
              )) : <tr><td colSpan={2} className="packing-empty">No items found</td></tr>}
            </tbody>
            {tableRows.length > 0 && <tfoot><tr><td>Subtotal</td><td>{total.toLocaleString("en-IN")}</td></tr></tfoot>}
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="stock-inventory-page packing-inventory-page">
      <WorkspaceTopBar>
        <div className="stock-page-heading">
          <Link to="/#inventory" className="stock-back-link" aria-label="Back to Inventory"><ChevronLeft size={18} /></Link>
          <span className="stock-page-icon"><Layers size={20} /></span>
          <div><h1>Packing Inventory</h1><p>Shipping labels, covers &amp; packing materials</p></div>
        </div>
      </WorkspaceTopBar>
      <main className="stock-page-content">
        <section className="stock-kpi-grid packing-kpi-grid" aria-label="Packing inventory overview">
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Total quantity</span><span className="dashboard-icon"><Package size={21} /></span></div>
            <strong>{loading ? "..." : totalQuantity.toLocaleString("en-IN")}</strong><p>Units across all packing materials</p>
          </article>
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Active items</span><span className="dashboard-icon blue"><Hash size={21} /></span></div>
            <strong>{loading ? "..." : totalItems.toLocaleString("en-IN")}</strong><p>Items with available stock</p>
          </article>
          <section className="stock-import-panel" aria-labelledby="packing-upload-title">
            <div className="stock-import-heading"><span className="stock-import-icon"><Upload size={18} /></span><h2 id="packing-upload-title">Upload analysis</h2><span className="stock-file-status">{uploadFile ? "File ready" : "Excel"}</span></div>
            <div className="stock-upload-field" data-ready={!!uploadFile}>
              <label className="stock-upload-label">
                <input type="file" accept=".xlsx,.xls" className="stock-file-input" aria-label="Upload packing analysis Excel" disabled={!!uploadFile || uploading} onChange={e => { handleFileChange(e); e.target.value = ""; }} />
                <span className="stock-file-icon">{uploadFile ? <Check size={30} /> : <FileSpreadsheet size={30} />}</span>
                <strong title={uploadFile?.name}>{uploadFile ? uploadFile.name : "Choose analysis file"}</strong><span>{uploadFile ? "Ready to preview" : "XLSX or XLS"}</span>
              </label>
            </div>
            <div className="stock-import-footer">
              <button type="button" className="stock-clear-button" disabled={!uploadFile || uploading} onClick={() => { setUploadFile(null); setPreviewData([]); }}><Trash2 size={14} /> Clear file</button>
              <button type="button" className="stock-preview-button" disabled={!uploadFile || uploading} onClick={() => setPreviewModal(true)}><Eye size={15} /> Preview analysis</button>
            </div>
          </section>
        </section>
        <section className="return-analysis-charts packing-performance" aria-labelledby="packing-performance-title">
          <div className="return-analysis-chart-header">
            <div><h2 id="packing-performance-title"><Activity size={19} /> Packing performance</h2><p>Daily upload quantities by material over the last 30 days.</p></div>
            {loadingHistory && <RefreshCw size={17} className="animate-spin" aria-label="Loading packing history" />}
          </div>
          <div className="packing-chart-legend" aria-label="Chart series">
            {TABLES.map(table => <span key={table.type}><i style={{ backgroundColor: table.color }} />{table.title}</span>)}
          </div>
          <div className="packing-chart-canvas">
            {loadingHistory ? <div className="packing-chart-empty">Loading history...</div> : chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 12 }}>
                  <CartesianGrid vertical={false} stroke="#bacde04d" strokeDasharray="3 3" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={12} minTickGap={24} tick={{ fontSize: 11, fill: "#71869e" }} tickFormatter={value => `${value.slice(8, 10)}-${value.slice(5, 7)}`} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={48} tick={{ fontSize: 11, fill: "#71869e" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #d4e1ed", background: "#f8fbff", fontSize: 12 }} labelFormatter={value => value.split("-").reverse().join("-")} formatter={(value, name) => [Number(value).toLocaleString("en-IN"), name]} />
                  {TABLES.map(table => <Line key={table.type} type="linear" dataKey={table.type} name={table.title} stroke={table.color} strokeWidth={2.5} dot={{ r: 3, fill: table.color, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="packing-chart-empty"><TrendingUp size={28} /><span>No upload history yet</span></div>}
          </div>
        </section>
        <section className="stock-table-panel" aria-label="Packing inventory records">
          <div className="stock-table-toolbar">
            <div className="stock-table-tabs packing-table-tabs" role="group" aria-label="Packing material tables">
              {TABLES.map(table => <button key={table.type} aria-pressed={activeTab === table.type} onClick={() => setActiveTab(table.type)}><i style={{ backgroundColor: table.color }} />{table.title}</button>)}
            </div>
            <div className="stock-table-controls">
              <label className="stock-search"><Search size={16} /><input type="search" aria-label="Search packing inventory" placeholder="Search items..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} /></label>
              <button onClick={loadRows} disabled={loading} className="stock-refresh-button" aria-label="Refresh packing inventory"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
              <button onClick={downloadAllTables} disabled={downloading || loading} className="stock-export-button"><Download size={15} />{downloading ? "Exporting..." : "Export Excel"}</button>
            </div>
          </div>
          {loading ? <div className="packing-chart-empty">Loading inventory...</div> : renderTable(TABLES.find(table => table.type === activeTab))}
        </section>
      </main>

      {/* Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass/40 backdrop-blur-sm p-4">
          <div className="stock-preview-modal w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 glass">
              <h3 className="font-black text-slate-800">Preview Excel File (Top 10 rows)</h3>
              <button aria-label="Close packing preview" onClick={() => setPreviewModal(false)} className="text-slate-800 font-medium hover:text-slate-800 font-medium"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-auto p-4" data-lenis-prevent>
               {previewData.length > 0 ? (
                 <table className="glass-table stock-data-table">
                   <thead>
                     <tr>
                       {Object.keys(previewData[0]).map(k => (
                         <th key={k} className="py-2 px-3 font-bold">{k}</th>
                       ))}
                     </tr>
                   </thead>
                   <tbody>
                     {previewData.map((row, i) => (
                       <tr key={i} className="border-b border-slate-100 hover:glass">
                         {Object.values(row).map((v, j) => (
                           <td key={j} className="py-2 px-3 text-slate-700">{v}</td>
                         ))}
                       </tr>
                     ))}
                   </tbody>
                 </table>
               ) : (
                 <p className="text-slate-800 font-medium text-center py-8">No data found in this file.</p>
               )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 glass flex justify-end gap-3">
               <button onClick={() => setPreviewModal(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-800 font-medium hover:glass">Cancel</button>
               <button onClick={submitUpload} disabled={uploading || !previewData.length} className="px-4 py-2 rounded-xl text-sm font-bold bg-[#0F2137] text-white hover:bg-[#1E3A66] disabled:opacity-50">{uploading ? 'Uploading...' : 'Confirm Upload'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
