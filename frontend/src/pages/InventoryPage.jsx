import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Warehouse,
  Search,
  Upload,
  Layers,
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
import {
  clearInventoryCache,
  readInventoryCache,
  writeInventoryCache,
} from "../utils/inventoryCache.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

const SIZE_ORDER_MAP = {
  "S": 1, "S": 2, "S": 3, "M": 4, "L": 5, "L": 6,
  "L": 7, "2L": 7, "3L": 8, "4L": 9, "5L": 10
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

const STORAGE_STYLES_KEY = "return_inventory_saved_styles";
const STORAGE_SIZES_KEY = "return_inventory_saved_sizes";
const STORAGE_COLORS_KEY = "return_inventory_saved_colors";

function getSavedStyles() {
  try {
    const raw = localStorage.getItem(STORAGE_STYLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) {
    console.error("Failed to read saved return styles from localStorage", e);
  }
  return null;
}

function getSavedSizes() {
  try {
    const raw = localStorage.getItem(STORAGE_SIZES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) { console.error(e); }
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
    console.error("Failed to read saved return colors from localStorage", e);
  }
  return null;
}

function formatCellQty(qty) {
  if (qty === undefined || qty === null || qty === 0) return "-";
  return qty;
}

export default function InventoryPage() {
  // Sidebar options from SKU Master
  const [sidebarOptions, setSidebarOptions] = useState({
    product_types: [],
    all_styles: [],
    colors: [], sizes: [],
  });
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Checked state for Sidebar (persisted in localStorage)
  const [checkedStyles, setCheckedStyles] = useState(new Set());
  const [checkedColors, setCheckedColors] = useState(new Set(DEFAULT_STICKER_COLORS));
  const [checkedSizes, setCheckedSizes] = useState(new Set());
  const [savedSnapshot, setSavedSnapshot] = useState({ styles: [], colors: [], sizes: [] });
  const [expandedProductTypes, setExpandedProductTypes] = useState(new Set());

  // Sidebar Edit Mode & Feedback
  const [isEditingSidebar, setIsEditingSidebar] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Search within sidebar
  const [productTypeSearch, setProductTypeSearch] = useState("");
  const [colorSearch, setColorSearch] = useState("");
  const [sizeSearch, setSizeSearch] = useState("");
    
  // Table Data state
  const [inventoryRows, setInventoryRows] = useState(() => readInventoryCache("return")?.rows ?? []);
  const ALL_SIZES = useMemo(() => getSortedSizes(inventoryRows), [inventoryRows]);
  const SIZES = useMemo(() => ALL_SIZES.filter((s) => checkedSizes.has(s)), [ALL_SIZES, checkedSizes]);
  const styleOptionMap = useMemo(() => {
    const entries = (sidebarOptions.style_options || []).map((opt) => [
      String(opt.style || "").trim().toLowerCase(),
      opt,
    ]);
    return new Map(entries);
  }, [sidebarOptions.style_options]);
  const selectedStyleList = useMemo(() => Array.from(checkedStyles), [checkedStyles]);
  const availableColors = useMemo(() => {
    const colors = new Set();
    for (const styleName of selectedStyleList) {
      const opt = styleOptionMap.get(styleName.trim().toLowerCase());
      (opt?.colors || []).forEach((color) => colors.add(color));
    }
    return Array.from(colors).sort((a, b) => a.localeCompare(b));
  }, [selectedStyleList, styleOptionMap]);
  const availableSizes = useMemo(() => {
    const sizes = new Set();
    for (const styleName of selectedStyleList) {
      const opt = styleOptionMap.get(styleName.trim().toLowerCase());
      (opt?.sizes || []).forEach((size) => sizes.add(size));
    }
    return Array.from(sizes).sort((a, b) => {
      const valA = SIZE_ORDER_MAP[a] || 99;
      const valB = SIZE_ORDER_MAP[b] || 99;
      if (valA !== valB) return valA - valB;
      return a.localeCompare(b);
    });
  }, [selectedStyleList, styleOptionMap]);
  
    const [returnsUploading, setReturnsUploading] = useState(false);
  const [inventoryDownloading, setInventoryDownloading] = useState(false);
  const [editingCellId, setEditingCellId] = useState(null);
  const [editQty, setEditQty] = useState("");

  // Table Column Filters & Sorting
  const [sortField, setSortField] = useState("style");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedStylesFilter, setSelectedStylesFilter] = useState([]);
  const [selectedColorsFilter, setSelectedColorsFilter] = useState([]);
  const [stockCondition, setStockCondition] = useState("all");

  // Load Sidebar options & restore from localStorage
  const loadSidebarOptions = async () => {
    setLoadingOptions(true);
    try {
      const { data } = await axios.get(`${API_BASE}/sticker-sidebar-options`);
      setSidebarOptions(data);

      const savedStyles = getSavedStyles();
      const savedColors = getSavedColors();
      const savedSizes = getSavedSizes();

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
      let initialSizes = new Set();
      if (savedSizes && savedSizes.size > 0) {
        initialSizes = savedSizes;
      } else if (data.sizes && data.sizes.length > 0) {
        data.sizes.forEach((s) => initialSizes.add(s));
      }
      setCheckedSizes(initialSizes);


      setSavedSnapshot({
        styles: Array.from(initialStyles),
        colors: Array.from(initialColors),
      });
    } catch (error) {
      console.error("Failed to load return sidebar options", error);
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    loadSidebarOptions();
  }, []);

  // Load actual return inventory rows
  const loadReturnInventory = async ({ forceRefresh = false } = {}) => {
    const cached = readInventoryCache("return");
    if (cached && !forceRefresh) {
      setInventoryRows(cached.rows ?? []);
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/return-inventory`);
      const rows = data.rows ?? [];
      setInventoryRows(rows);
      writeInventoryCache("return", rows);
    } catch (e) {
      console.error(e);
      alert("Failed to load return inventory");
      setInventoryRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReturnInventory();
  }, []);

  // Save Sidebar Selection to localStorage
  const handleSaveSidebarSelection = () => {
    const stylesArray = Array.from(checkedStyles);
    const colorsArray = Array.from(checkedColors);
    const sizesArray = Array.from(checkedSizes);

    try {
      localStorage.setItem(STORAGE_STYLES_KEY, JSON.stringify(stylesArray));
      localStorage.setItem(STORAGE_COLORS_KEY, JSON.stringify(colorsArray));
      localStorage.setItem(STORAGE_SIZES_KEY, JSON.stringify(sizesArray));
      setSavedSnapshot({ styles: stylesArray, colors: colorsArray, sizes: sizesArray });
      setIsEditingSidebar(false);
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 2500);
    } catch (e) {
      console.error("Failed to save return selection to localStorage", e);
      alert("Failed to save selection to browser storage.");
    }
  };

  // Cancel Sidebar edits
  const handleCancelSidebarEdit = () => {
    setCheckedStyles(new Set(savedSnapshot.styles));
    setCheckedColors(new Set(savedSnapshot.colors));
    setCheckedSizes(new Set(savedSnapshot.sizes));
    setIsEditingSidebar(false);
  };

  // Build pivot rows from selected styles and SKU master availability
  const pivotTableData = useMemo(() => {
    // Map existing rows by (style, color, size)
    const existingMap = new Map();
    for (const r of inventoryRows) {
      const key = `${r.style.trim().toLowerCase()}\x00${r.color.trim().toLowerCase()}\x00${String(r.size || "").toUpperCase().trim()}`;
      existingMap.set(key, { id: r.id, qty: Number(r.qty || 0) });
    }

    const tableRows = [];

    for (const styleName of selectedStyleList) {
      const styleOpt = styleOptionMap.get(styleName.trim().toLowerCase());
      const styleColors = styleOpt?.colors || [];

      for (const colorName of styleColors) {
        const cells = {};
        let total = 0;

        for (const size of availableSizes) {
          const key = `${styleName.trim().toLowerCase()}\x00${colorName.trim().toLowerCase()}\x00${size}`;
          const found = existingMap.get(key);
          const qty = found ? found.qty : 0;
          cells[size] = {
            id: found ? found.id : null,
            style: styleName,
            color: colorName,
            size,
            qty,
          };
          total += qty;
        }

        tableRows.push({
          style: styleName,
          color: colorName,
          displayColor: colorName,
          cells,
          total,
        });
      }
    }

    return tableRows;
  }, [inventoryRows, selectedStyleList, styleOptionMap, availableSizes]);

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

  const handleUpdateSizes = (nextSizes) => {
    if (!isEditingSidebar) return;
    setCheckedSizes(nextSizes);
  };

  const toggleSize = (size) => {
    if (!isEditingSidebar) return;
    setCheckedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) {
        next.delete(size);
      } else {
        next.add(size);
      }
      return next;
    });
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

  // Upsert return cell quantity
  const saveReturnCell = async (id) => {
    const qty = parseInt(editQty, 10);
    if (Number.isNaN(qty) || qty < 0) {
      alert("Enter a valid non-negative quantity");
      return;
    }

    try {
      await axios.patch(
        `${API_BASE}/return-inventory/${id}`,
        { qty },
        { headers: getAdminKeyHeader() },
      );
      setEditingCellId(null);
      await loadReturnInventory({ forceRefresh: true });
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail;
      alert(
        typeof msg === "string"
          ? msg
          : "Save failed. Set VITE_ADMIN_KEY in frontend .env to match server ADMIN_API_KEY.",
      );
    }
  };

  // Upload Return Inventory (Excel)
  const uploadReturnsFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setReturnsUploading(true);
      const formData = new FormData();
      formData.append("file", file, file.name || "return-inventory.xlsx");
      const { data } = await axios.post(
        `${API_BASE}/upload-returns`,
        formData,
        {
          headers: {
            ...getAdminKeyHeader(),
            "Content-Type": "multipart/form-data",
          },
        },
      );
      clearInventoryCache("return");
      await loadReturnInventory({ forceRefresh: true });
      await loadSidebarOptions();
      alert(
        `${data.message}. Added ${data.total_added ?? 0} pieces across ${data.updated_cells ?? 0} size cells.`,
      );
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.detail || "Return upload failed");
    } finally {
      setReturnsUploading(false);
    }
  };

  const downloadReturnInventory = async () => {
    setInventoryDownloading(true);
    try {
      await downloadInventoryExcel(
        "return",
        "",
        "return_inventory.xlsx",
      );
    } catch (error) {
      console.error(error);
      alert(await inventoryDownloadErrorMessage(error));
    } finally {
      setInventoryDownloading(false);
    }
  };

  // Filter & sort rows
  const filteredAndSortedRows = useMemo(() => {
    let list = [...pivotTableData];

    if (selectedStylesFilter.length > 0 && selectedStylesFilter.length < checkedStyles.size) {
      list = list.filter((r) => selectedStylesFilter.includes(r.style));
    }

    if (selectedColorsFilter.length > 0 && selectedColorsFilter.length < checkedColors.size) {
      list = list.filter((r) => selectedColorsFilter.includes(r.displayColor));
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
      } else if (sortField === "color") {
        comparison = a.displayColor.localeCompare(b.displayColor);
      } else if (sortField === "total") {
        comparison = a.total - b.total;
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [pivotTableData, selectedStylesFilter, checkedStyles, selectedColorsFilter, checkedColors, stockCondition, sortField, sortAsc]);

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

  // Filtered sizes for sidebar search
  const filteredSizes = useMemo(() => {
    if (!sizeSearch.trim()) return sidebarOptions.sizes || [];
    const term = sizeSearch.toLowerCase();
    return (sidebarOptions.sizes || []).filter((s) => s.toLowerCase().includes(term));
  }, [sidebarOptions.sizes, sizeSearch]);

  // Filtered colors for sidebar search
  const filteredColors = useMemo(() => {
    if (!colorSearch.trim()) return sidebarOptions.colors;
    const term = colorSearch.trim().toLowerCase();
    return sidebarOptions.colors.filter((c) => c.toLowerCase().includes(term));
  }, [sidebarOptions.colors, colorSearch]);

  const colSpan = 3 + availableSizes.length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-4 px-6 py-4">
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
                <Warehouse size={20} className="text-[#0F2137]" />
                Return Inventory
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Customer returns breakdown by style, color, size, and available pieces.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadReturnInventory}
              disabled={inventoryDownloading || filteredAndSortedRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <Download size={14} />
              {inventoryDownloading ? "Downloading..." : "Export Excel"}
            </button>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-2 text-xs font-bold text-white shadow-sm hover:from-[#1E3A66] hover:to-[#0F2137] transition disabled:opacity-50">
              <Upload size={14} />
              {returnsUploading ? "Uploading..." : "Upload Return Inventory (Excel)"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={returnsUploading}
                onChange={uploadReturnsFile}
              />
            </label>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar on Left + Table on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-[320px] bg-slate-50/60 border-r border-slate-200/60 backdrop-blur-xl flex flex-col shrink-0 h-[calc(100vh-73px)] shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] relative z-20">
          {/* Sidebar Top Header with Edit & Save Buttons */}
          <div className="p-5 border-b border-slate-200/80 bg-white/40 backdrop-blur-md space-y-4 shadow-sm z-10 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#0F2137] to-[#1E3A66] text-white shadow-sm">
                  <SlidersHorizontal size={14} />
                </div>
                <span className="text-[13px] font-black uppercase tracking-widest text-slate-800">
                  Filters
                </span>
              </div>
              <span className="rounded-full bg-slate-200/80 px-2.5 py-1 text-[10px] font-extrabold text-slate-700 shadow-xs border border-slate-300/50">
                {checkedStyles.size} Styles
              </span>
            </div>

            {/* Edit & Save Button Controls */}
            <div className="flex flex-col gap-2.5">
              {isEditingSidebar ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelSidebarEdit}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300/80 bg-white/80 backdrop-blur px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 shadow-xs transition-all active:scale-95"
                  >
                    <RotateCcw size={14} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSidebarSelection}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)] hover:from-emerald-600 hover:to-emerald-800 transition-all active:scale-95 border border-emerald-600/50"
                  >
                    <Save size={14} />
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingSidebar(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-800 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-slate-200/80 hover:border-[#0F2137]/30 hover:shadow-[0_4px_12px_-4px_rgba(15,33,55,0.15)] transition-all active:scale-[0.98] group"
                >
                  <Edit3 size={15} className="text-slate-400 group-hover:text-[#0F2137] transition-colors" />
                  Edit Active Inventory
                </button>
              )}
            </div>

            {/* Save Success Alert Banner */}
            {saveSuccessMsg && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50/80 backdrop-blur border border-emerald-200/80 px-3 py-2 text-[11px] font-bold text-emerald-800 animate-in slide-in-from-top-2 fade-in duration-300 shadow-xs">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-200/50">
                  <Check size={12} className="text-emerald-700" />
                </div>
                Selection saved successfully.
              </div>
            )}
          </div>

          {/* Scrollable Sidebar Filters */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {/* Section 1: Main Product Types & Styles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-xs text-slate-800 tracking-wide uppercase">
                  <Layers size={14} className="text-slate-400" />
                  <span>Product Categories</span>
                </div>
                {isEditingSidebar && (
                  <div className="flex gap-2 text-[10px] font-bold text-slate-500">
                    <button type="button" onClick={selectAllStyles} className="hover:text-[#0F2137] transition-colors px-1.5 py-0.5 rounded hover:bg-slate-200/50">
                      All
                    </button>
                    <button type="button" onClick={deselectAllStyles} className="hover:text-rose-600 transition-colors px-1.5 py-0.5 rounded hover:bg-rose-50">
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Product Type Search Box */}
              <div className="relative group">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0F2137] transition-colors" />
                <input
                  type="text"
                  value={productTypeSearch}
                  onChange={(e) => setProductTypeSearch(e.target.value)}
                  placeholder="Find styles..."
                  className="w-full rounded-xl border border-slate-200/80 bg-white/60 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-[#0F2137]/40 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                />
              </div>

              {/* Product Types Tree List */}
              {loadingOptions ? (
                <div className="py-8 text-center text-xs font-bold text-slate-400 animate-pulse flex flex-col items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                  Loading Catalog...
                </div>
              ) : filteredProductTypes.length === 0 ? (
                <div className="py-6 text-center text-xs font-medium text-slate-400 bg-white/40 rounded-xl border border-dashed border-slate-200">
                  No matches found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProductTypes.map((mpt) => {
                    const isExpanded = expandedProductTypes.has(mpt.name) || Boolean(productTypeSearch.trim());
                    const allMptStylesChecked = mpt.styles.length > 0 && mpt.styles.every((st) => checkedStyles.has(st));
                    const someMptStylesChecked = mpt.styles.some((st) => checkedStyles.has(st));

                    return (
                      <div key={mpt.name} className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/40 shadow-sm transition-all hover:border-slate-300 hover:bg-white/60">
                        <div className="flex items-center justify-between gap-2 p-2.5">
                          <label className={`flex items-center gap-2.5 text-xs font-extrabold text-slate-800 flex-1 min-w-0 ${isEditingSidebar ? 'cursor-pointer group' : 'cursor-default'}`}>
                            <div className="relative flex items-center justify-center">
                              <input
                                type="checkbox"
                                disabled={!isEditingSidebar}
                                checked={allMptStylesChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = !allMptStylesChecked && someMptStylesChecked;
                                }}
                                onChange={() => toggleProductType(mpt)}
                                className="peer h-4 w-4 shrink-0 rounded border-slate-300 text-[#0F2137] focus:ring-2 focus:ring-[#0F2137]/20 disabled:opacity-50 transition-all cursor-pointer"
                              />
                            </div>
                            <span className="truncate transition-colors group-hover:text-[#0F2137]" title={mpt.name}>
                              {mpt.name}
                            </span>
                            <span className="ml-auto rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                              {mpt.styles.length}
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => toggleAccordion(mpt.name)}
                            className="p-1 rounded-md text-slate-400 hover:bg-slate-200/50 hover:text-slate-800 transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="bg-slate-50/50 px-3 pb-3 pt-1 border-t border-slate-100/80">
                            <div className="space-y-0.5 border-l-2 border-slate-200/80 pl-2.5 ml-2 mt-1">
                              {mpt.styles.map((styleCode) => {
                                const isChecked = checkedStyles.has(styleCode);
                                return (
                                  <label
                                    key={styleCode}
                                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                                      isEditingSidebar 
                                        ? isChecked ? 'bg-[#0F2137]/5 text-[#0F2137] font-bold' : 'hover:bg-slate-200/40 text-slate-600 font-medium hover:text-slate-900 cursor-pointer' 
                                        : isChecked ? 'text-slate-800 font-bold' : 'text-slate-400 font-medium cursor-default'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!isEditingSidebar}
                                      checked={isChecked}
                                      onChange={() => toggleStyle(styleCode)}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-[#0F2137] focus:ring-0 disabled:opacity-50 transition-all"
                                    />
                                    <span className="truncate tracking-tight">{styleCode}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
                {filteredAndSortedRows.length} Style/Color Rows
              </span>
              <span>({checkedStyles.size} Styles)</span>
            </div>

            {(selectedStylesFilter.length > 0 || selectedColorsFilter.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedStylesFilter([]);
                  setSelectedColorsFilter([]);
                }}
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

                    {/* Color Header with Excel Filter */}
                    <th className="px-4 py-3 text-left min-w-[180px]">
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

                    {/* Size Headers */}
                    {availableSizes.map((size) => (
                      <th key={size} className="px-3 py-3 min-w-[75px] font-bold text-slate-600">
                        {size}
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
                  {checkedStyles.size === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-20 text-center text-slate-500 font-medium">
                        <div className="max-w-md mx-auto space-y-2">
                          <SlidersHorizontal size={28} className="mx-auto text-slate-400" />
                          <p className="text-sm font-bold text-slate-700">
                            No styles selected
                          </p>
                          <p className="text-xs text-slate-400">
                            Click &ldquo;Edit Selection&rdquo; on the left sidebar to select the desired Main Product Types and Styles, then click &ldquo;Save Selection&rdquo;.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAndSortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="px-4 py-16 text-center text-slate-500 font-medium">
                        No matching return inventory rows found for current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedRows.map((row) => (
                      <tr
                        key={`${row.style}-${row.color}`}
                        className="hover:bg-slate-50/80 transition group"
                      >
                        <td className="px-4 py-3 text-left font-bold text-slate-900" title={row.style}>
                          {row.style}
                        </td>
                        <td className="px-4 py-3 text-left text-slate-600 font-medium" title={row.displayColor}>
                          {row.displayColor}
                        </td>
                        {availableSizes.map((size) => {
                          const cell = row.cells[size];
                          const isEditing = cell && editingCellId !== null && editingCellId === cell.id;

                          return (
                            <td key={size} className="px-3 py-3 tabular-nums text-xs">
                              {!cell?.id ? (
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
                                        saveReturnCell(cell.id);
                                      }
                                    }}
                                    className="w-16 rounded border border-[#0F2137] bg-white px-1.5 py-0.5 text-center text-xs font-bold text-slate-900 outline-none"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => saveReturnCell(cell.id)}
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
                                    setEditQty(String(cell?.qty));
                                  }}
                                  className={`w-full py-0.5 rounded transition font-semibold ${
                                    cell?.qty > 0
                                      ? "text-slate-900 font-bold hover:bg-slate-100"
                                      : "text-slate-400 hover:text-slate-700"
                                  }`}
                                  title="Click to edit quantity"
                                >
                                  {formatCellQty(cell?.qty)}
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
                      <td colSpan={2} className="px-4 py-3 text-left uppercase tracking-wider text-slate-600">
                        Total ({filteredAndSortedRows.length} rows)
                      </td>
                      {availableSizes.map((size) => {
                        const colTotal = filteredAndSortedRows.reduce(
                          (sum, r) => sum + Number(r.cells[size]?.qty || 0),
                          0,
                        );
                        return (
                          <td key={`total-${size}`} className="px-3 py-3 tabular-nums text-slate-700 font-bold">
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






