import "../dashboard.css";
import "../stock-inventory.css";
import "../sticker-inventory.css";
import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import {
  Package,
  ArrowUpRight,
  ChevronLeft,
  Download,
  BarChart3,
  Tag,
  Upload,
  Eye,
  Trash2,
  RefreshCw,
  X,
  Check,
  Search,
  FileSpreadsheet,
} from "lucide-react";
import {
  downloadInventoryExcel,
  inventoryDownloadErrorMessage,
} from "../utils/downloadInventoryExcel.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

export default function StickerInventoryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stickerUploading, setStickerUploading] = useState(false);
  const [stickerDownloading, setStickerDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stickerFile, setStickerFile] = useState(null);
  const [previewRows, setPreviewRows] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewStylesFilter, setPreviewStylesFilter] = useState([]);
  const [previewColorsFilter, setPreviewColorsFilter] = useState([]);
  const [previewSortField, setPreviewSortField] = useState("style");
  const [previewSortAsc, setPreviewSortAsc] = useState(true);
  const [previewSelectedRows, setPreviewSelectedRows] = useState([]);


  const [sortField, setSortField] = useState("style");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedStylesFilter, setSelectedStylesFilter] = useState([]);
  const [selectedColorsFilter, setSelectedColorsFilter] = useState([]);
  const [stockCondition, setStockCondition] = useState("all");

  // Tab state
  const [activeTab, setActiveTab] = useState("inventory");

  // Deduction tab states
  const [deductions, setDeductions] = useState([]);
  const [deductionsLoading, setDeductionsLoading] = useState(false);
  const [deductionFilters, setDeductionFilters] = useState({});
  const [deductionSortField, setDeductionSortField] = useState("style");
  const [deductionSortAsc, setDeductionSortAsc] = useState(true);
  const [deductionDate, setDeductionDate] = useState(new Date().toLocaleDateString("en-CA"));

  const loadStickerInventory = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/sticker-inventory`);
      const fetchedRows = data.rows ?? [];
      setRows(fetchedRows);
    } catch (e) {
      console.error(e);
      alert("Failed to load sticker inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTodayDeductions = async (dateStr = null) => {
    setDeductionsLoading(true);
    try {
      const targetDate = dateStr || deductionDate;
      const { data } = await axios.get(
        `${API_BASE}/api/analytics/inventory-deductions/today?inventory_type=sticker&query_date=${targetDate}`
      );
      setDeductions(data.data ?? []);
    } catch (e) {
      console.error("Failed to load deductions:", e);
      setDeductions([]);
    } finally {
      setDeductionsLoading(false);
    }
  };

  useEffect(() => {
    loadStickerInventory();
    loadTodayDeductions();
  }, []);

  const uniqueStyles = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => s.add(r.style.trim()));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const uniqueColors = useMemo(() => {
    const c = new Set();
    rows.forEach((r) => c.add(r.color.trim()));
    return Array.from(c).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredAndSortedRows = useMemo(() => {
    let list = [...rows];
    const query = searchQuery.trim().toLowerCase();
    if (query) list = list.filter(row => [row.style, row.color].some(value => String(value || "").toLowerCase().includes(query)));

    if (selectedStylesFilter.length > 0) {
      list = list.filter((r) => selectedStylesFilter.includes(r.style.trim()));
    }

    if (selectedColorsFilter.length > 0) {
      list = list.filter((r) => selectedColorsFilter.includes(r.color.trim()));
    }

    if (stockCondition === "in_stock") {
      list = list.filter((row) => Number(row.qty || 0) > 0);
    } else if (stockCondition === "zero_stock") {
      list = list.filter((row) => Number(row.qty || 0) === 0);
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "style") {
        comparison = a.style.localeCompare(b.style);
      } else if (sortField === "color") {
        comparison = a.color.localeCompare(b.color);
      } else if (sortField === "qty") {
        comparison = Number(a.qty || 0) - Number(b.qty || 0);
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [rows, searchQuery, selectedStylesFilter, selectedColorsFilter, stockCondition, sortField, sortAsc]);

  const handleSort = (field, asc) => {
    setSortField(field);
    setSortAsc(asc);
  };

  const grandTotal = useMemo(
    () => filteredAndSortedRows.reduce((sum, r) => sum + Number(r.qty || 0), 0),
    [filteredAndSortedRows],
  );

  const deductionColumns = ["platform", "style", "color", "qty"];

  const filteredDeductions = useMemo(() => {
    let result = [...deductions];
    const query = searchQuery.trim().toLowerCase();
    if (query) result = result.filter(row => [row.style, row.color].some(value => String(value || "").toLowerCase().includes(query)));
    for (const col of deductionColumns) {
      if (deductionFilters[col]?.length > 0) {
        result = result.filter(d => deductionFilters[col].includes(String(d[col] || "")));
      }
    }
    result.sort((a, b) => {
      let valA = a[deductionSortField];
      let valB = b[deductionSortField];
      if (deductionSortField === "qty") {
        return deductionSortAsc ? Number(valA||0) - Number(valB||0) : Number(valB||0) - Number(valA||0);
      }
      valA = String(valA || "").toLowerCase();
      valB = String(valB || "").toLowerCase();
      if (valA < valB) return deductionSortAsc ? -1 : 1;
      if (valA > valB) return deductionSortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [deductions, searchQuery, deductionFilters, deductionSortField, deductionSortAsc]);

  const deductionTotal = useMemo(
    () => filteredDeductions.reduce((sum, r) => sum + Number(r.qty || 0), 0),
    [filteredDeductions]
  );

  const startEditing = (row) => {
    if (!row || !row.id) return;
    setEditingCellId(row.id);
    setEditQty(String(row.qty));
  };

  const cancelEditing = () => {
    setEditingCellId(null);
    setEditQty("");
  };

  const saveCellQty = async (row) => {
    if (!row || !row.id) return cancelEditing();
    const newQty = Number(editQty);
    if (isNaN(newQty) || newQty < 0) {
      alert("Invalid quantity.");
      return;
    }
    if (newQty === row.qty) {
      cancelEditing();
      return;
    }

    try {
      await axios.patch(
        `${API_BASE}/sticker-inventory/${row.id}`,
        { qty: newQty },
        { headers: getAdminKeyHeader() }
      );
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, qty: newQty } : r))
      );
      cancelEditing();
    } catch (e) {
      console.error(e);
      alert("Failed to update quantity.");
    }
  };



  const handlePreview = () => {
    if (!stickerFile) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const normalized = json.map((row, idx) => {
          const newRow = { _id: idx };
          for (let key in row) {
             newRow[key.trim().toLowerCase()] = row[key];
          }
          return newRow;
        }).filter(r => {
          const style = String(r.style || "").trim();
          const color = String(r.color || "").trim();
          const qty = Number(r.qty) || 0;
          return (style || color) && qty > 0;
        });

        setPreviewRows(normalized);
        setShowPreviewModal(true);
        setPreviewSelectedRows([]);
      } catch (err) {
        console.error(err);
        alert("Failed to parse Excel file.");
      }
    };
    reader.readAsArrayBuffer(stickerFile);
  };

  const executePreviewUpload = async () => {
    if (!previewRows || previewRows.length === 0) {
      alert("No valid rows to upload.");
      return;
    }

    setStickerUploading(true);
    try {
      const worksheetData = previewRows.map(r => ({ style: r.style, color: r.color, qty: r.qty }));
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stickers");
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });
      const fd = new FormData();
      fd.append("file", fileData, stickerFile.name || "sticker-inventory.xlsx");

      const { data } = await axios.post(`${API_BASE}/upload-sticker-inventory`, fd, {
        headers: getAdminKeyHeader(),
      });
      alert(`${data.message}. Added ${data.total_added ?? 0} stickers across ${data.updated_cells ?? 0} cells.`);
      setShowPreviewModal(false);
      setStickerFile(null);
      setPreviewRows(null);
      await loadStickerInventory();
    } catch (error) {
      console.error("Upload error", error);
      alert(`Upload failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setStickerUploading(false);
    }
  };

  const uniquePreviewStyles = useMemo(() => Array.from(new Set(previewRows?.map(r => (r.style||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [previewRows]);
  const uniquePreviewColors = useMemo(() => Array.from(new Set(previewRows?.map(r => (r.color||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [previewRows]);

  const filteredPreviewRows = useMemo(() => {
    if (!previewRows) return [];
    let list = [...previewRows];
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      list = list.filter(r => (r.style||"").toLowerCase().includes(q) || (r.color||"").toLowerCase().includes(q));
    }
    if (previewStylesFilter.length > 0) list = list.filter(r => previewStylesFilter.includes((r.style||"").trim()));
    if (previewColorsFilter.length > 0) list = list.filter(r => previewColorsFilter.includes((r.color||"").trim()));

    list.sort((a,b) => {
      let cmp = 0;
      if (previewSortField === "style") cmp = (a.style||"").localeCompare(b.style||"");
      else if (previewSortField === "color") cmp = (a.color||"").localeCompare(b.color||"");
      else if (previewSortField === "qty") cmp = (Number(a.qty)||0) - (Number(b.qty)||0);
      return previewSortAsc ? cmp : -cmp;
    });
    return list;
  }, [previewRows, previewSearch, previewStylesFilter, previewColorsFilter, previewSortField, previewSortAsc]);

  const deleteSelectedPreviewRows = () => {
    setPreviewRows(prev => prev.filter(r => !previewSelectedRows.includes(r._id)));
    setPreviewSelectedRows([]);
  };

  const previewAllFilteredSelected = filteredPreviewRows?.length > 0 && filteredPreviewRows.every(r => previewSelectedRows.includes(r._id));
  const handleSelectAllPreviewFiltered = (e) => {
    if (e.target.checked) {
      const ids = filteredPreviewRows.map(r => r._id);
      setPreviewSelectedRows(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      const ids = new Set(filteredPreviewRows.map(r => r._id));
      setPreviewSelectedRows(prev => prev.filter(id => !ids.has(id)));
    }
  };

  const downloadStickerInventory = async () => {
    setStickerDownloading(true);
    try {
      await downloadInventoryExcel(
        "sticker",
        "",
        "sticker_inventory.xlsx"
      );
    } catch (error) {
      console.error(error);
      alert(await inventoryDownloadErrorMessage(error));
    } finally {
      setStickerDownloading(false);
    }
  };

  const colSpan = 3;

  return (
    <div className="stock-inventory-page sticker-inventory-page">
      <WorkspaceTopBar>
        <div className="stock-page-heading">
          <Link to="/#inventory" className="stock-back-link" aria-label="Back to Inventory"><ChevronLeft size={18} /></Link>
          <span className="stock-page-icon"><Tag size={20} /></span>
          <div><h1>Sticker Inventory</h1><p>Sticker stock, uploads &amp; deductions</p></div>
        </div>
      </WorkspaceTopBar>
      <main className="stock-page-content">
        <section className="stock-kpi-grid" aria-label="Sticker overview and upload">
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Selected date deductions</span><span className="dashboard-icon"><Package size={21} /></span></div>
            <strong>{loading || deductionsLoading ? "..." : deductions.reduce((sum, row) => sum + (Number(row.qty) || 0), 0).toLocaleString("en-IN")}</strong>
            <p>Stickers deducted on <time dateTime={deductionDate}>{deductionDate}</time></p>
          </article>
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Total stickers</span><span className="dashboard-icon blue"><Tag size={21} /></span></div>
            <strong>{loading ? "..." : rows.reduce((sum, row) => sum + Number(row.qty || 0), 0).toLocaleString("en-IN")}</strong><p>Units available across all styles</p>
          </article>
          <Link to="/sticker-inventory/sticker-analysis" className="dashboard-action">
            <div className="dashboard-card-top"><span>Sticker insights</span><span className="dashboard-icon amber"><BarChart3 size={21} /></span></div>
            <h3>Explore analytics</h3><p>Stock levels &amp; upload activity</p>
            <div className="dashboard-card-foot">View analysis <ArrowUpRight size={16} /></div>
          </Link>
          <section className="stock-import-panel" aria-labelledby="sticker-upload-title">
            <div className="stock-import-heading"><span className="stock-import-icon"><Upload size={18} /></span><h2 id="sticker-upload-title">Upload stickers</h2><span className="stock-file-status">{stickerFile ? "File ready" : "Excel"}</span></div>
            <div className="stock-upload-field" data-ready={!!stickerFile}>
              <label className="stock-upload-label">
                <input type="file" accept=".xlsx,.xls,.csv" className="stock-file-input" aria-label="Upload sticker Excel file" disabled={!!stickerFile} onChange={e => { const file = e.target.files?.[0]; if (file) setStickerFile(file); e.target.value = ""; }} />
                <span className="stock-file-icon">{stickerFile ? <Check size={30} /> : <FileSpreadsheet size={30} />}</span>
                <strong title={stickerFile?.name}>{stickerFile ? stickerFile.name : "Choose sticker file"}</strong>
                <span>{stickerFile ? "Ready to preview" : "XLSX, XLS or CSV"}</span>
              </label>
            </div>
            <div className="stock-import-footer">
              <button type="button" onClick={() => { setStickerFile(null); setPreviewRows(null); setPreviewSelectedRows([]); setShowPreviewModal(false); }} disabled={!stickerFile || stickerUploading} className="stock-clear-button"><Trash2 size={14} /> Clear file</button>
              <button type="button" onClick={handlePreview} disabled={!stickerFile || stickerUploading} className="stock-preview-button"><Eye size={15} /> Preview stickers</button>
            </div>
          </section>
        </section>
        <div className="stock-table-panel" aria-label="Sticker inventory records">
          <div className="stock-table-toolbar">
            <div className="stock-table-tabs" role="group" aria-label="Sticker inventory view">
              <button onClick={() => setActiveTab("inventory")} aria-pressed={activeTab === "inventory"}>Current stock</button>
              <button onClick={() => { setActiveTab("deductions"); loadTodayDeductions(); }} aria-pressed={activeTab === "deductions"}>Deductions</button>
            </div>
            <div className="stock-table-controls">
              {activeTab === "deductions" && <input type="date" aria-label="Sticker deductions date" value={deductionDate} onChange={e => { setDeductionDate(e.target.value); loadTodayDeductions(e.target.value); }} className="stock-deduction-date" />}
              <label className="stock-search"><Search size={16} /><input type="search" aria-label="Search sticker inventory" placeholder="Search style or color..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></label>
              {activeTab === "inventory" && (selectedStylesFilter.length > 0 || selectedColorsFilter.length > 0 || stockCondition !== "all") && <button className="sticker-clear-filters" onClick={() => { setSelectedStylesFilter([]); setSelectedColorsFilter([]); setStockCondition("all"); }}>Clear filters</button>}
              {activeTab === "deductions" && Object.values(deductionFilters).some(v => v?.length > 0) && <button className="sticker-clear-filters" onClick={() => setDeductionFilters({})}>Clear filters</button>}
              <button onClick={loadStickerInventory} disabled={loading} className="stock-refresh-button" title="Refresh stickers" aria-label="Refresh stickers"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
              <button onClick={downloadStickerInventory} disabled={stickerDownloading || !filteredAndSortedRows.length} className="stock-export-button"><Download size={15} />{stickerDownloading ? "Exporting..." : "Export stickers"}</button>
            </div>
          </div>
          <div className="stock-table-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable sticker inventory table">

            {/* ── INVENTORY TAB ── */}
            {activeTab === "inventory" && (
            <table className="glass-table stock-data-table sticker-data-table">
              <thead className="sticky top-0 z-10 glass text-xs font-extrabold uppercase tracking-widest text-slate-800 font-medium border-b-2 border-slate-200 shadow-sm">
                <tr>
                  <th>
                    <ExcelHeaderFilter
                      label="Style"
                      columnKey="style"
                      values={uniqueStyles}
                      selectedValues={selectedStylesFilter}
                      onFilterChange={setSelectedStylesFilter}
                      sortField={sortField}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align="left"
                    />
                  </th>
                  <th>
                    <ExcelHeaderFilter
                      label="Color"
                      columnKey="color"
                      values={uniqueColors}
                      selectedValues={selectedColorsFilter}
                      onFilterChange={setSelectedColorsFilter}
                      sortField={sortField}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align="left"
                    />
                  </th>
                  <th>
                    <ExcelHeaderFilter
                      label="Qty"
                      columnKey="qty"
                      sortField={sortField}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align="right"
                      isNumeric={true}
                      numericStockFilter={stockCondition}
                      onNumericStockChange={setStockCondition}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-16 text-center text-slate-800 font-medium font-medium">
                      {loading ? "Loading..." : "No sticker rows found."}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="sticker-data-row"
                    >
                      <td title={row.style}>
                        {row.style || "-"}
                      </td>
                      <td title={row.color}>
                        {row.color || "-"}
                      </td>
                      <td>
                        <span className={`font-bold ${row.qty === 0 ? "text-slate-800 font-medium" : row.qty < 5 ? "text-orange-600" : "text-slate-700"}`}>
                          {row.qty}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredAndSortedRows.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 glass/95 backdrop-blur-md border-t border-slate-200">
                  <tr>
                    <td colSpan={2}>
                      Grand Total
                    </td>
                    <td>
                      {grandTotal.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            )}

            {/* ── TODAY'S DEDUCTION TAB ── */}
            {activeTab === "deductions" && (
            <table className="glass-table stock-data-table sticker-data-table">
              <thead className="sticky top-0 z-10 glass text-xs font-extrabold uppercase tracking-widest text-slate-800 font-medium border-b-2 border-slate-200 shadow-sm">
                <tr>
                  {deductionColumns.map(col => {
                    const uniqueVals = Array.from(new Set(deductions.map(d => String(d[col] || "")).filter(Boolean)));
                    return (
                      <th key={col} className="px-5 py-4 min-w-[130px]">
                        <ExcelHeaderFilter
                          label={col.charAt(0).toUpperCase() + col.slice(1)}
                          columnKey={col}
                          values={uniqueVals}
                          selectedValues={deductionFilters[col] || []}
                          onFilterChange={(v) => setDeductionFilters(prev => ({ ...prev, [col]: v }))}
                          sortField={deductionSortField}
                          sortAsc={deductionSortAsc}
                          onSort={(f, a) => { setDeductionSortField(f); setDeductionSortAsc(a); }}
                          align={col === "qty" ? "right" : "left"}
                          isNumeric={col === "qty"}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deductionsLoading ? (
                  <tr><td colSpan={4} className="py-16 text-center text-slate-800 font-medium font-semibold">Loading deductions...</td></tr>
                ) : filteredDeductions.length > 0 ? (
                  filteredDeductions.map((row, idx) => (
                    <tr key={row.id ?? idx} className="sticker-data-row">
                      {deductionColumns.map(col => (
                        <td key={col} className={`px-5 py-3.5 ${col === "qty" ? "text-right font-black text-[#0F2137] tabular-nums" : "font-medium text-slate-700"}`}>
                          {row[col] || "-"}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="py-16 text-center text-slate-800 font-medium font-semibold">No sticker deductions found for today.</td></tr>
                )}
              </tbody>
              {filteredDeductions.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 glass/95 backdrop-blur-md border-t border-slate-200">
                  <tr>
                    <td colSpan={3}>Total Deducted on Date</td>
                    <td>{deductionTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            )}

          </div>
        </div>

      {/* Preview Modal */}
      {showPreviewModal && previewRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass/40 backdrop-blur-sm">
          <div className="stock-preview-modal w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between glass/50 shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-900">Preview sticker data</h3>
                <p className="text-sm text-slate-800 font-medium font-medium mt-1">
                  Review data before updating database
                </p>
              </div>
              <button aria-label="Close sticker preview" onClick={() => setShowPreviewModal(false)} className="h-8 w-8 flex items-center justify-center rounded-lg glass border border-slate-200 text-slate-800 font-medium hover:text-slate-800 font-medium hover:glass transition shadow-sm">
                <X size={16} />
              </button>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-3 border-b border-slate-200 glass flex flex-wrap gap-4 items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-800 font-medium group-focus-within:text-[#0F2137] transition" size={14} />
                  <input
                    type="text"
                    placeholder="Search preview..."
                    value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    className="h-8 w-56 rounded-lg border border-slate-200 glass pl-8 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0F2137] focus:glass"
                  />
                </div>
                {previewSelectedRows.length > 0 && (
                  <button
                    onClick={deleteSelectedPreviewRows}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-rose-50 text-rose-600 font-bold text-xs border border-rose-200 hover:bg-rose-100 transition"
                  >
                    <Trash2 size={14} /> Delete Selected ({previewSelectedRows.length})
                  </button>
                )}
              </div>
              <div className="text-xs font-bold text-slate-800 font-medium">
                Total Rows: {previewRows.length} | Filtered: {filteredPreviewRows?.length}
              </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-auto" data-lenis-prevent>
              <table className="glass-table stock-data-table sticker-data-table">
                <thead className="sticky top-0 glass/90 backdrop-blur border-b border-slate-200 text-xs font-bold uppercase text-slate-800 font-medium tracking-wider z-20 shadow-sm">
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={previewAllFilteredSelected}
                        onChange={handleSelectAllPreviewFiltered}
                        className="rounded border-slate-300 text-[#0F2137] focus:ring-0"
                      />
                    </th>
                    <th>
                      <ExcelHeaderFilter
                        label="Style"
                        columnKey="style"
                        values={uniquePreviewStyles}
                        selectedValues={previewStylesFilter}
                        onFilterChange={setPreviewStylesFilter}
                        sortField={previewSortField}
                        sortAsc={previewSortAsc}
                        onSort={(f, a) => { setPreviewSortField(f); setPreviewSortAsc(a); }}
                        align="left"
                      />
                    </th>
                    <th>
                      <ExcelHeaderFilter
                        label="Color"
                        columnKey="color"
                        values={uniquePreviewColors}
                        selectedValues={previewColorsFilter}
                        onFilterChange={setPreviewColorsFilter}
                        sortField={previewSortField}
                        sortAsc={previewSortAsc}
                        onSort={(f, a) => { setPreviewSortField(f); setPreviewSortAsc(a); }}
                        align="left"
                      />
                    </th>
                    <th>
                      <ExcelHeaderFilter
                        label="Qty"
                        columnKey="qty"
                        sortField={previewSortField}
                        sortAsc={previewSortAsc}
                        onSort={(f, a) => { setPreviewSortField(f); setPreviewSortAsc(a); }}
                        align="right"
                        isNumeric={true}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPreviewRows?.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-800 font-medium">No preview data matches.</td></tr>
                  ) : (
                    filteredPreviewRows?.map((row, i) => (
                      <tr key={row._id} className="hover:bg-blue-50/40 transition glass">
                        <td>
                          <input
                            type="checkbox"
                            checked={previewSelectedRows.includes(row._id)}
                            onChange={(e) => {
                              if (e.target.checked) setPreviewSelectedRows(p => [...p, row._id]);
                              else setPreviewSelectedRows(p => p.filter(id => id !== row._id));
                            }}
                            className="rounded border-slate-300 text-[#0F2137] focus:ring-0"
                          />
                        </td>
                        <td>{row.style || "-"}</td>
                        <td>{row.color || "-"}</td>
                        <td>{row.qty}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 glass shrink-0">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-800 font-medium font-bold hover:glass transition"
                disabled={stickerUploading}
              >
                Cancel
              </button>
              <button
                onClick={executePreviewUpload}
                disabled={stickerUploading || previewRows.length === 0}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] text-white font-bold shadow hover:opacity-90 transition flex items-center gap-2"
              >
                {stickerUploading ? (
                  <><RefreshCw size={16} className="animate-spin" /> Updating...</>
                ) : (
                  <><Check size={16} /> Ok, Update Data</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}
