import {
  useEffect,
  useMemo,
  useState } from "react";import { Link } from "react-router-dom";import axios from "axios";import {  ChevronLeft,
  Download,
  Edit3,
  Layers,
  Plus,
  Save,
  Trash2,
  X,
  RefreshCw,
  Search,
  Box,
  Package,
  Tag,
  FileText,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { API_BASE, getAdminKeyHeader } from "../api.js";
import ExcelHeaderFilter from "../components/ExcelHeaderFilter.jsx";

const TABLES = [
  { type: "shipping_label", title: "Shipping Label" },
  { type: "shipping_cover", title: "Shipping Cover" },
  { type: "packing_cover", title: "Packing Cover" },
  { type: "packing_board", title: "Packing Board" },
];

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
        name: "Shipping Cover",
        qty: 0,
      });
    }
  }

  return nextRows;
}

function cleanPayloadRow(row) {
  return {
    id: row.id ?? null,
    item_type: row.item_type,
    platform: row.item_type === "shipping_cover" ? row.platform : null,
    name: row.name,
    qty: Number(row.qty || 0),
  };
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
  const [originalRows, setOriginalRows] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTable, setActiveTable] = useState("shipping_label");
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const { data } = await axios.get(`${API_BASE}/packing-inventory/usage-history?item_type=${activeTable}`);
        setHistoryData(data.history || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, [activeTable]);

  const groupedRows = useMemo(() => {
    const grouped = {};
    for (const table of TABLES) grouped[table.type] = [];
    for (const row of rows) {
      if (grouped[row.item_type]) grouped[row.item_type].push(row);
    }
    for (const table of TABLES) {
      grouped[table.type].sort((a, b) =>
        String(a.platform || a.name).localeCompare(String(b.platform || b.name)),
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
      setOriginalRows(normalized);
      setDeletedIds([]);
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

  const updateRow = (key, field, value) => {
    setRows((current) =>
      current.map((row) =>
        row._key === key ? { ...row, [field]: field === "qty" ? Math.max(0, Number(value || 0)) : value } : row,
      ),
    );
  };

  const addRow = (type) => {
    setRows((current) => [
      ...current,
      {
        _key: makeKey(),
        id: null,
        item_type: type,
        platform: null,
        name: "",
        qty: 0,
      },
    ]);
  };

  const deleteRow = (target) => {
    if (target.id) {
      setDeletedIds((ids) => [...ids, target.id]);
    }
    setRows((current) => current.filter((row) => row._key !== target._key));
  };

  const cancelEdit = () => {
    setRows(originalRows.map((row) => ({ ...row })));
    setDeletedIds([]);
    setEditing(false);
  };

  const saveRows = async () => {
    setSaving(true);
    try {
      const payloadItems = rows
        .filter((row) => row.item_type === "shipping_cover" || String(row.name || "").trim().length > 0)
        .map(cleanPayloadRow);

      await axios.put(
        `${API_BASE}/packing-inventory`,
        {
          items: payloadItems,
          deleted_ids: deletedIds,
        },
        { headers: getAdminKeyHeader() },
      );

      await loadRows();
      setEditing(false);
      alert("Packing inventory saved successfully.");
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.detail;
      alert(
        typeof msg === "string"
          ? msg
          : "Save failed. Set VITE_ADMIN_KEY in frontend .env to match server ADMIN_API_KEY.",
      );
    } finally {
      setSaving(false);
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

  const renderSimpleTable = (table) => {
    let tableRows = groupedRows[table.type] ?? [];
    if (searchFilter.trim()) {
      tableRows = tableRows.filter((r) =>
        String(r.name || "").toLowerCase().includes(searchFilter.trim().toLowerCase()),
      );
    }
    const total = tableRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);

    return (
      <section
        key={table.type}
        className="bg-white shadow-xl shadow-slate-200/40 rounded-3xl border border-slate-200/60 transition-all hover:shadow-2xl hover:shadow-slate-200/50 flex flex-col relative group w-full max-h-full h-fit"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2137]/5 text-[#0F2137]">
              <Layers size={18} className="opacity-80" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">{table.title}</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {tableRows.length} item{tableRows.length === 1 ? "" : "s"} &bull; Total <span className="text-[#0F2137] font-bold">{total.toLocaleString()}</span> units
              </p>
            </div>
          </div>
          {editing && (
            <button
              type="button"
              onClick={() => addRow(table.type)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2137] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1E3A66] shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <Plus size={14} />
              Add Item
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-2.5 min-h-0">
          <table className="w-full min-w-[480px] text-sm border-separate border-spacing-y-1.5">
            <thead>
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-extrabold uppercase tracking-widest text-slate-400">Item Name</th>
                <th className="px-3 py-1.5 text-right text-xs font-extrabold uppercase tracking-widest text-slate-400 w-36">Quantity</th>
                {editing && <th className="px-3 py-1.5 text-center text-xs font-extrabold uppercase tracking-widest text-slate-400 w-20">Action</th>}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={editing ? 3 : 2} className="px-4 py-12 text-center">
                    <div className="inline-flex flex-col items-center justify-center text-slate-400">
                      <Layers size={32} className="mb-3 opacity-20" />
                      <span className="text-sm font-semibold">No items found</span>
                      <span className="text-xs mt-1">Add items to populate this category.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row._key} className="bg-slate-50/50 hover:bg-emerald-50/40 transition-colors group">
                    <td className="px-3 py-1.5 font-bold text-slate-800 rounded-l-xl">
                      {editing ? (
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateRow(row._key, "name", e.target.value)}
                          placeholder="Item name"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0F2137] focus:ring-2 focus:ring-[#0F2137]/20 transition-all shadow-sm"
                        />
                      ) : (
                        <div className="flex items-center gap-2.5">
                          {table.type === 'shipping_label' ? <Tag size={15} className="text-[#0F2137] opacity-60" /> : 
                           table.type === 'packing_cover' ? <FileText size={15} className="text-[#0F2137] opacity-60" /> : 
                           table.type === 'packing_board' ? <Box size={15} className="text-[#0F2137] opacity-60" /> : 
                           <Layers size={15} className="text-[#0F2137] opacity-60" />}
                          <span className="group-hover:text-[#0F2137] transition-colors">{row.name || "-"}</span>
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums text-sm font-black text-slate-700 ${!editing && 'rounded-r-xl'}`}>
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          value={row.qty}
                          onChange={(e) => updateRow(row._key, "qty", e.target.value)}
                          className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-xs font-bold text-slate-900 outline-none focus:border-[#0F2137] focus:ring-2 focus:ring-[#0F2137]/20 transition-all shadow-sm"
                        />
                      ) : (
                        row.qty ? <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-extrabold tabular-nums border border-slate-200/60 shadow-sm">{row.qty.toLocaleString()}</span> : <span className="text-slate-300">-</span>
                      )}
                    </td>
                    {editing && (
                      <td className="px-3 py-1.5 text-center rounded-r-xl">
                        <button
                          type="button"
                          onClick={() => deleteRow(row)}
                          className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
                          title="Delete item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {tableRows.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 rounded-b-3xl flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Subtotal</span>
            <span className="text-lg tabular-nums text-[#0F2137] font-black">{total.toLocaleString()}</span>
          </div>
        )}
      </section>
    );
  };

  const renderShippingCoverTable = (table) => {
    const byPlatform = new Map(
      (groupedRows.shipping_cover ?? []).map((row) => [row.platform, row]),
    );
    const total = platforms.reduce((sum, platform) => {
      const row = byPlatform.get(platform);
      return sum + Number(row?.qty || 0);
    }, 0);

    return (
      <section
        key={table.type}
        className="bg-white shadow-xl shadow-slate-200/40 rounded-3xl border border-slate-200/60 transition-all hover:shadow-2xl hover:shadow-slate-200/50 flex flex-col relative group w-full max-h-full h-fit overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700">
              <Layers size={18} className="opacity-80" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">{table.title}</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Platform breakdown &bull; Total <span className="text-teal-700 font-bold">{total.toLocaleString()}</span> covers
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-2.5 min-h-0">
          <table className="w-full min-w-[520px] text-center text-sm border-separate border-spacing-0 rounded-xl overflow-hidden ring-1 ring-slate-200">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-1.5 text-left border-b border-r border-slate-200">Item</th>
                {platforms.map((platform) => (
                  <th key={platform} className="px-3 py-1.5 border-b border-r border-slate-200 last:border-r-0">
                    <span className="bg-white shadow-sm border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700">{platform}</span>
                  </th>
                ))}
                <th className="px-4 py-1.5 text-right border-b border-l border-slate-200 bg-teal-50/50 text-teal-800">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              <tr className="hover:bg-slate-50/50 transition">
                <td className="px-4 py-3 text-left font-black text-slate-800 border-r border-slate-200">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-teal-600 opacity-80" />
                    Shipping Cover
                  </div>
                </td>
                {platforms.map((platform) => {
                  const row = byPlatform.get(platform);
                  return (
                    <td key={platform} className="px-3 py-3 border-r border-slate-100 last:border-r-0">
                      {editing && row ? (
                        <input
                          type="number"
                          min={0}
                          value={row.qty}
                          onChange={(e) => updateRow(row._key, "qty", e.target.value)}
                          className="mx-auto w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-center text-sm font-black text-slate-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all shadow-inner"
                        />
                      ) : (
                        row?.qty ? <span className="inline-block bg-white text-teal-800 px-3 py-1.5 rounded-lg font-black tabular-nums text-sm border border-slate-200 shadow-sm">{row.qty.toLocaleString()}</span> : <span className="text-slate-300">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right font-black text-teal-700 tabular-nums text-lg border-l border-slate-200 bg-teal-50/30">
                  {total.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50/80 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20 shrink-0">
        <div className="mx-auto flex max-w-[1600px] w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                <Layers size={20} className="text-[#0F2137]" />
                Packing Inventory
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Shipping labels, covers, packing covers, and boards tracking.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadAllTables}
              disabled={downloading || loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <Download size={14} />
              {downloading ? "Downloading..." : "Export Excel"}
            </button>

            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition"
                >
                  <X size={15} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveRows}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-1.5 text-xs font-bold text-white hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 transition shadow-sm"
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-4 py-1.5 text-xs font-bold text-white hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50 transition shadow-sm"
              >
                <Edit3 size={15} />
                Edit Inventory
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full flex-1 overflow-hidden flex bg-white/40">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-200/60 bg-slate-50/50 backdrop-blur-xl shrink-0 flex flex-col p-4 gap-2 overflow-y-auto z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2 px-2">Categories</div>
          {TABLES.map((table) => {
            const isActive = activeTable === table.type;
            return (
              <button
                key={table.type}
                onClick={() => setActiveTable(table.type)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all font-bold text-sm text-left ${
                  isActive 
                    ? 'bg-gradient-to-r from-teal-500/10 to-emerald-500/10 text-teal-800 shadow-sm ring-1 ring-teal-500/20' 
                    : 'text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${isActive ? 'bg-teal-500/20 text-teal-700' : 'bg-slate-200/50 text-slate-500'}`}>
                  {table.type === 'shipping_label' ? <Tag size={16} /> : 
                   table.type === 'packing_cover' ? <FileText size={16} /> : 
                   table.type === 'packing_board' ? <Box size={16} /> : 
                   <Layers size={16} />}
                </div>
                {table.title}
              </button>
            );
          })}
        </aside>

        {/* Center Content */}
        <section className="flex-1 flex flex-col min-w-0 overflow-hidden px-6 py-6 gap-6 bg-slate-50/30">
          
          {/* Top Graph */}
          <div className="h-48 bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/20 p-4 shrink-0 flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50/30 via-transparent to-transparent pointer-events-none" />
            <div className="flex items-center justify-between mb-4 relative">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <div className="p-1.5 bg-teal-500/10 text-teal-600 rounded-lg"><Activity size={16} /></div>
                30-Day Usage History
              </h3>
              {loadingHistory && <RefreshCw size={14} className="animate-spin text-slate-400" />}
            </div>
            
            <div className="flex-1 min-h-0 relative">
              {historyData.length === 0 && !loadingHistory ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <BarChart3 size={32} className="mb-2 opacity-20" />
                  <span className="text-xs font-bold">No usage data recorded yet</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorUsed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0F2137" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0F2137" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorRestocked" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}
                    />
                    <Area type="monotone" dataKey="used" name="Used Qty" stroke="#0F2137" strokeWidth={3} fillOpacity={1} fill="url(#colorUsed)" />
                    <Area type="monotone" dataKey="restocked" name="Restocked" stroke="#0d9488" strokeWidth={3} fillOpacity={1} fill="url(#colorRestocked)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="shrink min-h-0 overflow-hidden flex flex-col relative">
            <div className="absolute top-4 right-6 z-10 flex max-w-xs items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-md">
              <Search size={14} className="text-slate-400" />
              <input
                type="search"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search items..."
                className="w-full bg-transparent text-xs font-bold outline-none text-slate-800 placeholder-slate-400"
              />
              {searchFilter && <button onClick={() => setSearchFilter("")}><X size={14} className="text-rose-500 hover:text-rose-700"/></button>}
            </div>
            
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-500 font-medium text-sm bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-200/60">
                <RefreshCw size={20} className="animate-spin text-[#0F2137] mr-2" />
                Loading inventory...
              </div>
            ) : (
              activeTable === "shipping_cover" 
                ? renderShippingCoverTable(TABLES.find(t => t.type === 'shipping_cover'))
                : renderSimpleTable(TABLES.find(t => t.type === activeTable))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
