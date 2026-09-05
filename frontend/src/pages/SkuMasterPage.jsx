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
        <input
          value={draftRow[field] || ""}
          onChange={(event) => updateDraftRow(field, event.target.value)}
          className="w-full min-w-24 rounded border border-[#0F2137] bg-white px-2.5 py-1 text-xs outline-none focus:border-[#0F2137]"
        />
      );
    }
    return <span className="whitespace-nowrap font-medium">{row[field] || "-"}</span>;
  };

  const renderPiecesCell = (row) => {
    if (editingKey === rowKey(row) && draftRow) {
      return (
        <div className="space-y-2">
          {(draftRow.pieces || []).map((piece, index) => (
            <div key={piece.id || index} className="flex items-center gap-2">
              <input
                value={piece.color || ""}
                onChange={(event) => updateDraftPiece(index, "color", event.target.value)}
                placeholder="Color"
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
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
          <span key={piece.id || `${piece.color}-${piece.qty}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
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
        <input
          value={val}
          onChange={(event) => updateDraftPiece(index, "color", event.target.value)}
          className="w-full min-w-16 rounded border border-[#0F2137] bg-white px-2 py-1 text-xs outline-none focus:border-[#0F2137]"
        />
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
        <div className="flex justify-end gap-1">
          <button type="button" title="Cancel" onClick={cancelEdit} disabled={isSaving} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            <X size={16} />
          </button>
          <button type="button" title="Save" onClick={saveRow} disabled={isSaving} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            <Save size={16} />
          </button>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" title="Edit SKU" onClick={() => startEdit(row)} disabled={Boolean(editingKey) || isSaving} className="rounded p-1 text-[#0F2137] hover:bg-slate-100 disabled:opacity-40">
          <Edit3 size={15} />
        </button>
        <button type="button" title="Delete SKU" onClick={() => removeRow(row)} disabled={Boolean(editingKey) || isSaving} className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40">
          <Trash2 size={15} />
        </button>
      </div>
    );
  };

  const clearAllFilters = () => {
    setColumnFilters({});
  };

  const hasActiveFilters = Boolean(search || Object.values(columnFilters).some(arr => arr && arr.length > 0));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-[98%] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/#inventory"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <ChevronLeft size={16} />
              Inventory
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Database size={20} className="text-[#0F2137]" />
                SKU Master Dictionary
              </h1>
              <p className="text-xs text-slate-500 font-medium">{rows.length} SKU records in dictionary</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <Download size={14} />
              Export Master (CSV)
            </button>

            {activeSkuMaster && (
              <button
                type="button"
                onClick={handleDeleteMasterDatabase}
                disabled={deletingMaster}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition shadow-xs"
              >
                <Trash2 size={14} />
                {deletingMaster ? "Deleting..." : "Delete Master Database"}
              </button>
            )}

            <button
              type="button"
              onClick={addRow}
              disabled={Boolean(editingKey)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-2 text-xs font-bold text-white hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50 transition shadow-sm"
            >
              <Plus size={15} />
              Add SKU
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[98%] px-6 py-6 space-y-4">
        {/* Conditional Active Database Status or Upload Dropzone */}
        {activeSkuMaster ? (
          <div className="bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-200">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Database File:</span>
                  <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-extrabold">
                    Active
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                  {activeSkuMaster}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4 border-2 border-dashed border-slate-300">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-[#0F2137] border border-[#0F2137]/20">
                <Upload size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Database Status:</span>
                  <span className="rounded bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-extrabold">
                    No Database Loaded
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload an Excel/CSV spreadsheet to populate master SKU mappings.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-slate-300/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs">
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <span className="truncate max-w-[200px] inline-block">
                  {uploadFile ? uploadFile.name : "Select Spreadsheet File"}
                </span>
              </label>

              <button
                type="button"
                onClick={handleUploadSkuMaster}
                disabled={!uploadFile || uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2137] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40 transition shadow-xs"
              >
                <Upload size={14} />
                {uploading ? "Uploading..." : "Upload Spreadsheet"}
              </button>
            </div>
          </div>
        )}

        {(rows.length > 0 || loading) && (
          <>
          {/* Search Bar & Stats */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-md items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-3.5 py-2 shadow-xs backdrop-blur-md flex-1">
            <Search size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Search SKU, style, color, size..."
              className="w-full bg-transparent text-xs font-medium outline-none text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
              >
                Reset Column Filters
              </button>
            )}
            <span className="rounded-xl bg-white/90 border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs">
              Showing {visibleRows.length} of {rows.length} records
            </span>
          </div>
        </div>

        {/* Clean Modern Square Table Container */}
        <section className="bg-white shadow-sm overflow-hidden">
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="min-w-full text-left text-sm border-none">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  {columns.map(col => (
                    <th key={col} className="px-4 py-3 min-w-[110px]">
                      <ExcelHeaderFilter 
                        label={col.replace(/_/g, " ").toUpperCase()} 
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
                  <th className="w-20 px-4 py-3 text-center font-bold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">
                      Loading SKU data...
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">
                      No SKU records match the current filters.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className="group hover:bg-slate-50/80 transition"
                    >
                      {columns.map(col => (
                        <td key={col} className="px-4 py-3 font-medium text-slate-700">
                          {renderTextCell(row, col)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">{renderActionsCell(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 text-xs text-slate-600 font-medium">
              <span>Page {effectivePage} of {pageCount} ({visibleRows.length} total)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={effectivePage === 1}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 shadow-xs"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={effectivePage === pageCount}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 shadow-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      
          </>
        )}
      </main>
    </div>
  );
}
