const fs = require("fs");

const content = `import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Tag,
  Search,
  Upload,
  Layers,
  Palette,
  SlidersHorizontal,
  Save,
  Edit3,
  Check,
  RotateCcw,
} from "lucide-react";
import {
  downloadInventoryExcel,
  inventoryDownloadErrorMessage,
} from "../utils/downloadInventoryExcel.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

const DEFAULT_STICKER_COLORS = [
  "1 black",
  "2 white",
  "3 grey",
  "4 sandal",
  "5 navy",
  "6 pink",
  "7 brown",
  "8 olive",
];

const STORAGE_STYLES_KEY = "sticker_inventory_saved_styles";
const STORAGE_COLORS_KEY = "sticker_inventory_saved_colors";

function getSavedStyles() {
  try {
    const raw = localStorage.getItem(STORAGE_STYLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) {
    console.error("Failed to read saved styles from localStorage", e);
  }
  return null;
}

function getSavedColors() {
  try {
    const raw = localStorage.getItem(STORAGE_COLORS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) {
    console.error("Failed to read saved colors from localStorage", e);
  }
  return null;
}

function formatCellQty(qty) {
  if (qty === undefined || qty === null || qty === 0) return "-";
  return qty;
}

export default function StickerInventoryPage() {
  // Sidebar options from SKU Master
  const [sidebarOptions, setSidebarOptions] = useState({
    product_types: [],
    all_styles: [],
    colors: [],
  });
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Checked state for Sidebar (persisted in localStorage)
  const [checkedStyles, setCheckedStyles] = useState(new Set());
  const [checkedColors, setCheckedColors] = useState(new Set(DEFAULT_STICKER_COLORS));
  const [savedSnapshot, setSavedSnapshot] = useState({ styles: [], colors: [] });
  const [expandedProductTypes, setExpandedProductTypes] = useState(new Set());

  // Sidebar Edit Mode & Feedback
  const [isEditingSidebar, setIsEditingSidebar] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Search within sidebar
  const [productTypeSearch, setProductTypeSearch] = useState("");
  const [colorSearch, setColorSearch] = useState("");

  // Table Data state
  const [rows, setRows] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [stickerUploading, setStickerUploading] = useState(false);
  const [stickerDownloading, setStickerDownloading] = useState(false);
  const [editingCellId, setEditingCellId] = useState(null);
  const [editQty, setEditQty] = useState("");

  // Table Column Filters & Sorting
  const [sortField, setSortField] = useState("style");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedStylesFilter, setSelectedStylesFilter] = useState([]);
  const [stockCondition, setStockCondition] = useState("all");

  // Load Sidebar options & restore from localStorage
  const loadSidebarOptions = async () => {
    setLoadingOptions(true);
    try {
      const { data } = await axios.get(\`\${API_BASE}/sticker-sidebar-options\`);
      setSidebarOptions(data);

      const savedStyles = getSavedStyles();
      const savedColors = getSavedColors();

      let initialStyles = new Set();
      if (savedStyles && savedStyles.size > 0) {
        initialStyles = savedStyles;
      } else if (data.product_types && data.product_types.length > 0) {
        const firstMpt = data.product_types[0];
        setExpandedProductTypes(new Set([firstMpt.name]));
        firstMpt.styles.forEach((st) => initialStyles.add(st));
      } else if (data.all_styles && data.all_styles.length > 0) {
        data.all_styles.slice(0, 10).forEach((st) => initialStyles.add(st));
      }
      setCheckedStyles(initialStyles);

      let initialColors = new Set();
      if (savedColors && savedColors.size > 0) {
        initialColors = savedColors;
      } else {
        const standardColors = (data.colors || DEFAULT_STICKER_COLORS).filter((c) =>
          DEFAULT_STICKER_COLORS.includes(c),
        );
        if (standardColors.length > 0) {
          standardColors.forEach((c) => initialColors.add(c));
        } else if (data.colors && data.colors.length > 0) {
          data.colors.slice(0, 8).forEach((c) => initialColors.add(c));
        }
      }
      setCheckedColors(initialColors);

      setSavedSnapshot({
        styles: Array.from(initialStyles),
        colors: Array.from(initialColors),
      });
    } catch (error) {
      console.error("Failed to load sticker sidebar options", error);
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    loadSidebarOptions();
  }, []);

  // Load actual sticker inventory rows
  const loadStickerInventory = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(\`\${API_BASE}/sticker-inventory\`);
      setRows(data.rows ?? []);
    } catch (e) {
      console.error(e);
      alert("Failed to load sticker inventory");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStickerInventory();
  }, []);

  // Save Sidebar Selection to localStorage
  const handleSaveSidebarSelection = () => {
    const stylesArray = Array.from(checkedStyles);
    const colorsArray = Array.from(checkedColors);

    try {
      localStorage.setItem(STORAGE_STYLES_KEY, JSON.stringify(stylesArray));
      localStorage.setItem(STORAGE_COLORS_KEY, JSON.stringify(colorsArray));
      setSavedSnapshot({ styles: stylesArray, colors: colorsArray });
      setIsEditingSidebar(false);
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 2500);
    } catch (e) {
      console.error("Failed to save selection to localStorage", e);
      alert("Failed to save selection to browser storage.");
    }
  };

  // Cancel Sidebar edits
  const handleCancelSidebarEdit = () => {
    setCheckedStyles(new Set(savedSnapshot.styles));
    setCheckedColors(new Set(savedSnapshot.colors));
    setIsEditingSidebar(false);
  };

  // Build pivot rows strictly from user-checked styles and user-checked colors
  const { grouped, colors } = useMemo(() => {
    const activeStyles = Array.from(checkedStyles);
    const activeColors = Array.from(checkedColors);

    const existingMap = new Map();
    for (const r of rows) {
      const key = \`\${r.style.trim().toLowerCase()}\\x00\${r.color.trim().toLowerCase()}\`;
      existingMap.set(key, { id: r.id, qty: Number(r.qty || 0) });
    }

    const tableRows = [];

    for (const styleName of activeStyles) {
      const cells = {};
      let total = 0;

      for (const colorName of activeColors) {
        const key = \`\${styleName.trim().toLowerCase()}\\x00\${colorName.trim().toLowerCase()}\`;
        const found = existingMap.get(key);
        const qty = found ? found.qty : 0;
        cells[colorName] = {
          id: found ? found.id : null,
          style: styleName,
          color: colorName,
          qty,
        };
        total += qty;
      }

      tableRows.push({
        style: styleName,
        cells,
        total,
      });
    }

    return { grouped: tableRows, colors: activeColors };
  }, [rows, checkedStyles, checkedColors]);

  // Sidebar toggle helpers
  const toggleStyle = (styleName) => {
    if (!isEditingSidebar) return;
    setCheckedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(styleName)) {
        next.delete(styleName);
      } else {
        next.add(styleName);
      }
      return next;
    });
  };

  const toggleProductType = (mpt) => {
    if (!isEditingSidebar) return;
    const allStylesInMpt = mpt.styles;
    const allChecked = allStylesInMpt.every((st) => checkedStyles.has(st));

    setCheckedStyles((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        allStylesInMpt.forEach((st) => next.delete(st));
      } else {
        allStylesInMpt.forEach((st) => next.add(st));
      }
      return next;
    });
  };

  const toggleColor = (colorName) => {
    if (!isEditingSidebar) return;
    setCheckedColors((prev) => {
      const next = new Set(prev);
      if (next.has(colorName)) {
        next.delete(colorName);
      } else {
        next.add(colorName);
      }
      return next;
    });
  };

  const selectAllStyles = () => {
    if (!isEditingSidebar) return;
    setCheckedStyles(new Set(sidebarOptions.all_styles));
  };

  const deselectAllStyles = () => {
    if (!isEditingSidebar) return;
    setCheckedStyles(new Set());
  };

  const selectAllColors = () => {
    if (!isEditingSidebar) return;
    setCheckedColors(new Set(sidebarOptions.colors));
  };

  const selectDefaultColors = () => {
    if (!isEditingSidebar) return;
    setCheckedColors(new Set(DEFAULT_STICKER_COLORS));
  };

  const deselectAllColors = () => {
    if (!isEditingSidebar) return;
    setCheckedColors(new Set());
  };

  const toggleAccordion = (name) => {
    setExpandedProductTypes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Save Sticker Cell Qty
  const saveStickerQty = async (id) => {
    const qty = parseInt(editQty, 10);
    if (Number.isNaN(qty) || qty < 0) {
      alert("Enter a valid non-negative quantity");
      return;
    }

    try {
      await axios.patch(
        \`\${API_BASE}/sticker-inventory/\${id}\`,
        { qty },
        { headers: getAdminKeyHeader() },
      );
      setEditingCellId(null);
      await loadStickerInventory();
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.detail;
      alert(
        typeof msg === "string"
          ? msg
          : "Save failed. Set VITE_ADMIN_KEY in frontend .env to match server ADMIN_API_KEY.",
      );
    }
  };

  // Upload Sticker Excel
  const uploadStickerFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStickerUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name || "sticker-inventory.xlsx");
      const { data } = await axios.post(
        \`\${API_BASE}/upload-sticker-inventory\`,
        formData,
        { headers: getAdminKeyHeader() },
      );
      await loadStickerInventory();
      await loadSidebarOptions();

      const unmatchedMessage = data.unmatched_count
        ? \` \${data.unmatched_count} style row(s) did not match existing sticker inventory.\`
        : "";
      alert(
        \`\${data.message}. Added \${data.total_added ?? 0} stickers across \${data.updated_cells ?? 0} color cells.\${unmatchedMessage}\`,
      );
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.detail || "Sticker upload failed");
    } finally {
      setStickerUploading(false);
    }
  };

  const downloadStickerInventory = async () => {
    setStickerDownloading(true);
    try {
      await downloadInventoryExcel(
        "sticker",
        "",
        "sticker_inventory.xlsx",
      );
    } catch (error) {
      console.error(error);
      alert(await inventoryDownloadErrorMessage(error));
    } finally {
      setStickerDownloading(false);
    }
  };

  // Filter & sort rows
  const filteredAndSortedRows = useMemo(() => {
    let list = [...grouped];

    if (selectedStylesFilter.length > 0 && selectedStylesFilter.length < checkedStyles.size) {
      list = list.filter((r) => selectedStylesFilter.includes(r.style));
    }

    if (stockCondition === "in_stock") {
      list = list.filter((row) => row.total > 0);
    } else if (stockCondition === "zero_stock") {
      list = list.filter((row) => row.total === 0);
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "style") {
        comparison = a.style.localeCompare(b.style);
      } else if (sortField === "total") {
        comparison = a.total - b.total;
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [grouped, selectedStylesFilter, checkedStyles, stockCondition, sortField, sortAsc]);

  const handleSort = (field, asc) => {
    setSortField(field);
    setSortAsc(asc);
  };

  const grandTotal = useMemo(
    () => filteredAndSortedRows.reduce((sum, r) => sum + r.total, 0),
    [filteredAndSortedRows],
  );

  // Filtered product types for sidebar search
  const filteredProductTypes = useMemo(() => {
    if (!productTypeSearch.trim()) return sidebarOptions.product_types;
    const term = productTypeSearch.trim().toLowerCase();
    return sidebarOptions.product_types
      .map((mpt) => ({
        ...mpt,
        styles: mpt.styles.filter(
          (st) => st.toLowerCase().includes(term) || mpt.name.toLowerCase().includes(term),
        ),
      }))
      .filter((mpt) => mpt.styles.length > 0);
  }, [sidebarOptions.product_types, productTypeSearch]);

  // Filtered colors for sidebar search
  const filteredColors = useMemo(() => {
    if (!colorSearch.trim()) return sidebarOptions.colors;
    const term = colorSearch.trim().toLowerCase();
    return sidebarOptions.colors.filter((c) => c.toLowerCase().includes(term));
  }, [sidebarOptions.colors, colorSearch]);

  const colSpan = 2 + colors.length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <ChevronLeft size={16} />
              Home
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Tag size={20} className="text-[#0F2137]" />
                Sticker Inventory
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Detailed DTF Sticker quantity
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadStickerInventory}
              disabled={stickerDownloading || filteredAndSortedRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <Download size={14} />
              {stickerDownloading ? "Downloading..." : "Export Excel"}
            </button>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-[#1E3A66] hover:to-[#0F2137] transition disabled:opacity-50">
              <Upload size={14} />
              {stickerUploading ? "Uploading..." : "Upload Stickers"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={stickerUploading}
                onChange={uploadStickerFile}
              />
            </label>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar on Left + Table on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-slate-200/80 bg-white flex flex-col shrink-0 h-[calc(100vh-73px)] overflow-hidden shadow-xs">
          {/* Sidebar Top Header with Edit & Save Buttons */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-[#0F2137]" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  SKU Master Filters
                </span>
              </div>
              <span className="rounded bg-[#0F2137]/10 px-2 py-0.5 text-[11px] font-bold text-[#0F2137]">
                {checkedStyles.size} Styles · {checkedColors.size} Colors
              </span>
            </div>

            {/* Edit & Save Button Controls */}
            <div className="flex items-center gap-2">
              {isEditingSidebar ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveSidebarSelection}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:from-emerald-700 hover:to-teal-800 transition"
                  >
                    <Save size={14} />
                    Save Selection
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSidebarEdit}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-xs transition"
                  >
                    <RotateCcw size={13} />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingSidebar(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-3 py-2 text-xs font-bold text-white shadow-sm hover:from-[#1E3A66] hover:to-[#0F2137] transition"
                >
                  <Edit3 size={14} />
                  Edit Selection
                </button>
              )}
            </div>

            {/* Save Success Alert Banner */}
            {saveSuccessMsg && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 animate-fadeIn">
                <Check size={13} className="text-emerald-600" />
                Selection saved! Persisted across refreshes.
              </div>
            )}

            {!isEditingSidebar && !saveSuccessMsg && (
              <p className="text-[10px] text-slate-400 font-medium">
                Click &ldquo;Edit Selection&rdquo; to modify active styles &amp; colors.
              </p>
            )}
          </div>

          {/* Scrollable Sidebar Filters */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Section 1: Main Product Types & Styles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <Layers size={14} className="text-slate-500" />
                  <span>Main Product Types &amp; Styles</span>
                </div>
                {isEditingSidebar && (
                  <div className="flex gap-2 text-[10px] font-bold text-[#0F2137]">
                    <button type="button" onClick={selectAllStyles} className="hover:underline">
                      All
                    </button>
                    <span>·</span>
                    <button type="button" onClick={deselectAllStyles} className="text-slate-400 hover:text-slate-700">
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Product Type Search Box */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={productTypeSearch}
                  onChange={(e) => setProductTypeSearch(e.target.value)}
                  placeholder="Filter product types or styles..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs outline-none focus:border-[#0F2137] focus:bg-white"
                />
              </div>

              {/* Product Types Tree List */}
              {loadingOptions ? (
                <div className="py-4 text-center text-xs text-slate-400">Loading SKU options...</div>
              ) : filteredProductTypes.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-400">No product types match</div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredProductTypes.map((mpt) => {
                    const isExpanded = expandedProductTypes.has(mpt.name) || Boolean(productTypeSearch.trim());
                    const allMptStylesChecked = mpt.styles.length > 0 && mpt.styles.every((st) => checkedStyles.has(st));
                    const someMptStylesChecked = mpt.styles.some((st) => checkedStyles.has(st));

                    return (
                      <div key={mpt.name} className="rounded-lg border border-slate-100 bg-slate-50/40 p-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className={\`flex items-center gap-2 text-xs font-bold text-slate-800 flex-1 min-w-0 \${isEditingSidebar ? "cursor-pointer" : "cursor-default"}\`}>
                            <input
                              type="checkbox"
                              disabled={!isEditingSidebar}
                              checked={allMptStylesChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = !allMptStylesChecked && someMptStylesChecked;
                              }}
                              onChange={() => toggleProductType(mpt)}
                              className="rounded border-slate-300 text-[#0F2137] focus:ring-0 disabled:opacity-60"
                            />
                            <span className="truncate" title={mpt.name}>
                              {mpt.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({mpt.styles.length})
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => toggleAccordion(mpt.name)}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-1.5 pl-6 space-y-1 border-l-2 border-slate-200 ml-2">
                            {mpt.styles.map((styleCode) => {
                              const isChecked = checkedStyles.has(styleCode);
                              return (
                                <label
                                  key={styleCode}
                                  className={\`flex items-center gap-2 text-xs text-slate-700 py-0.5 \${isEditingSidebar ? "cursor-pointer hover:text-slate-900" : "cursor-default"}\`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!isEditingSidebar}
                                    checked={isChecked}
                                    onChange={() => toggleStyle(styleCode)}
                                    className="rounded border-slate-300 text-[#0F2137] focus:ring-0 disabled:opacity-60"
                                  />
                                  <span className="truncate font-medium">{styleCode}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 2: Colors */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <Palette size={14} className="text-slate-500" />
                  <span>Colors ({checkedColors.size}/{sidebarOptions.colors.length})</span>
                </div>
                {isEditingSidebar && (
                  <div className="flex gap-2 text-[10px] font-bold text-[#0F2137]">
                    <button type="button" onClick={selectDefaultColors} className="hover:underline">
                      Core 8
                    </button>
                    <span>·</span>
                    <button type="button" onClick={selectAllColors} className="hover:underline">
                      All
                    </button>
                    <span>·</span>
                    <button type="button" onClick={deselectAllColors} className="text-slate-400 hover:text-slate-700">
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Color Search Box */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={colorSearch}
                  onChange={(e) => setColorSearch(e.target.value)}
                  placeholder="Filter colors..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs outline-none focus:border-[#0F2137] focus:bg-white"
                />
              </div>

              {/* Colors List */}
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {filteredColors.map((colorName) => {
                  const isChecked = checkedColors.has(colorName);
                  return (
                    <label
                      key={colorName}
                      className={\`flex items-center gap-2 px-2 py-1 rounded-md text-xs text-slate-700 font-medium \${isEditingSidebar ? "cursor-pointer hover:bg-slate-50" : "cursor-default"}\`}
                    >
                      <input
                        type="checkbox"
                        disabled={!isEditingSidebar}
                        checked={isChecked}
                        onChange={() => toggleColor(colorName)}
                        className="rounded border-slate-300 text-[#0F2137] focus:ring-0 disabled:opacity-60"
                      />
                      <span className="truncate capitalize">{colorName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area / Table */}
        <main className="flex-1 p-6 overflow-auto space-y-4">
          {/* Quick Info & Active Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span>Showing:</span>
              <span className="rounded bg-white border border-slate-200 px-2.5 py-1 text-slate-900 shadow-xs">
                {filteredAndSortedRows.length} Styles
              </span>
              <span>({checkedStyles.size} Styles × {checkedColors.size} Colors)</span>
            </div>

            {selectedStylesFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStylesFilter([])}
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
              >
                Clear Column Filters
              </button>
            )}
          </div>

          {/* Clean Modern Square Table Container */}
          <section className="bg-white shadow-sm overflow-hidden border-none">
            <div className="max-h-[calc(100vh-210px)] overflow-auto">
              <table className="w-full text-center text-sm border-none">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <tr>
                    {/* Style Header with Excel Filter */}
                    <th className="px-4 py-3 text-left min-w-[200px]">
                      <ExcelHeaderFilter
                        label="Style"
                        columnKey="style"
                        values={Array.from(checkedStyles)}
                        selectedValues={selectedStylesFilter}
                        onFilterChange={setSelectedStylesFilter}
                        sortField={sortField}
                        sortAsc={sortAsc}
                        onSort={handleSort}
                        align="left"
                      />
                    </th>

                    {/* Color Headers (Columns) */}
                    {colors.map((color) => (
                      <th key={color} className="px-3 py-3 min-w-[75px] font-bold text-slate-600">
                        {color}
                      </th>
                    ))}

                    {/* Total Header with Stock Filter */}
                    <th className="px-4 py-3 min-w-[110px] text-right">
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
                  {checkedStyles.size === 0 || checkedColors.size === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-20 text-center text-slate-500 font-medium">
                        <div className="max-w-md mx-auto space-y-2">
                          <SlidersHorizontal size={28} className="mx-auto text-slate-400" />
                          <p className="text-sm font-bold text-slate-700">
                            No styles or colors selected
                          </p>
                          <p className="text-xs text-slate-400">
                            Click &ldquo;Edit Selection&rdquo; on the left sidebar to select the desired Main Product Types and Colors, then click &ldquo;Save Selection&rdquo;.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAndSortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-16 text-center text-slate-500 font-medium">
                        No matching sticker stock rows found for current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedRows.map((row) => (
                      <tr
                        key={row.style}
                        className="hover:bg-slate-50/80 transition group"
                      >
                        <td className="px-4 py-3 text-left font-bold text-slate-900" title={row.style}>
                          {row.style}
                        </td>
                        
                        {colors.map((color) => {
                          const cell = row.cells[color];
                          const isEditing = cell && editingCellId === cell.id;

                          return (
                            <td key={color} className="px-3 py-3 tabular-nums text-xs">
                              {!cell ? (
                                <span className="text-slate-400">-</span>
                              ) : isEditing ? (
                                <div className="flex flex-col items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={editQty}
                                    onChange={(e) => setEditQty(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        saveStickerQty(cell.id);
                                      }
                                    }}
                                    className="w-16 rounded border border-[#0F2137] bg-white px-1.5 py-0.5 text-center text-xs font-bold text-slate-900 outline-none"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => saveStickerQty(cell.id)}
                                      className="text-[#0F2137] text-[10px] font-extrabold hover:underline"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCellId(null)}
                                      className="text-slate-400 text-[10px]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCellId(cell.id);
                                    setEditQty(String(cell.qty));
                                  }}
                                  className={\`w-full py-0.5 rounded transition font-semibold \${
                                    cell.qty > 0
                                      ? "text-slate-900 font-bold hover:bg-slate-100"
                                      : "text-slate-400 hover:text-slate-700"
                                  }\`}
                                  title="Click to edit quantity"
                                >
                                  {formatCellQty(cell.qty)}
                                </button>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">
                          {formatCellQty(row.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {/* Table Footer Totals */}
                {filteredAndSortedRows.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-900">
                    <tr>
                      <td className="px-4 py-3 text-left uppercase tracking-wider text-slate-600">
                        Total ({filteredAndSortedRows.length} rows)
                      </td>
                      {colors.map((color) => {
                        const colTotal = filteredAndSortedRows.reduce(
                          (sum, r) => sum + Number(r.cells[color]?.qty || 0),
                          0,
                        );
                        return (
                          <td key={\`total-\${color}\`} className="px-3 py-3 tabular-nums text-slate-700 font-bold">
                            {colTotal || "-"}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right tabular-nums text-sm font-black text-emerald-800">
                        {grandTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
\`;

fs.writeFileSync("src/pages/StickerInventoryPage.jsx", content);
console.log("Done");
