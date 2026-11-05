import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import "../dashboard.css";
import "../stock-inventory.css";
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import {
  ChevronLeft,
  Download,
  Package,
  Upload,
  RefreshCw,
  X,
  Check,
  TrendingUp,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  Search,
  ArrowLeft,
  Eye,
  BarChart2,
  ArrowUpRight
} from "lucide-react";
import {
  downloadInventoryExcel,
  inventoryDownloadErrorMessage,
} from "../utils/downloadInventoryExcel.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

const SIZE_ORDER_MAP = {
  "XXS": 1, "XS": 2, "S": 3, "M": 4, "L": 5, "XL": 6,
  "XXL": 7, "2XL": 7, "3XL": 8, "4XL": 9, "5XL": 10
};

function getSortedSizes(rows) {
  const sizeSet = new Set();
  for (const r of rows) {
    const s = String(r.size || "").toUpperCase().trim();
    if (s) sizeSet.add(s);
  }
  return Array.from(sizeSet).sort((a, b) => {
    const valA = SIZE_ORDER_MAP[a] || 99;
    const valB = SIZE_ORDER_MAP[b] || 99;
    if (valA !== valB) return valA - valB;
    return a.localeCompare(b);
  });
}

export default function StockInventoryPage() {
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stockUploading, setStockUploading] = useState(false);
  const [stockDownloading, setStockDownloading] = useState(false);
  const [editingCellId, setEditingCellId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [sortField, setSortField] = useState("style");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedStylesFilter, setSelectedStylesFilter] = useState([]);
  const [selectedColorsFilter, setSelectedColorsFilter] = useState([]);
  const [stockCondition, setStockCondition] = useState("all");

  const [stockFile, setStockFile] = useState(null);
  const [previewRows, setPreviewRows] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewStylesFilter, setPreviewStylesFilter] = useState([]);
  const [previewColorsFilter, setPreviewColorsFilter] = useState([]);
  const [previewSizesFilter, setPreviewSizesFilter] = useState([]);
  const [previewSortField, setPreviewSortField] = useState("style");
  const [previewSortAsc, setPreviewSortAsc] = useState(true);
  const [previewSelectedRows, setPreviewSelectedRows] = useState([]);

  // --- Deductions Tab States ---
  const [activeTab, setActiveTab] = useState("stock");
  const [deductions, setDeductions] = useState([]);
  const [deductionsLoading, setDeductionsLoading] = useState(false);
  
  const [deductionFilters, setDeductionFilters] = useState({});
  const [deductionSortField, setDeductionSortField] = useState("report_date");
  const [deductionSortAsc, setDeductionSortAsc] = useState(false);
  const [deductionDate, setDeductionDate] = useState(new Date().toLocaleDateString("en-CA")); // en-CA gives YYYY-MM-DD local time

  const fetchTodayDeductions = async (dateStr = null) => {
    setDeductionsLoading(true);
    try {
      const targetDate = dateStr || deductionDate;
      const { data } = await axios.get(`${API_BASE}/api/analytics/inventory-deductions/today?query_date=${targetDate}`);
      setDeductions(data.data || []);
    } catch (e) {
      console.error(e);
      alert("Failed to load today's deductions");
    } finally {
      setDeductionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "deductions" && deductions.length === 0) {
      fetchTodayDeductions();
    }
  }, [activeTab]);

  const filteredDeductions = useMemo(() => {
    let result = [...deductions];
    
    Object.keys(deductionFilters).forEach(colKey => {
      const selected = deductionFilters[colKey];
      if (selected && selected.length > 0) {
        result = result.filter(row => selected.includes(row[colKey]));
      }
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row => Object.values(row).some(val => String(val || "").toLowerCase().includes(q)));
    }

    if (deductionSortField) {
      result.sort((a, b) => {
        let valA = a[deductionSortField];
        let valB = b[deductionSortField];

        if (deductionSortField === "qty") {
          valA = parseFloat(valA || 0);
          valB = parseFloat(valB || 0);
          return deductionSortAsc ? valA - valB : valB - valA;
        }

        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
        
        if (valA < valB) return deductionSortAsc ? -1 : 1;
        if (valA > valB) return deductionSortAsc ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [deductions, deductionFilters, searchQuery, deductionSortField, deductionSortAsc]);

  const deductionColumns = ["platform", "style", "color", "size", "qty"];

  const loadStockInventory = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/stock-inventory`);
      const rows = data.rows ?? [];
      setStockRows(rows);
    } catch (e) {
      console.error(e);
      alert("Failed to load stock inventory");
      setStockRows([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStickerData = async () => {
  };

  useEffect(() => {
    loadStockInventory();
    fetchTodayDeductions();
    fetchStickerData();
  }, []);

  const availableSizes = useMemo(() => getSortedSizes(stockRows), [stockRows]);

  const uniqueStyles = useMemo(() => {
    const s = new Set();
    stockRows.forEach((r) => s.add(r.style.trim()));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [stockRows]);

  const availableColors = useMemo(() => {
    const c = new Set();
    stockRows.forEach((r) => c.add(r.color.trim()));
    return Array.from(c).sort((a, b) => a.localeCompare(b));
  }, [stockRows]);

  const pivotTableData = useMemo(() => {
    const existingMap = new Map();
    for (const r of stockRows) {
      const key = `${r.style.trim().toLowerCase()}\x00${r.color.trim().toLowerCase()}\x00${String(r.size || "").toUpperCase().trim()}`;
      existingMap.set(key, { id: r.id, qty: Number(r.qty || 0) });
    }

    const tableRows = [];
    const pairs = new Map();
    for (const r of stockRows) {
      const st = r.style.trim();
      const col = r.color.trim();
      const key = `${st.toLowerCase()}\x00${col.toLowerCase()}`;
      if (!pairs.has(key)) {
        pairs.set(key, { style: st, color: col });
      }
    }

    for (const { style, color } of pairs.values()) {
      const cells = {};
      let total = 0;
      for (const size of availableSizes) {
        const key = `${style.toLowerCase()}\x00${color.toLowerCase()}\x00${size}`;
        const found = existingMap.get(key);
        const qty = found ? found.qty : 0;
        cells[size] = {
          id: found ? found.id : null,
          style,
          color,
          size,
          qty,
        };
        total += qty;
      }
      tableRows.push({ style, color, displayColor: color, cells, total });
    }

    return tableRows;
  }, [stockRows, availableSizes]);

  const filteredAndSortedRows = useMemo(() => {
    let list = [...pivotTableData];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.style.toLowerCase().includes(q) || r.displayColor.toLowerCase().includes(q));
    }

    if (selectedStylesFilter.length > 0) {
      list = list.filter((r) => selectedStylesFilter.includes(r.style));
    }

    if (selectedColorsFilter.length > 0) {
      list = list.filter((r) => selectedColorsFilter.includes(r.displayColor));
    }

    if (stockCondition === "in_stock") {
      list = list.filter((row) => row.total > 0);
    } else if (stockCondition === "zero_stock") {
      list = list.filter((row) => row.total === 0);
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "style") comparison = a.style.localeCompare(b.style);
      else if (sortField === "color") comparison = a.displayColor.localeCompare(b.displayColor);
      else if (sortField === "total") comparison = a.total - b.total;
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [pivotTableData, searchQuery, selectedStylesFilter, selectedColorsFilter, stockCondition, sortField, sortAsc]);

  const handleSort = (field, asc) => {
    setSortField(field);
    setSortAsc(asc);
  };

  const grandTotal = useMemo(
    () => filteredAndSortedRows.reduce((sum, r) => sum + r.total, 0),
    [filteredAndSortedRows],
  );

  const totalSKUs = uniqueStyles.length;

  const startEditing = (cell) => {
    if (!cell || !cell.id) return;
    setEditingCellId(cell.id);
    setEditQty(String(cell.qty));
  };

  const cancelEditing = () => {
    setEditingCellId(null);
    setEditQty("");
  };

  const saveCellQty = async (cell) => {
    if (!cell || !cell.id) return cancelEditing();
    const newQty = Number(editQty);
    if (isNaN(newQty) || newQty < 0) {
      alert("Invalid quantity.");
      return;
    }
    if (newQty === cell.qty) {
      cancelEditing();
      return;
    }

    try {
      await axios.patch(
        `${API_BASE}/stock-inventory/${cell.id}`,
        { qty: newQty },
        { headers: getAdminKeyHeader() }
      );
      setStockRows((prev) =>
        prev.map((r) => (r.id === cell.id ? { ...r, qty: newQty } : r))
      );
      cancelEditing();
    } catch (e) {
      console.error(e);
      alert("Failed to update quantity.");
    }
  };

  const handlePreview = () => {
    if (!stockFile) {
      alert("Please select a file to preview.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
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
      } catch (err) {
        console.error(err);
        alert("Failed to read Excel file for preview.");
      }
    };
    reader.readAsArrayBuffer(stockFile);
  };

  const executeStockUpload = async () => {
    if (!previewRows || previewRows.length === 0) {
      alert("No valid rows to upload.");
      return;
    }

    setStockUploading(true);
    try {
      const worksheetData = previewRows.map(r => ({ style: r.style, color: r.color, size: r.size, qty: r.qty }));
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });
      
      const fd = new FormData();
      fd.append("file", fileData, stockFile.name || "stock-inventory.xlsx");

      await axios.post(`${API_BASE}/upload-stock-inventory`, fd, {
        headers: getAdminKeyHeader(),
      });
      alert("File uploaded and inventory updated successfully!");
      setStockFile(null);
      setShowPreviewModal(false);
      setPreviewRows(null);
      await loadStockInventory();
    } catch (error) {
      console.error("Upload error", error);
      alert(`Upload failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setStockUploading(false);
    }
  };
  const uniquePreviewStyles = useMemo(() => Array.from(new Set(previewRows?.map(r => (r.style||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [previewRows]);
  const uniquePreviewColors = useMemo(() => Array.from(new Set(previewRows?.map(r => (r.color||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [previewRows]);
  const uniquePreviewSizes = useMemo(() => Array.from(new Set(previewRows?.map(r => (r.size||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [previewRows]);

  const filteredPreviewRows = useMemo(() => {
    if (!previewRows) return [];
    let list = [...previewRows];
    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      list = list.filter(r => (r.style||"").toLowerCase().includes(q) || (r.color||"").toLowerCase().includes(q) || (r.size||"").toLowerCase().includes(q));
    }
    if (previewStylesFilter.length > 0) list = list.filter(r => previewStylesFilter.includes((r.style||"").trim()));
    if (previewColorsFilter.length > 0) list = list.filter(r => previewColorsFilter.includes((r.color||"").trim()));
    if (previewSizesFilter.length > 0) list = list.filter(r => previewSizesFilter.includes((r.size||"").trim()));
    
    list.sort((a,b) => {
      let cmp = 0;
      if (previewSortField === "style") cmp = (a.style||"").localeCompare(b.style||"");
      else if (previewSortField === "color") cmp = (a.color||"").localeCompare(b.color||"");
      else if (previewSortField === "size") cmp = (a.size||"").localeCompare(b.size||"");
      else if (previewSortField === "qty") cmp = (Number(a.qty)||0) - (Number(b.qty)||0);
      return previewSortAsc ? cmp : -cmp;
    });
    return list;
  }, [previewRows, previewSearch, previewStylesFilter, previewColorsFilter, previewSizesFilter, previewSortField, previewSortAsc]);

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


  const downloadStockInventory = async () => {
    setStockDownloading(true);
    try {
      const flattenedRows = [];
      for (const row of filteredAndSortedRows) {
        for (const size of availableSizes) {
          const cell = row.cells[size];
          if (cell && cell.id) {
            flattenedRows.push({
              style: row.style,
              color: row.color,
              size: size,
              qty: cell.qty,
            });
          }
        }
      }

      if (flattenedRows.length === 0) {
        alert("No valid stock data to export.");
        setStockDownloading(false);
        return;
      }

      await downloadInventoryExcel(
        flattenedRows,
        "stock",
        "",
        "stock_inventory.xlsx"
      );
    } catch (error) {
      console.error(error);
      alert(await inventoryDownloadErrorMessage(error));
    } finally {
      setStockDownloading(false);
    }
  };

  const colSpan = 3 + availableSizes.length;

  return (
    <div className="stock-inventory-page">
      <WorkspaceTopBar>
        <div className="stock-page-heading">
          <Link to="/#inventory" className="stock-back-link" aria-label="Back to Inventory"><ArrowLeft size={18} /></Link>
          <span className="stock-page-icon"><Package size={20} /></span>
          <div><h1>Stock Inventory</h1><p>Stock quantities, uploads &amp; deductions</p></div>
        </div>
      </WorkspaceTopBar>

      <main className="stock-page-content">
        <section className="stock-kpi-grid" aria-label="Stock overview and upload">
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Selected date deductions</span><span className="dashboard-icon"><Package size={21} /></span></div>
            <strong>{loading || deductionsLoading ? "—" : deductions.reduce((sum, row) => sum + (Number(row.qty) || 0), 0).toLocaleString()}</strong>
            <p>Units deducted on <time dateTime={deductionDate}>{deductionDate}</time></p>
          </article>
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Total stock</span><span className="dashboard-icon blue"><TrendingUp size={21} /></span></div>
            <strong>{loading ? "—" : grandTotal.toLocaleString()}</strong><p>Units across all sizes</p>
          </article>
          <Link to="/stock-inventory/analysis" className="dashboard-action">
            <div className="dashboard-card-top"><span>Stock insights</span><span className="dashboard-icon amber"><BarChart2 size={21} /></span></div>
            <h3>Explore analytics</h3><p>Stock movement &amp; deductions</p>
            <div className="dashboard-card-foot">View analysis <ArrowUpRight size={16} /></div>
          </Link>
          <section className="stock-import-panel" aria-labelledby="stock-upload-title">
            <div className="stock-import-heading"><span className="stock-import-icon"><Upload size={18} /></span><h2 id="stock-upload-title">Upload stock</h2><span className="stock-file-status">{stockFile ? "File ready" : "Excel"}</span></div>
            <p className="stock-import-description">Preview your stock sheet before updating quantities.</p>
            <div className="stock-upload-field" data-ready={!!stockFile}>
              <label className="stock-upload-label">
                <input type="file" accept=".xlsx,.xls,.csv" className="stock-file-input" aria-label="Upload stock Excel file" disabled={!!stockFile} onChange={e => { const file = e.target.files?.[0]; if (file) setStockFile(file); e.target.value = ""; }} />
                <span className="stock-file-icon">{stockFile ? <CheckCircle2 size={30} /> : <FileSpreadsheet size={30} />}</span>
                <strong title={stockFile?.name}>{stockFile ? stockFile.name : "Choose stock file"}</strong>
                <span>{stockFile ? "Ready to preview" : "XLSX, XLS or CSV"}</span>
                {!stockFile && <span className="stock-browse-button"><Upload size={13} /> Browse files</span>}
              </label>
            </div>
            <div className="stock-import-footer">
              <button type="button" onClick={() => { setStockFile(null); setPreviewRows(null); setPreviewSelectedRows([]); setShowPreviewModal(false); }} disabled={!stockFile || stockUploading} className="stock-clear-button"><Trash2 size={14} /> Clear file</button>
              <button type="button" onClick={handlePreview} disabled={!stockFile || stockUploading} className="stock-preview-button"><Eye size={15} /> Preview stock</button>
            </div>
          </section>

        </section>

        <div className="stock-workspace">
          <section className="stock-table-panel" aria-label="Stock inventory records">
            <div className="stock-table-toolbar">
              <div className="stock-table-tabs" role="group" aria-label="Stock inventory view">
                <button onClick={() => setActiveTab('stock')} aria-pressed={activeTab === 'stock'}>Current stock</button>
                <button onClick={() => setActiveTab('deductions')} aria-pressed={activeTab === 'deductions'}>Deductions</button>
              </div>
              <div className="stock-table-controls">
                {activeTab === 'deductions' && <input type="date" aria-label="Stock deductions date" value={deductionDate} onChange={e => { setDeductionDate(e.target.value); fetchTodayDeductions(e.target.value); }} className="stock-deduction-date" />}
                <label className="stock-search"><Search size={16} /><input type="search" aria-label="Search stock inventory" placeholder="Search style or color…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></label>
                <button onClick={loadStockInventory} disabled={loading} className="stock-refresh-button" title="Refresh stock" aria-label="Refresh stock"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
                <button onClick={downloadStockInventory} disabled={stockDownloading || !filteredAndSortedRows.length} className="stock-export-button"><Download size={15} />{stockDownloading ? "Exporting…" : "Export stock"}</button>
              </div>
            </div>

              {/* The Data Table */}
              <div className="stock-table-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable stock inventory table">
                {activeTab === 'deductions' ? (
                  <table className="glass-table stock-data-table stock-deductions-table">
                    <thead className="sticky top-0 z-10 glass border-b border-slate-200 shadow-sm text-xs font-bold uppercase text-slate-700">
                      <tr>
                        {deductionColumns.map(col => {
                          const uniqueVals = Array.from(new Set(deductions.map(d => d[col]).filter(Boolean)));
                          return (
                            <th key={col} className="px-5 py-3 text-left min-w-[120px]">
                              <ExcelHeaderFilter 
                                label={col.charAt(0).toUpperCase() + col.slice(1)} 
                                columnKey={col} 
                                values={uniqueVals} 
                                selectedValues={deductionFilters[col] || []} 
                                onFilterChange={(v) => setDeductionFilters(prev => ({...prev, [col]: v}))} 
                                sortField={deductionSortField} 
                                sortAsc={deductionSortAsc} 
                                onSort={(f,a)=>{setDeductionSortField(f);setDeductionSortAsc(a);}} 
                                align={col === 'qty' ? 'right' : 'left'} 
                              />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deductionsLoading ? (
                        <tr><td colSpan={deductionColumns.length} className="py-10 text-slate-800 font-medium font-semibold">Loading deductions...</td></tr>
                      ) : filteredDeductions.length > 0 ? (
                        filteredDeductions.map((row, idx) => (
                          <tr key={idx} className="hover:glass/50 transition">
                            {deductionColumns.map(col => (
                              <td key={col} className={`px-5 py-3 ${col === 'qty' ? 'text-right font-black text-[#0F2137]' : 'text-left font-medium text-slate-700'}`}>
                                {row[col] || "-"}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={deductionColumns.length} className="py-10 text-slate-800 font-medium font-semibold">No deductions found for today.</td></tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="glass-table stock-data-table stock-matrix-table">
                  <thead className="sticky top-0 z-10 glass border-b border-slate-200 shadow-sm text-xs font-bold uppercase text-slate-700">
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
                          values={availableColors}
                          selectedValues={selectedColorsFilter}
                          onFilterChange={setSelectedColorsFilter}
                          sortField={sortField}
                          sortAsc={sortAsc}
                          onSort={handleSort}
                          align="left"
                        />
                      </th>
                      {availableSizes.map((size) => (
                        <th key={size} className="px-3 py-3 min-w-[75px] text-slate-800 font-medium font-extrabold">
                          {size}
                        </th>
                      ))}
                      <th>
                        <ExcelHeaderFilter
                          label="Total"
                          columnKey="total"
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
                        <td colSpan={colSpan} className="px-4 py-12 text-center text-slate-800 font-medium font-medium">
                          {loading ? "Loading data..." : "No records found."}
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedRows.map((row, idx) => (
                        <tr key={`${row.style}-${row.color}`} className="stock-data-row">
                          <td title={row.style}>{row.style}</td>
                          <td title={row.displayColor}>{row.displayColor}</td>
                          {availableSizes.map((size) => {
                            const cell = row.cells[size];
                            const isEditing = cell && editingCellId !== null && editingCellId === cell.id;
                            return (
                              <td key={size} className="px-3 py-3.5 tabular-nums text-xs border-r border-slate-100/50">
                                {!cell?.id ? (
                                  <span className="text-slate-800 font-medium">-</span>
                                ) : isEditing ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <input type="number" min="0" value={editQty} onChange={(e) => setEditQty(e.target.value)} className="w-14 rounded border-2 border-[#0F2137] glass px-1 py-0.5 text-center text-sm font-bold shadow-sm outline-none hide-number-spinners" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveCellQty(cell); if (e.key === "Escape") cancelEditing(); }} />
                                    <div className="flex gap-1">
                                      <button aria-label="Save stock quantity" onClick={() => saveCellQty(cell)} className="rounded bg-emerald-100 p-0.5 text-emerald-700 hover:bg-emerald-200 transition"><Check size={12} /></button>
                                      <button aria-label="Cancel quantity edit" onClick={cancelEditing} className="rounded bg-rose-100 p-0.5 text-rose-700 hover:bg-rose-200 transition"><X size={12} /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="group relative flex cursor-pointer justify-center" onClick={() => startEditing(cell)}>
                                    <span className={`font-bold transition-colors group-hover:text-[#0F2137] ${cell.qty === 0 ? "text-slate-800 font-medium" : cell.qty < 5 ? "text-orange-600" : "text-slate-700"}`}>
                                      {cell.qty}
                                    </span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td>
                            <span className={`font-black ${row.total === 0 ? "text-slate-800 font-medium" : row.total < 10 ? "text-orange-600" : "text-slate-900"}`}>{row.total}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredAndSortedRows.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10 glass border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                      <tr>
                        <td colSpan={2}>Grand Total</td>
                        {availableSizes.map((size) => {
                          const colSum = filteredAndSortedRows.reduce((sum, r) => sum + (r.cells[size]?.qty || 0), 0);
                          return (
                            <td key={size} className="px-3 py-3 text-center text-sm font-black text-slate-800 tabular-nums border-r border-slate-200/50">
                              {colSum}
                            </td>
                          );
                        })}
                        <td>
                          {grandTotal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                )} 
              </div>
          </section>
        </div>
      </main>

      {/* Preview Modal */}
      {showPreviewModal && previewRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass/40 backdrop-blur-sm">
          <div className="stock-preview-modal w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between glass/50 shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-900">Preview Stock Data</h3>
                <p className="text-sm text-slate-800 font-medium font-medium mt-1">
                  Review data before updating database
                </p>
              </div>
              <button aria-label="Close stock preview" onClick={() => setShowPreviewModal(false)} className="h-8 w-8 flex items-center justify-center rounded-lg glass border border-slate-200 text-slate-800 font-medium hover:text-slate-800 font-medium hover:glass transition shadow-sm">
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
            <div className="flex-1 overflow-auto glass">
              <table className="glass-table">
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
                        label="Size"
                        columnKey="size"
                        values={uniquePreviewSizes}
                        selectedValues={previewSizesFilter}
                        onFilterChange={setPreviewSizesFilter}
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
                    <tr><td colSpan={5} className="p-8 text-center text-slate-800 font-medium">No preview data matches.</td></tr>
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
                        <td>{row.size || "-"}</td>
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
                disabled={stockUploading}
              >
                Cancel
              </button>
              <button
                onClick={executeStockUpload}
                disabled={stockUploading || previewRows.length === 0}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] text-white font-bold shadow hover:opacity-90 transition flex items-center gap-2"
              >
                {stockUploading ? (
                  <><RefreshCw size={16} className="animate-spin" /> Updating...</>
                ) : (
                  <><Check size={16} /> Ok, Update Data</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
