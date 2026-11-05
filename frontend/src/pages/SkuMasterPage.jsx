import "../dashboard.css";
import "../stock-inventory.css";
import "../sku-master.css";
import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  ChevronLeft,
  Edit3,
  Plus,
  Save,
  Search,
  Trash2,
  X,
  Upload,
  Database,
  FileSpreadsheet,
  Download,
  Tag,
  Check,
  ChevronRight,
} from "lucide-react";
import { API_BASE } from "../api.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

const EMPTY_ROW = { id: null, platform: "Common", sku: "", style: "", size: "", pack_of: "", main_product_type: "", pieces: [] };
const rowKey = (row) => row._key || row.id;

function errorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

export default function SkuMasterPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingKey, setEditingKey] = useState(null);
  const [draftRow, setDraftRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingKey, setSavingKey] = useState(null);
  const [activeSkuMaster, setActiveSkuMaster] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deletingMaster, setDeletingMaster] = useState(false);

  // Excel Column Filters State
  const [columns, setColumns] = useState([]);
  const [columnFilters, setColumnFilters] = useState({});
  const [sortField, setSortField] = useState("sku");
  const [sortAsc, setSortAsc] = useState(true);

  const loadRows = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rowsRes, currentRes] = await Promise.all([
        axios.get(`${API_BASE}/sku-master/rows`),
        axios.get(`${API_BASE}/current-sku-master`),
      ]);
      setRows(Array.isArray(rowsRes.data.items) ? rowsRes.data.items : []);
      setColumns(Array.isArray(rowsRes.data.columns) ? rowsRes.data.columns : []);
      setActiveSkuMaster(currentRes.data?.filename || null);
    } catch (error) {
      console.error(error);
      setLoadError("Unable to load the SKU master. Please reload this page to try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const handleUploadSkuMaster = async () => {
    if (!uploadFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      await axios.post(`${API_BASE}/upload-file`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      alert("SKU Master Uploaded Successfully!");
      setUploadFile(null);
      await loadRows();
    } catch (error) {
      console.error(error);
      alert(errorMessage(error, "Failed to upload SKU master file"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMasterDatabase = async () => {
    if (!window.confirm("Are you sure you want to delete the active SKU Master database? This will clear all SKU cross-reference mappings.")) {
      return;
    }

    setDeletingMaster(true);
    try {
      await axios.delete(`${API_BASE}/delete-sku-master`);
      alert("SKU Master Database Deleted Successfully");
      setActiveSkuMaster(null);
      setUploadFile(null);
      await loadRows();
    } catch (error) {
      console.error(error);
      alert(errorMessage(error, "Failed to delete SKU master database"));
    } finally {
      setDeletingMaster(false);
    }
  };

  const handleExportCsv = () => {
    if (!rows.length) {
      alert("No SKU records to export.");
      return;
    }

    const headers = ["Platform", "SKU", "Style", "Size", "Colors & Quantities"];
    const csvRows = [headers.join(",")];

    for (const row of rows) {
      const colorsStr = (row.pieces || [])
        .map((p) => `${p.color} x ${p.qty}`)
        .join(" | ");

      const values = [
        `"${(row.platform || "").replace(/"/g, '""')}"`,
        `"${(row.sku || "").replace(/"/g, '""')}"`,
        `"${(row.style || "").replace(/"/g, '""')}"`,
        `"${(row.size || "").replace(/"/g, '""')}"`,
        `"${colorsStr.replace(/"/g, '""')}"`,
      ];
      csvRows.push(values.join(","));
    }

    const csvString = "\uFEFF" + csvRows.join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    link.setAttribute("download", `sku_master_export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Dynamic unique lists for filters
  const uniqueValues = useMemo(() => {
    const vals = {};
    columns.forEach(col => {
      vals[col] = Array.from(new Set(rows.map(r => r[col]).filter(Boolean))).sort();
    });
    return vals;
  }, [rows, columns]);

  const uniqueColors = useMemo(() => {
    const colors = new Set();
    rows.forEach(r => {
      if (r.pieces) r.pieces.forEach(p => p.color && colors.add(p.color));
    });
    return Array.from(colors).sort();
  }, [rows]);

  const visibleRows = useMemo(() => {
    let list = [...rows];

    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((row) => columns.some((col) => String(row[col] || "").toLowerCase().includes(term)));
    }

    Object.keys(columnFilters).forEach(col => {
       const selected = columnFilters[col];
       if (selected && selected.length > 0 && selected.length < (uniqueValues[col]?.length || 0)) {
          list = list.filter(r => selected.includes(r[col]));
       }
    });

    list.sort((a, b) => {
      let cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""));
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [rows, search, columnFilters, uniqueValues, sortField, sortAsc, columns]);

  const handleSort = (field, asc) => {
    setSortField(field);
    setSortAsc(asc);
  };

  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const effectivePage = Math.min(page, pageCount);
  const pagedRows = visibleRows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  const updateSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const startEdit = (row) => {
    const key = rowKey(row);
    setEditingKey(key);
    setDraftRow({
      ...row,
      pieces: (row.pieces || []).map((piece) => ({ ...piece })),
    });
  };

  const cancelEdit = () => {
    if (String(editingKey).startsWith("new-")) {
      setRows((items) => items.filter((row) => rowKey(row) !== editingKey));
    }
    setEditingKey(null);
    setDraftRow(null);
  };

  const addRow = () => {
    const newRow = { ...EMPTY_ROW, pieces: [...EMPTY_ROW.pieces], _key: `new-${Date.now()}` };
    setRows((items) => [newRow, ...items]);
    setSearch("");
    setColumnFilters({});
    setSortField("sku");
    setSortAsc(true);
    setPage(1);
    startEdit(newRow);
  };

  const updateDraftRow = (field, value) => {
    setDraftRow((row) => ({ ...row, [field]: value }));
  };

  const updateDraftPiece = (pieceIndex, field, value) => {
    setDraftRow((row) => {
      const newPieces = [...(row.pieces || [])];
      while (newPieces.length <= pieceIndex) newPieces.push({ color: "" });
      newPieces[pieceIndex] = { ...newPieces[pieceIndex], [field]: value };
      return { ...row, pieces: newPieces };
    });
  };

  const addDraftPiece = () => {
    setDraftRow((row) => ({
      ...row,
      pieces: [...(row.pieces || []), { color: "", qty: 1 }],
    }));
  };

  const removeDraftPiece = (pieceIndex) => {
    setDraftRow((row) => ({
      ...row,
      pieces: (row.pieces || []).filter((_, index) => index !== pieceIndex),
    }));
  };

  const saveRow = async () => {
    if (!draftRow) return;
    if (!draftRow.sku.trim() || !draftRow.style.trim()) {
      alert("SKU and Style are required");
      return;
    }

    const payloadItem = { ...draftRow };

    setSavingKey(editingKey);
    try {
      await axios.put(`${API_BASE}/sku-master/rows`, { items: [payloadItem], deleted_ids: [] });
      await loadRows();
      setEditingKey(null);
      setDraftRow(null);
    } catch (error) {
      alert(errorMessage(error, "Failed to save SKU row"));
    } finally {
      setSavingKey(null);
    }
  };

  const removeRow = async (row) => {
    const key = rowKey(row);
    if (!row.id) {
      cancelEdit();
      return;
    }

    if (!window.confirm(`Delete SKU ${row.sku}?`)) return;
    setSavingKey(key);
    try {
      await axios.put(`${API_BASE}/sku-master/rows`, { items: [], deleted_ids: [row.id] });
      await loadRows();
      if (editingKey === key) {
        setEditingKey(null);
        setDraftRow(null);
      }
    } catch (error) {
      alert(errorMessage(error, "Failed to delete SKU row"));
    } finally {
      setSavingKey(null);
    }
  };

  const renderTextCell = (row, field) => {
    if (editingKey === rowKey(row) && draftRow) {
      return (
        <>
            <input
            list={`datalist-${field}-${row._key || row.id}`}
          aria-label={`Edit ${field.replace(/_/g, " ")}`}
          value={draftRow[field] || ""}
          onChange={(event) => updateDraftRow(field, event.target.value)}
          className="w-full min-w-24 rounded border border-[#0F2137] glass px-2.5 py-1 text-xs outline-none focus:border-[#0F2137]"
        />
            <datalist id={`datalist-${field}-${row._key || row.id}`}>
              {(uniqueValues[field] || []).map((val) => (
                <option key={String(val)} value={String(val)} />
              ))}
            </datalist>
          </>
      );
    }
    return <span className={field === "sku" ? "sku-code" : "sku-cell-value"}>{row[field] || "-"}</span>;
  };

  const renderPiecesCell = (row) => {
    if (editingKey === rowKey(row) && draftRow) {
      return (
        <div className="space-y-2">
          {(draftRow.pieces || []).map((piece, index) => (
            <div key={piece.id || index} className="flex items-center gap-2">
              <input list={`datalist-draft-color-${piece.id || index}`}
                value={piece.color || ""}
                onChange={(event) => updateDraftPiece(index, "color", event.target.value)}
                placeholder="Color"
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
                <datalist id={`datalist-draft-color-${piece.id || index}`}>{uniqueColors.map(c => <option key={c} value={c} />)}</datalist>
              <input
                type="number"
                min="1"
                value={piece.qty || 1}
                onChange={(event) => updateDraftPiece(index, "qty", Number(event.target.value))}
                className="w-14 rounded border border-slate-300 px-2 py-1 text-xs text-right"
              />
              <button type="button" title="Remove color" onClick={() => removeDraftPiece(index)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addDraftPiece} className="text-xs font-bold text-[#0F2137] hover:underline">
            + Add Color
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {(row.pieces || []).length ? row.pieces.map((piece) => (
          <span key={piece.id || `${piece.color}-${piece.qty}`} className="rounded border border-slate-200 glass px-2 py-0.5 text-xs font-medium text-slate-700">
            {piece.color} x {piece.qty}
          </span>
        )) : "-"}
      </div>
    );
  };

  const renderPieceColorCell = (row, index) => {
    if (editingKey === rowKey(row) && draftRow) {
      const val = draftRow.pieces?.[index]?.color || "";
      return (
        <>
            <input
            list={`datalist-color-${row._key || row.id}-${index}`}
          value={val}
          onChange={(event) => updateDraftPiece(index, "color", event.target.value)}
          className="w-full min-w-16 rounded border border-[#0F2137] glass px-2 py-1 text-xs outline-none focus:border-[#0F2137]"
        />
            <datalist id={`datalist-color-${row._key || row.id}-${index}`}>
              {uniqueColors.map(c => <option key={c} value={c} />)}
            </datalist>
          </>
      );
    }
    return <span className="whitespace-nowrap font-medium">{row.pieces?.[index]?.color || "-"}</span>;
  };

  const renderActionsCell = (row) => {
    const key = rowKey(row);
    const isEditing = editingKey === key;
    const isSaving = savingKey === key;

    if (isEditing) {
      return (
        <div className="sku-row-actions">
          <button type="button" title="Cancel" aria-label="Cancel" onClick={cancelEdit} disabled={isSaving} className="rounded-lg p-1.5 text-slate-800 font-medium hover:glass disabled:opacity-50">
            <X size={16} />
          </button>
          <button type="button" title="Save" aria-label="Save" onClick={saveRow} disabled={isSaving} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            <Save size={16} />
          </button>
        </div>
      );
    }

    return (
      <div className="sku-row-actions">
        <button type="button" title="Edit SKU" aria-label="Edit SKU" onClick={() => startEdit(row)} disabled={Boolean(editingKey) || isSaving} className="rounded p-1 text-[#0F2137] hover:glass disabled:opacity-40">
          <Edit3 size={15} />
        </button>
        <button type="button" title="Delete SKU" aria-label="Delete SKU" onClick={() => removeRow(row)} disabled={Boolean(editingKey) || isSaving} className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40">
          <Trash2 size={15} />
        </button>
      </div>
    );
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || Object.values(columnFilters).some(arr => arr && arr.length > 0));

  return (
    <div className="stock-inventory-page sku-master-page">
      <WorkspaceTopBar>
        <div className="stock-page-heading">
          <Link to="/#inventory" className="stock-back-link" aria-label="Back to Inventory"><ChevronLeft size={18} /></Link>
          <span className="stock-page-icon"><Database size={20} /></span>
          <div><h1>SKU Master</h1><p>Product codes &amp; marketplace mappings</p></div>
        </div>
      </WorkspaceTopBar>
      <main className="stock-page-content">
        <section className="stock-kpi-grid sku-master-overview" aria-label="SKU master overview">
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>SKU records</span><span className="dashboard-icon"><Database size={21} /></span></div>
            <strong>{loading ? "..." : rows.length.toLocaleString("en-IN")}</strong><p>Records in the master dictionary</p>
          </article>
          <article className="dashboard-stat">
            <div className="dashboard-card-top"><span>Product styles</span><span className="dashboard-icon blue"><Tag size={21} /></span></div>
            <strong>{loading ? "..." : new Set(rows.map(row => row.style).filter(Boolean)).size.toLocaleString("en-IN")}</strong><p>Distinct styles in the dictionary</p>
          </article>
          {activeSkuMaster ? (
            <section className="stock-import-panel sku-database-card" aria-label="Active master database">
              <div className="stock-import-heading"><span className="stock-import-icon"><FileSpreadsheet size={18} /></span><h2>Master spreadsheet</h2><span className="sku-database-status"><Check size={11} /> Active</span></div>
              <strong className="sku-database-name" title={activeSkuMaster}>{activeSkuMaster}</strong>
              <p className="sku-database-description">Current source for SKU mappings</p>
              <button type="button" onClick={handleDeleteMasterDatabase} disabled={deletingMaster || Boolean(editingKey) || loading} className="sku-delete-master"><Trash2 size={13} />{deletingMaster ? "Deleting..." : "Delete master database"}</button>
            </section>
          ) : (
            <section className="stock-import-panel" aria-labelledby="sku-upload-title">
              <div className="stock-import-heading"><span className="stock-import-icon"><Upload size={18} /></span><h2 id="sku-upload-title">Upload SKU master</h2><span className="stock-file-status">{uploadFile ? "File ready" : "Excel / CSV"}</span></div>
              <div className="stock-upload-field" data-ready={!!uploadFile}>
                <label className="stock-upload-label">
                  <input type="file" accept=".csv,.xlsx,.xls" className="stock-file-input" aria-label="Choose SKU master spreadsheet" disabled={uploading || loading || !!uploadFile} onChange={e => { setUploadFile(e.target.files?.[0] || null); e.target.value = ""; }} />
                  <span className="stock-file-icon"><FileSpreadsheet size={30} /></span>
                  <strong title={uploadFile?.name}>{uploadFile ? uploadFile.name : "Choose master spreadsheet"}</strong><span>{uploadFile ? "Ready to upload" : "XLSX, XLS or CSV"}</span>
                </label>
              </div>
              <div className="stock-import-footer">
                <button type="button" className="stock-clear-button" onClick={() => setUploadFile(null)} disabled={!uploadFile || uploading}><Trash2 size={14} /> Clear file</button>
                <button type="button" className="stock-preview-button" onClick={handleUploadSkuMaster} disabled={!uploadFile || uploading || loading}><Upload size={14} />{uploading ? "Uploading..." : "Upload master"}</button>
              </div>
            </section>
          )}
        </section>
        {loadError && <div className="sku-load-error" role="alert">{loadError}</div>}
        <section className="stock-table-panel" aria-label="SKU master records">
          <div className="stock-table-toolbar">
            <label className="stock-search sku-search"><Search size={16} /><input type="search" aria-label="Search SKU master" value={search} onChange={event => updateSearch(event.target.value)} placeholder="Search SKU, style, color, size..." /></label>
            <div className="stock-table-controls">
              {hasActiveFilters && <button type="button" onClick={clearAllFilters} className="sku-reset-filters">Reset filters</button>}
              <button type="button" onClick={handleExportCsv} disabled={rows.length === 0 || loading} className="stock-export-button"><Download size={14} /> Export CSV</button>
              <button type="button" onClick={addRow} disabled={Boolean(editingKey) || loading || uploading || deletingMaster} className="sku-add-button"><Plus size={15} /> Add SKU</button>
            </div>
          </div>
          <div className="sku-table-panel">
            <div className="sku-table-caption"><h2>SKU dictionary</h2><span>{visibleRows.length.toLocaleString("en-IN")} / {rows.length.toLocaleString("en-IN")} records</span></div>
            <div className="sku-table-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable SKU master table">
            <table className="glass-table stock-data-table sku-data-table">
              <thead className="sticky top-0 z-10 glass/95 backdrop-blur-md border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  {columns.map(col => (
                    <th key={col} className={col === "sku" ? "sku-code-column" : ""}>
                      <ExcelHeaderFilter
                        label={col === "sku" ? "SKU" : col.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}
                        columnKey={col}
                        values={uniqueValues[col] || []}
                        selectedValues={columnFilters[col] || []}
                        onFilterChange={(vals) => setColumnFilters(prev => ({...prev, [col]: vals}))}
                        sortField={sortField}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        align="left"
                      />
                    </th>
                  ))}
                  <th className="sku-actions-column">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="p-12 text-center text-slate-800 font-medium font-medium">
                      Loading SKU data...
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="p-12 text-center text-slate-800 font-medium font-medium">
                      {rows.length ? "No SKU records match the current filters." : "No SKU records yet. Upload a master spreadsheet or add a SKU."}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className="sku-data-row" data-editing={editingKey === rowKey(row)}
                    >
                      {columns.map(col => (
                        <td key={col} className="px-4 py-3 font-medium text-slate-700">
                          {renderTextCell(row, col)}
                        </td>
                      ))}
                      <td className="sku-actions-column">{renderActionsCell(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="sku-pagination">
              <span>Page {effectivePage} of {pageCount} ({visibleRows.length} total)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={effectivePage === 1}
                  className="sku-pagination-button"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={effectivePage === pageCount}
                  className="sku-pagination-button"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
          </div>
        </section>
      </main>
    </div>
  );
}
