import re

file_path = 'f:/Inventory-Management/frontend/src/pages/PackingInventoryPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
lucide_import_pat = r'import \{\s*(.*?)\s*\} from "lucide-react";'
def add_icons(m):
    icons = m.group(1).replace('\n', '').split(',')
    icons = [i.strip() for i in icons if i.strip()]
    for new_icon in ['BarChart3', 'TrendingUp', 'TrendingDown', 'Activity']:
        if new_icon not in icons:
            icons.append(new_icon)
    return 'import {\n  ' + ',\n  '.join(icons) + '\n} from "lucide-react";'
code = re.sub(lucide_import_pat, add_icons, code, flags=re.DOTALL)

# Add Recharts import right after lucide
if 'recharts' not in code:
    code = code.replace(
        'import { API_BASE',
        'import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";\nimport { API_BASE'
    )

# 2. Add state for activeTable and history
state_pat = r'const \[searchFilter, setSearchFilter\] = useState\(""\);'
state_rep = '''const [searchFilter, setSearchFilter] = useState("");
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
  }, [activeTable]);'''
code = re.sub(state_pat, state_rep, code)

# 3. Adjust renderSimpleTable and renderShippingCoverTable to NOT have h-full if we want them to flex properly, actually h-full is fine.
# But we should remove the 'group' from section to avoid issues, or keep it.
# The table section already has `flex flex-col relative h-full group`. This is perfect for flex-1 container.
code = code.replace('h-full group', 'h-full group w-full')

# 4. Replace the main content layout
main_pat = r'<main className="mx-auto max-w-\[1600px\] w-full flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">.*?</main>'

main_rep = '''<main className="mx-auto w-full flex-1 overflow-hidden flex bg-white/40">
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
          <div className="h-64 bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/20 p-5 shrink-0 flex flex-col relative overflow-hidden group">
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
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
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
      </main>'''

code = re.sub(main_pat, main_rep, code, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
