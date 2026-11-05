import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import "../dashboard.css";
import "../return-inventory.css";
import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import { API_BASE } from "../api.js";
import {
  Search, Upload, Trash2, CheckCircle2, BarChart3,
  Download, ArrowLeft, Package, RefreshCw, FileSpreadsheet,
  CalendarDays, Eye, TrendingUp, AlertCircle, ArrowUpRight,
} from "lucide-react";
import {
  FlipkartIcon, AmazonIcon, AjioIcon, MeeshoIcon, MyntraIcon,
} from "../components/MarketplaceIcons.jsx";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";
import { downloadInventoryExcel } from "../utils/downloadInventoryExcel.js";

export default function InventoryPage() {
  const [inventoryRows, setInventoryRows]           = useState([]);
  const [todaysDeductedQty, setTodaysDeductedQty]   = useState(0);
  const [loading, setLoading]                       = useState(false);
  const [searchQuery, setSearchQuery]               = useState("");
  const [inventoryDownloading, setInventoryDownloading] = useState(false);

  const [flipkartFile, setFlipkartFile] = useState(null);
  const [amazonFile,   setAmazonFile]   = useState(null);
  const [ajioFile,     setAjioFile]     = useState(null);
  const [meeshoFile,   setMeeshoFile]   = useState(null);
  const [myntraFile,   setMyntraFile]   = useState(null);
  const [returnDate,   setReturnDate]   = useState(new Date().toISOString().split("T")[0]);
  const [isUploading,  setIsUploading]  = useState(false);
  const [previewData,  setPreviewData]  = useState(null);

  const [selectedStylesFilter, setSelectedStylesFilter] = useState([]);
  const [selectedColorsFilter, setSelectedColorsFilter] = useState([]);
  const [sortField, setSortField] = useState("style");
  const [sortAsc,   setSortAsc]   = useState(true);

  const [previewSearchQuery,    setPreviewSearchQuery]    = useState("");
  const [previewSortField,      setPreviewSortField]      = useState("platform");
  const [previewSortAsc,        setPreviewSortAsc]        = useState(true);
  const [previewFilterPlatform, setPreviewFilterPlatform] = useState([]);
  const [previewFilterStyle,    setPreviewFilterStyle]    = useState([]);
  const [previewFilterColor,    setPreviewFilterColor]    = useState([]);
  const [previewFilterSize,     setPreviewFilterSize]     = useState([]);
  const [previewFilterOrderId,  setPreviewFilterOrderId]  = useState([]);
  const [previewFilterPackOf,   setPreviewFilterPackOf]   = useState([]);
  const [previewCurrentPage,    setPreviewCurrentPage]    = useState(1);
  const [previewModalTab,       setPreviewModalTab]       = useState("valid");
  const [previewSelectedRows,   setPreviewSelectedRows]   = useState([]);

  const [activeTab, setActiveTab] = useState("inventory");
  const [dailyDeductions, setDailyDeductions] = useState([]);
  const [deductionDate, setDeductionDate] = useState(new Date().toISOString().split("T")[0]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/return-inventory`);
      setInventoryRows(data.rows ?? []);
      
      try {
        const res = await axios.get(`${API_BASE}/api/analytics/todays-deducted-qty/return`);
        setTodaysDeductedQty(res.data.total || 0);
      } catch (err) {
        console.error("Failed to fetch todays deducted qty:", err);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchDeductions = async (dateStr) => {
    try {
      const { data } = await axios.get(`${API_BASE}/daily-deductions?inventory_type=return&target_date=${dateStr}`);
      setDailyDeductions(data.rows ?? []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchInventory(); }, []);
  useEffect(() => { fetchDeductions(deductionDate); }, [deductionDate]);

  const uploadCards = [
    { key: "flipkart", title: "Flipkart", state: flipkartFile, setState: setFlipkartFile, badge: "Return Report", icon: FlipkartIcon },
    { key: "amazon",   title: "Amazon",   state: amazonFile,   setState: setAmazonFile,   badge: "Returns",       icon: AmazonIcon   },
    { key: "ajio",     title: "Ajio",     state: ajioFile,     setState: setAjioFile,     badge: "Return Report", icon: AjioIcon     },
    { key: "meesho",   title: "Meesho",   state: meeshoFile,   setState: setMeeshoFile,   badge: "Returns",       icon: MeeshoIcon   },
    { key: "myntra",   title: "Myntra",   state: myntraFile,   setState: setMyntraFile,   badge: "Return Report", icon: MyntraIcon   },
  ];



  const handlePreview = async () => {
    const hasFile = uploadCards.some(c => c.state);
    if (!returnDate) { alert("Please select a return date."); return; }
    if (!hasFile) { alert("Please upload at least one return file."); return; }
    setIsUploading(true); setPreviewData(null);
    try {
      const allRows = [];
      const missingRows = [];
      
      for (const card of uploadCards) {
        if (card.state) {
          const fd = new FormData();
          fd.append("file", card.state);
          fd.append("platform", card.title);
          fd.append("return_date", returnDate);
          
          const res = await axios.post(`${API_BASE}/v2/preview-returns`, fd);
          const returnedRows = res.data.rows || [];
          
          returnedRows.forEach(r => {
             if (r._status === "valid") allRows.push(r);
             else missingRows.push(r);
          });
        }
      }
      
      // Assign _id for table selection
      allRows.forEach((r, i) => { r._id = `v_${i}`; });
      missingRows.forEach((r, i) => { r._id = `m_${i}`; });
      
      setPreviewData({ raw_orders: allRows, missing_orders: missingRows, damaged_orders: [] });
      setPreviewModalTab(allRows.length > 0 ? "valid" : "missing");
      setPreviewSelectedRows([]);
    } catch (e) { alert("Error generating preview: " + (e.response?.data?.detail || e.message)); }
    finally { setIsUploading(false); }
  };

  const handleCommit = async () => {
    setIsUploading(true);
    try {
      if (!previewData) { alert("Please Preview first."); return; }
      
      const payload = {
        valid_orders: previewData.raw_orders || [],
        missing_orders: previewData.missing_orders || [],
        damaged_orders: previewData.damaged_orders || []
      };
      
      const res = await axios.post(`${API_BASE}/v2/commit-returns-json`, payload);
      alert(`Returns successfully uploaded! Total ${res.data.total_added || 0} units added to inventory. ${res.data.skipped_duplicates || 0} duplicate rows skipped.`);
      
      setFlipkartFile(null); setAmazonFile(null); setAjioFile(null);
      setMeeshoFile(null); setMyntraFile(null); setPreviewData(null);
      fetchInventory();
      fetchDeductions(deductionDate);
    } catch (e) { alert("Error committing returns: " + (e.response?.data?.detail || e.message)); }
    finally { setIsUploading(false); }
  };


  const pivotData = useMemo(() => {
    const map = new Map();
    for (const r of inventoryRows) {
      const st  = (r.style || "").trim();
      const col = (r.color || "").trim();
      const sz  = (r.size  || "").trim().toUpperCase();
      const qty = Number(r.qty || 0);
      const key = `${st.toLowerCase()}_${col.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { style: st, color: col, sizes: {}, total: 0 });
      const row = map.get(key);
      if (sz) { row.sizes[sz] = (row.sizes[sz] || 0) + qty; row.total += qty; }
    }
    return Array.from(map.values());
  }, [inventoryRows]);

  const deductionPivotData = useMemo(() => {
    const map = new Map();
    for (const r of dailyDeductions) {
      const st  = (r.style || "").trim();
      const col = (r.color || "").trim();
      const sz  = (r.size  || "").trim().toUpperCase();
      const qty = Number(r.qty || 0);
      const key = `${st.toLowerCase()}_${col.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { style: st, color: col, sizes: {}, total: 0 });
      const row = map.get(key);
      if (sz) { row.sizes[sz] = (row.sizes[sz] || 0) + qty; row.total += qty; }
    }
    return Array.from(map.values());
  }, [dailyDeductions]);
  
  const activePivotData = activeTab === "inventory" ? pivotData : deductionPivotData;

  const uniqueStyles = useMemo(() => Array.from(new Set(activePivotData.map(r => r.style))), [activePivotData]);
  const uniqueColors = useMemo(() => Array.from(new Set(activePivotData.map(r => r.color))), [activePivotData]);

  const allSizes = useMemo(() => {
    const sizes = new Set();
    const rows = activeTab === "inventory" ? inventoryRows : dailyDeductions;
    for (const r of rows) if (r.size) sizes.add(r.size.trim().toUpperCase());
    const order = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
    return Array.from(sizes).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1; if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [inventoryRows, dailyDeductions, activeTab]);

  const filteredPreview = useMemo(() => {
    if (!previewData) return [];
    let res = previewModalTab === "valid" ? [...(previewData.raw_orders || [])] : previewModalTab === "missing" ? [...(previewData.missing_orders || [])] : previewModalTab === "damaged" ? [...(previewData.damaged_orders || [])] : [];
    if (previewSearchQuery.trim()) {
      const q = previewSearchQuery.toLowerCase();
      res = res.filter(r =>
        r.platform?.toLowerCase().includes(q) || 
        r.return_order_id?.toLowerCase().includes(q) ||
        r.ordered_sku?.toLowerCase().includes(q) || 
        r.return_sku?.toLowerCase().includes(q)
      );
    }
    if (previewFilterPlatform.length) res = res.filter(r => previewFilterPlatform.includes(r.platform));
    if (previewFilterOrderId.length)  res = res.filter(r => previewFilterOrderId.includes(r.return_order_id));
    res.sort((a, b) => {
      let av = a[previewSortField] || "", bv = b[previewSortField] || "";
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      else if (["ordered_qty", "return_qty", "price"].includes(previewSortField)) { av = Number(av) || 0; bv = Number(bv) || 0; }
      if (av < bv) return previewSortAsc ? -1 : 1;
      if (av > bv) return previewSortAsc ?  1 : -1;
      return 0;
    });
    return res;
  }, [previewData, previewModalTab, previewSearchQuery, previewFilterPlatform, previewFilterOrderId, previewSortField, previewSortAsc]);

  const pUniquePlatforms = useMemo(() => Array.from(new Set(filteredPreview.map(r => r.platform))), [filteredPreview]);
  const pUniqueOrderIds = useMemo(() => Array.from(new Set(filteredPreview.map(r => r.return_order_id))), [filteredPreview]);
    const finalReportData = useMemo(() => {
    if (!previewData || !previewData.raw_orders) return [];
    const map = new Map();
    for (const r of previewData.raw_orders) {
      if (!r.style || !r.color) continue;
      const key = `${r.style.trim().toLowerCase()}_${r.color.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, { style: r.style, color: r.color, sizes: {}, total: 0 });
      const row = map.get(key);
      const sz = (r.size || "").trim().toUpperCase();
      const qty = Number(r.return_qty) || 0;
      if (sz && qty > 0) {
        row.sizes[sz] = (row.sizes[sz] || 0) + qty;
        row.total += qty;
      }
    }
    return Array.from(map.values()).sort((a,b) => a.style.localeCompare(b.style) || a.color.localeCompare(b.color));
  }, [previewData]);

  const previewGrandTotal = useMemo(() => filteredPreview.reduce((s, r) => s + (Number(r.return_qty) || 0), 0), [filteredPreview]);

  const filteredAndSortedRows = useMemo(() => {
    let result = [...activePivotData];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.style.toLowerCase().includes(q) || r.color.toLowerCase().includes(q));
    }
    if (selectedStylesFilter.length) result = result.filter(r => selectedStylesFilter.includes(r.style));
    if (selectedColorsFilter.length) result = result.filter(r => selectedColorsFilter.includes(r.color));
    result.sort((a, b) => {
      let av = sortField === "total" ? a.total : a[sortField];
      let bv = sortField === "total" ? b.total : b[sortField];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ?  1 : -1;
      return 0;
    });
    return result;
  }, [activePivotData, searchQuery, selectedStylesFilter, selectedColorsFilter, sortField, sortAsc]);

  const totalReturnQty = useMemo(() => inventoryRows.reduce((s, r) => s + (Number(r.qty) || 0), 0), [inventoryRows]);
  const totalSKUs      = useMemo(() => new Set(inventoryRows.map(r => r.sku)).size, [inventoryRows]);
  const filesUploaded  = uploadCards.filter(c => c.state).length;

  return (
    <div className="return-inventory-page">
      <WorkspaceTopBar>
        <div className="return-page-heading">
          <Link to="/#inventory" className="return-back-link" aria-label="Back to Inventory"><ArrowLeft size={18} /></Link>
          <span className="return-page-icon"><Package size={20} /></span>
          <div><h1>Return Inventory</h1><p>Manage returns and stock movement</p></div>
        </div>
      </WorkspaceTopBar>

      <div className="return-page-content">
        <div className="return-content-layout">
          <div className="return-kpi-grid">
            {[
              { label: "Today's deductions", value: loading ? "—" : todaysDeductedQty.toLocaleString(), sub: "Units deducted today", icon: Package, accent: "blue" },
              { label: "Return stock", value: loading ? "—" : totalReturnQty.toLocaleString(), sub: "Units across all sizes", icon: TrendingUp, accent: "green" },
              { label: "Unique SKUs", value: loading ? "—" : totalSKUs.toLocaleString(), sub: "Distinct product codes", icon: FileSpreadsheet, accent: "violet" },
            ].map(card => (
              <article key={card.label} className="dashboard-stat">
                <div className="dashboard-card-top"><span>{card.label}</span><span className={`dashboard-icon ${card.accent === "green" ? "blue" : card.accent === "violet" ? "violet" : ""}`}><card.icon size={21} /></span></div>
                <strong>{card.value}</strong>
                <p>{card.sub}</p>
              </article>
            ))}
            <Link to="/return-inventory/analysis" className="dashboard-action">
              <div className="dashboard-card-top"><span>Return insights</span><span className="dashboard-icon amber"><BarChart3 size={21} /></span></div>
              <h3>Explore analytics</h3><p>Stock &amp; return trends</p>
              <div className="dashboard-card-foot">View analytics <ArrowUpRight size={16} /></div>
            </Link>
          </div>

          <section className="return-upload-section" aria-labelledby="return-upload-heading">
            <div className="return-upload-heading">
              <div><h2 id="return-upload-heading"><span className="return-upload-heading-icon"><Upload size={18} /></span> Upload returns <span className="return-upload-count">{filesUploaded}/5</span></h2><p>Only rows matching the selected date are processed.</p></div>
              <div className="return-upload-actions">
                <label className="return-date-field"><CalendarDays size={15} /><span>Return date</span><input type="date" aria-label="Return upload date" value={returnDate} onChange={e => { setReturnDate(e.target.value); setPreviewData(null); }} /></label>
              </div>
            </div>
            <div className="return-upload-grid">
              {uploadCards.map(item => (
                <div className="return-upload-tile" key={item.key} data-ready={!!item.state}>
                  <label className="return-upload-label">
                    <input type="file" accept=".xlsx,.csv" className="return-file-input" aria-label={`Upload ${item.title} returns`} disabled={!!item.state} onChange={e => { const file = e.target.files?.[0]; if (file) { item.setState(file); setPreviewData(null); } e.target.value = ""; }} />
                    <span className="return-platform-icon"><item.icon className="h-full w-full rounded-lg" /></span>
                    <span className="return-upload-copy"><strong>{item.title}</strong><span title={item.state?.name}>{item.state ? item.state.name : "Choose return file"}</span></span>
                    {!item.state && <span className="return-upload-affordance"><Upload size={15} /></span>}
                    {item.state && <CheckCircle2 size={17} className="return-file-ready" />}
                  </label>
                  {item.state && <button type="button" aria-label={`Remove ${item.title} return file`} onClick={() => { item.setState(null); setPreviewData(null); }} className="return-remove-file"><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
            <div className="return-upload-footer">
              <button type="button" disabled={isUploading || !filesUploaded} className="return-clear-button" onClick={() => {
                uploadCards.forEach(item => item.setState(null));
                setPreviewData(null);
                setPreviewSelectedRows([]);
                setPreviewCurrentPage(1);
              }}><Trash2 size={14} /> Clear files</button>
              <button onClick={handlePreview} disabled={isUploading || !filesUploaded} className="return-preview-button">
                {isUploading ? <><RefreshCw size={15} className="animate-spin" /> Processing…</> : <><Eye size={15} /> Preview returns{filesUploaded > 0 ? ` (${filesUploaded})` : ""}</>}
              </button>
            </div>
          </section>

          <div className="return-table-layout">
            <section className="return-table-panel" aria-label="Return inventory records">
              <div className="return-table-toolbar">
                <div className="return-table-tabs" role="group" aria-label="Return inventory view">
                  <button onClick={() => setActiveTab("inventory")} aria-pressed={activeTab === "inventory"}>Current stock</button>
                  <button onClick={() => setActiveTab("deductions")} aria-pressed={activeTab === "deductions"}>Daily deductions</button>
                </div>
                <div className="return-table-controls">
                  {activeTab === "deductions" && <input type="date" aria-label="Daily deductions date" value={deductionDate} onChange={e => setDeductionDate(e.target.value)} className="return-deduction-date" />}
                  <label className="return-search-field"><Search size={16} /><input type="search" aria-label="Search return inventory" placeholder="Search style or color…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></label>
                  <button onClick={async () => {
                    setInventoryDownloading(true);
                    try {
                      const rowsToExport = activeTab === "inventory" ? inventoryRows : dailyDeductions;
                      const fileName = activeTab === "inventory" ? "Return_Inventory" : `Return_Deductions_${deductionDate}`;
                      await downloadInventoryExcel(rowsToExport, fileName);
                    } finally { setInventoryDownloading(false); }
                  }} disabled={inventoryDownloading || (activeTab === "inventory" ? !inventoryRows.length : !dailyDeductions.length)} className="return-export-button"><Download size={15} />{inventoryDownloading ? "Exporting…" : "Export Excel"}</button>
                </div>
              </div>

              {/* Table body */}
              <div className="return-table-scroll" data-lenis-prevent tabIndex={0} aria-label="Scrollable return inventory table">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#0F2137]" />
                    <p className="text-base font-medium text-slate-800 font-medium">Loading inventory…</p>
                  </div>
                ) : (
                  <table className="glass-table return-stock-table">
                    <thead className="sticky top-0 z-10 glass/95 backdrop-blur border-b border-slate-200/60 text-sm font-bold uppercase tracking-wider text-slate-800 font-medium">
                      <tr>
                        <th>
                          <ExcelHeaderFilter label="Style" columnKey="style" values={uniqueStyles} selectedValues={selectedStylesFilter} onFilterChange={setSelectedStylesFilter} sortField={sortField} sortAsc={sortAsc} onSort={(f, a) => { setSortField(f); setSortAsc(a); }} align="left" />
                        </th>
                        <th>
                          <ExcelHeaderFilter label="Color" columnKey="color" values={uniqueColors} selectedValues={selectedColorsFilter} onFilterChange={setSelectedColorsFilter} sortField={sortField} sortAsc={sortAsc} onSort={(f, a) => { setSortField(f); setSortAsc(a); }} align="left" />
                        </th>
                        {allSizes.map(sz => (
                          <th key={sz} className="px-2 py-3 w-[58px] text-center">{sz}</th>
                        ))}
                        <th>
                          <ExcelHeaderFilter label="Total" columnKey="total" values={[]} selectedValues={[]} onFilterChange={() => {}} sortField={sortField} sortAsc={sortAsc} onSort={(f, a) => { setSortField(f); setSortAsc(a); }} align="right" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80">
                      {filteredAndSortedRows.length > 0 ? (() => {
                        const styleGroups = [];
                        const groupMap = new Map();

                        filteredAndSortedRows.forEach((row) => {
                          const styleKey = (row.style || "").trim().toLowerCase();

                          if (!groupMap.has(styleKey)) {
                            const group = { style: row.style, rows: [] };
                            groupMap.set(styleKey, group);
                            styleGroups.push(group);
                          }

                          groupMap.get(styleKey).rows.push(row);
                        });

                        const grandTotals = Object.fromEntries(
                          allSizes.map(sz => [
                            sz,
                            filteredAndSortedRows.reduce(
                              (sum, row) => sum + (Number(row.sizes[sz]) || 0),
                              0
                            ),
                          ])
                        );
                        const grandTotal = filteredAndSortedRows.reduce(
                          (sum, row) => sum + (Number(row.total) || 0),
                          0
                        );

                        return (
                          <>
                            {styleGroups.map((group) => {
                              const subtotalBySize = Object.fromEntries(
                                allSizes.map(sz => [
                                  sz,
                                  group.rows.reduce(
                                    (sum, row) => sum + (Number(row.sizes[sz]) || 0),
                                    0
                                  ),
                                ])
                              );
                              const subtotal = group.rows.reduce(
                                (sum, row) => sum + (Number(row.total) || 0),
                                0
                              );

                              return (
                                <React.Fragment key={`style-group-${group.style}`}>
                                  {group.rows.map((row, idx) => (
                                    <tr
                                      key={`${row.style}-${row.color}-${idx}`}
                                      className="return-data-row"
                                    >
                                      <td>{row.style}</td>
                                      <td>{row.color}</td>
                                      {allSizes.map(sz => {
                                        const val = row.sizes[sz] || 0;
                                        return (
                                          <td key={sz} className="px-2 py-3 tabular-nums text-base">
                                            {val > 0
                                              ? <span className="return-stock-value">{val}</span>
                                              : <span className="text-slate-800 font-medium">—</span>}
                                          </td>
                                        );
                                      })}
                                      <td>
                                        {row.total > 0
                                          ? <span className="return-stock-value return-row-total">{row.total}</span>
                                          : <span className="text-slate-800 font-medium">—</span>}
                                      </td>
                                    </tr>
                                  ))}

                                  {/* Style Subtotal */}
                                  <tr className="return-subtotal-row">
                                    <td
                                      colSpan={2}
                                      className="px-5 py-2.5 text-left text-xs font-black uppercase tracking-wider text-[#0F2137]"
                                    >
                                      {group.style} — Subtotal
                                    </td>
                                    {allSizes.map(sz => (
                                      <td
                                        key={sz}
                                        className="px-2 py-2.5 text-center tabular-nums text-sm font-black text-[#0F2137]"
                                      >
                                        {subtotalBySize[sz] > 0 ? subtotalBySize[sz] : "—"}
                                      </td>
                                    ))}
                                    <td>
                                      {subtotal > 0 ? subtotal : "—"}
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            })}

                            {/* Grand Total */}
                            <tr className="return-grand-total-row">
                              <td
                                colSpan={2}
                                className="px-5 py-3 text-left text-sm font-black uppercase tracking-widest"
                              >
                                Grand Total
                              </td>
                              {allSizes.map(sz => (
                                <td
                                  key={sz}
                                  className="px-2 py-3 text-center tabular-nums text-sm font-black"
                                >
                                  {grandTotals[sz] > 0 ? grandTotals[sz] : "—"}
                                </td>
                              ))}
                              <td>
                                {grandTotal > 0 ? grandTotal : "—"}
                              </td>
                            </tr>
                          </>
                        );
                      })() : (
                        <tr>
                          <td colSpan={allSizes.length + 3} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Package size={32} className="text-slate-800 font-medium" />
                              <p className="text-base font-semibold text-slate-800 font-medium">No matching rows found</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>

      {/* ── Returns Preview Modal ──────────────────────────────────────── */}
      {previewData && (() => {
        const previewItemsPerPage = 15;
        const totalPreviewPages = Math.ceil(filteredPreview.length / previewItemsPerPage) || 1;
        const startIdx = (previewCurrentPage - 1) * previewItemsPerPage;
        const currentPreviewRows = filteredPreview.slice(startIdx, startIdx + previewItemsPerPage);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: "rgba(8,16,36,0.72)", backdropFilter: "blur(4px)" }}
            onClick={e => { if (e.target === e.currentTarget) setPreviewData(null); }}
          >
            <div
              className="flex flex-col rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-900/10"
              style={{ width: "85vw", maxHeight: "95vh", background: "#ffffff" }}
            >
              {/* ── Modal Top Bar ───────────────────────────────────────── */}
              <div className="shrink-0 flex items-center justify-between px-6 py-4"
                style={{ background: "linear-gradient(135deg,#0F2137 0%,#1a3560 100%)" }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl glass/10 border border-white/20 shadow-inner">
                    <Eye size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white tracking-tight leading-none">Returns Preview</h2>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { setPreviewModalTab("valid"); setPreviewSelectedRows([]); setPreviewCurrentPage(1); }} className={`px-3 py-1 rounded-md text-xs font-bold transition ${previewModalTab === "valid" ? "glass text-[#0F2137]" : "glass/10 text-white/60 hover:glass/20"}`}>Valid Returns</button>
                      <button onClick={() => { setPreviewModalTab("missing"); setPreviewSelectedRows([]); setPreviewCurrentPage(1); }} className={`px-3 py-1 rounded-md text-xs font-bold transition ${previewModalTab === "missing" ? "bg-rose-500 text-white" : "glass/10 text-white/60 hover:glass/20"}`}>Missing Pieces ({previewData?.missing_orders?.length || 0})</button>
                      <button onClick={() => { setPreviewModalTab("damaged"); setPreviewSelectedRows([]); setPreviewCurrentPage(1); }} className={`px-3 py-1 rounded-md text-xs font-bold transition ${previewModalTab === "damaged" ? "bg-orange-500 text-white" : "glass/10 text-white/60 hover:glass/20"}`}>Damaged Pieces ({previewData?.damaged_orders?.length || 0})</button>
                      <button onClick={() => { setPreviewModalTab("final"); setPreviewSelectedRows([]); setPreviewCurrentPage(1); }} className={`px-3 py-1 rounded-md text-xs font-bold transition ${previewModalTab === "final" ? "bg-amber-400 text-[#0F2137]" : "glass/10 text-white/60 hover:glass/20"}`}>Final Report</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {previewModalTab !== "final" && previewSelectedRows.length > 0 && (
                      <div className="flex items-center gap-2">
                        {previewModalTab !== "valid" && (
                          <button
                            onClick={() => {
                              setPreviewData(prev => {
                                const newPrev = { ...prev };
                                const sourceKey = previewModalTab === "missing" ? "missing_orders" : "damaged_orders";
                                const source = newPrev[sourceKey] || [];
                                const target = newPrev.raw_orders || [];
                                const toMove = source.filter(r => previewSelectedRows.includes(r._id));
                                const toKeep = source.filter(r => !previewSelectedRows.includes(r._id));
                                newPrev[sourceKey] = toKeep;
                                newPrev.raw_orders = [...target, ...toMove];
                                return newPrev;
                              });
                              setPreviewSelectedRows([]);
                            }}
                            className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                          >
                            Move to Valid
                          </button>
                        )}
                        {previewModalTab !== "missing" && (
                          <button
                            onClick={() => {
                              setPreviewData(prev => {
                                const newPrev = { ...prev };
                                const sourceKey = previewModalTab === "valid" ? "raw_orders" : "damaged_orders";
                                const source = newPrev[sourceKey] || [];
                                const target = newPrev.missing_orders || [];
                                const toMove = source.filter(r => previewSelectedRows.includes(r._id));
                                const toKeep = source.filter(r => !previewSelectedRows.includes(r._id));
                                newPrev[sourceKey] = toKeep;
                                newPrev.missing_orders = [...target, ...toMove];
                                return newPrev;
                              });
                              setPreviewSelectedRows([]);
                            }}
                            className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1 bg-rose-500 hover:bg-rose-600 text-white"
                          >
                            Move to Missing
                          </button>
                        )}
                        {previewModalTab !== "damaged" && (
                          <button
                            onClick={() => {
                              setPreviewData(prev => {
                                const newPrev = { ...prev };
                                const sourceKey = previewModalTab === "valid" ? "raw_orders" : "missing_orders";
                                const source = newPrev[sourceKey] || [];
                                const target = newPrev.damaged_orders || [];
                                const toMove = source.filter(r => previewSelectedRows.includes(r._id));
                                const toKeep = source.filter(r => !previewSelectedRows.includes(r._id));
                                newPrev[sourceKey] = toKeep;
                                newPrev.damaged_orders = [...target, ...toMove];
                                return newPrev;
                              });
                              setPreviewSelectedRows([]);
                            }}
                            className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white"
                          >
                            Move to Damaged
                          </button>
                        )}
                      </div>
                    )}
                    <div className="w-px h-6 glass/20 mx-2"></div>
                    <span className="text-sm font-bold text-white/90 glass/10 border border-white/20 rounded-lg px-3 py-1.5">
                      {filteredPreview.length} rows
                    </span>
                    <span className="text-sm font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 rounded-lg px-3 py-1.5">
                      {previewGrandTotal} units
                    </span>
                  </div>
                </div>
                {/* Search */}
                {previewModalTab !== "final" && (
<div className="flex items-center gap-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={14} />
                    <input
                      type="text" placeholder="Search…" value={previewSearchQuery}
                      onChange={e => { setPreviewSearchQuery(e.target.value); setPreviewCurrentPage(1); }}
                      className="h-9 w-56 rounded-lg glass/10 border border-white/20 pl-8 pr-4 text-sm font-medium text-white placeholder:text-white/35 outline-none focus:glass/15 focus:border-white/40 transition"
                    />
                  </div>
                </div>
)}
              </div>

              {/* ── Table Area (Fits 12 rows perfectly) ────────────────── */}
              <div className="flex-1 overflow-auto min-h-0 glass">
                {previewModalTab === "final" ? (
                  <div className="p-6 overflow-x-auto">
                    <table className="glass-table">
                      <thead className="glass border-b-2 border-slate-200">
                        <tr>
                          <th>Style</th>
                          <th>Color</th>
                          {allSizes.map(sz => (
                            <th key={sz} className="px-2 py-3 text-center text-xs font-black text-slate-800 font-medium uppercase">{sz}</th>
                          ))}
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 glass">
                        {finalReportData.length === 0 ? (
                          <tr><td colSpan={allSizes.length + 3} className="py-20 text-center text-slate-800 font-medium font-medium">No valid returns to report.</td></tr>
                        ) : finalReportData.map((row, idx) => (
                          <tr key={`${row.style}-${row.color}-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                            <td>{row.style}</td>
                            <td>{row.color}</td>
                            {allSizes.map(sz => {
                              const val = row.sizes[sz] || 0;
                              return (
                                <td key={sz} className="px-2 py-3 text-center tabular-nums text-base">
                                  {val > 0
                                    ? <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded bg-indigo-50 text-indigo-700 font-bold text-sm">{val}</span>
                                    : <span className="text-slate-800 font-medium">—</span>}
                                </td>
                              );
                            })}
                            <td>
                              <span className="inline-flex items-center justify-center h-6 min-w-[32px] px-2 rounded bg-[#0F2137] text-white font-black text-sm">{row.total}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                <table className="glass-table">
                  <thead className="sticky top-0 z-10 glass border-b-2 border-slate-200">
                    <tr>
                      <th>
                        <input 
                          type="checkbox" 
                          className="cursor-pointer"
                          checked={currentPreviewRows.length > 0 && previewSelectedRows.length === currentPreviewRows.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPreviewSelectedRows(currentPreviewRows.map(r => r._id));
                            } else {
                              setPreviewSelectedRows([]);
                            }
                          }}
                        />
                      </th>
                      <th>#</th>
                      <th><ExcelHeaderFilter label="Platform" columnKey="platform" values={pUniquePlatforms} selectedValues={previewFilterPlatform} onFilterChange={(v)=>{setPreviewFilterPlatform(v);setPreviewCurrentPage(1);}} sortField={previewSortField} sortAsc={previewSortAsc} onSort={(f,a)=>{setPreviewSortField(f);setPreviewSortAsc(a);}} align="left"/></th>
                      <th><ExcelHeaderFilter label="Order ID"  columnKey="return_order_id"  values={pUniqueOrderIds}  selectedValues={previewFilterOrderId}  onFilterChange={(v)=>{setPreviewFilterOrderId(v);setPreviewCurrentPage(1);}}  sortField={previewSortField} sortAsc={previewSortAsc} onSort={(f,a)=>{setPreviewSortField(f);setPreviewSortAsc(a);}} align="left"/></th>
                      <th>Return SKU</th>
                      <th>Style</th>
                      <th>Color</th>
                      <th>Size</th>
                      <th>Return Qty</th>
                      <th>Price</th>
                      <th>Warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPreviewRows.length === 0 ? (
                      <tr><td colSpan={10} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <AlertCircle size={32} className="text-amber-400" />
                          <p className="text-sm font-semibold text-slate-800 font-medium">No records found for <span className="font-black text-slate-700">{returnDate}</span></p>
                        </div>
                      </td></tr>
                    ) : currentPreviewRows.map((r, i) => {
                      const platformColor = { Flipkart:"#2874f0", Amazon:"#f97316", Ajio:"#6b7280", Meesho:"#ec4899", Myntra:"#e11d48" }[r.platform] || "#8b5cf6";
                      const actualIdx = startIdx + i + 1;
                      return (
                        <tr key={i} className={`border-b border-slate-100 transition-colors hover:bg-indigo-50/50 ${i % 2 === 0 ? "glass" : "glass/40"}`}>
                          <td>
                            <input 
                              type="checkbox" 
                              className="cursor-pointer"
                              checked={previewSelectedRows.includes(r._id)}
                              onChange={(e) => {
                                if (e.target.checked) setPreviewSelectedRows([...previewSelectedRows, r._id]);
                                else setPreviewSelectedRows(previewSelectedRows.filter(id => id !== r._id));
                              }}
                            />
                          </td>
                          <td>{actualIdx}</td>
                          <td>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: platformColor }} />
                              <span className="text-sm font-bold text-slate-800">{r.platform}</span>
                            </span>
                          </td>
                          <td>{r.return_order_id}</td>
                          <td>{r.return_sku}</td>
                          <td>{r.style}</td>
                          <td>{r.color}</td>
                          <td><span className="inline-flex items-center justify-center h-6 px-2 rounded glass text-slate-700 font-black text-xs border border-slate-200">{r.size}</span></td>
                          <td>
                            <span className="inline-flex items-center justify-center h-6 min-w-[32px] px-2 rounded bg-[#0F2137] text-white font-black text-sm tabular-nums">{r.return_qty}</span>
                          </td>
                          <td>₹{r.price}</td>
                          <td>{r.warning || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              </div>

              {/* ── Footer bar with Pagination ─────────────────────────────── */}
              {previewModalTab !== "final" && (<div className="shrink-0 flex items-center justify-between px-6 py-4 border-t-2 border-slate-100 glass">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-slate-800 font-medium font-medium">
                    Showing <span className="font-black text-slate-700">{filteredPreview.length}</span> returns
                  </p>
                  
                  {/* Pagination Controls */}
                  {totalPreviewPages > 1 && (
                    <div className="flex items-center gap-1.5 ml-2">
                      <button 
                        onClick={() => setPreviewCurrentPage(p => Math.max(1, p - 1))} 
                        disabled={previewCurrentPage === 1} 
                        className="px-3 py-1.5 rounded-md border border-slate-200 glass text-xs font-bold text-slate-800 font-medium hover:glass disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
                      >
                        Prev
                      </button>
                      <span className="text-xs font-semibold text-slate-800 font-medium px-2">
                        Page {previewCurrentPage} of {totalPreviewPages}
                      </span>
                      <button 
                        onClick={() => setPreviewCurrentPage(p => Math.min(totalPreviewPages, p + 1))} 
                        disabled={previewCurrentPage === totalPreviewPages} 
                        className="px-3 py-1.5 rounded-md border border-slate-200 glass text-xs font-bold text-slate-800 font-medium hover:glass disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 font-medium uppercase tracking-widest">Total</span>
                    <span className="text-xl font-black text-[#0F2137] tabular-nums">{previewGrandTotal}</span>
                  </div>
                  <div className="h-6 w-px glass" />
                  <button onClick={() => setPreviewData(null)}
                    className="h-9 px-4 rounded-lg text-sm font-bold text-slate-800 font-medium border border-slate-200 hover:border-slate-400 hover:glass transition"
                  >
                    Discard
                  </button>
                  <button onClick={handleCommit} disabled={isUploading || filteredPreview.length === 0}
                    className="flex items-center gap-2 h-9 px-5 rounded-lg bg-[#0F2137] hover:bg-[#1a3560] text-sm font-black text-white shadow-md shadow-slate-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isUploading
                      ? <><RefreshCw size={14} className="animate-spin" /> Committing…</>
                      : <><CheckCircle2 size={14} /> Commit {previewData?.raw_orders?.length || 0} Valid Returns</>}
                  </button>
                </div>
              </div>)}
            </div>
          </div>
        );
      })()}

    </div>
  );
}


