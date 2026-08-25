import re

file_path = 'f:/Inventory-Management/frontend/src/pages/PackingInventoryPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update lucide-react imports
lucide_import_pat = r'import \{\s*ChevronLeft,\s*Download,\s*Edit3,\s*Layers,\s*Plus,\s*Save,\s*Trash2,\s*X,\s*RefreshCw,\s*Search,\s*\} from "lucide-react";'
lucide_import_rep = '''import {
  ChevronLeft,
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
} from "lucide-react";'''
code = re.sub(lucide_import_pat, lucide_import_rep, code)

# 2. Update renderSimpleTable style
# Header padding
code = code.replace(
    'className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5 bg-gradient-to-r from-slate-50 to-white rounded-t-3xl"',
    'className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-white rounded-t-3xl"'
)
# Inner padding
code = code.replace(
    'className="flex-1 overflow-auto p-2 min-h-0"',
    'className="flex-1 overflow-auto p-2.5 min-h-0"'
)

# Replace table rows rendering in renderSimpleTable
# Before: <span className="group-hover:text-[#0F2137] transition-colors">{row.name || "-"}</span>
# After: <div className="flex items-center gap-2"><Tag size={16} className="text-slate-400" /> <span className="group-hover:text-[#0F2137] transition-colors">{row.name || "-"}</span></div>
# Let's use a dynamic icon block!
dynamic_icon = '''<div className="flex items-center gap-2.5">
                          {table.type === 'shipping_label' ? <Tag size={15} className="text-[#0F2137] opacity-60" /> : 
                           table.type === 'packing_cover' ? <FileText size={15} className="text-[#0F2137] opacity-60" /> : 
                           table.type === 'packing_board' ? <Box size={15} className="text-[#0F2137] opacity-60" /> : 
                           <Layers size={15} className="text-[#0F2137] opacity-60" />}
                          <span className="group-hover:text-[#0F2137] transition-colors">{row.name || "-"}</span>
                        </div>'''

code = code.replace(
    '<span className="group-hover:text-[#0F2137] transition-colors">{row.name || "-"}</span>',
    dynamic_icon
)

# Reduce simple table header height
code = code.replace('px-4 py-3 text-left', 'px-3 py-2.5 text-left')
code = code.replace('px-4 py-3 text-right', 'px-3 py-2.5 text-right')
code = code.replace('px-4 py-3 text-center', 'px-3 py-2.5 text-center')
code = code.replace('px-4 py-2.5 font-bold', 'px-3 py-2 font-bold')
code = code.replace('px-4 py-2.5 text-right', 'px-3 py-2 text-right')
code = code.replace('px-4 py-2.5 text-center', 'px-3 py-2 text-center')

# Pill style simple table
code = code.replace(
    'row.qty ? <span className="bg-slate-200/50 px-2 py-1 rounded-md">{row.qty.toLocaleString()}</span> :',
    'row.qty ? <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-extrabold tabular-nums border border-slate-200/60 shadow-sm">{row.qty.toLocaleString()}</span> :'
)

# 3. Update renderShippingCoverTable
# Header padding
code = code.replace(
    'className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5 bg-gradient-to-r from-slate-50 to-white"',
    'className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-gradient-to-r from-slate-50 to-white"'
)
code = code.replace(
    'className="flex-1 overflow-auto p-4 min-h-0"',
    'className="flex-1 overflow-auto p-2.5 min-h-0"'
)

# Table cells padding
code = code.replace('px-6 py-4 text-left', 'px-4 py-2.5 text-left')
code = code.replace('px-4 py-4 border-b', 'px-3 py-2.5 border-b')
code = code.replace('px-6 py-4 text-right', 'px-4 py-2.5 text-right')

code = code.replace('px-6 py-5 text-left', 'px-4 py-3 text-left')
code = code.replace('px-4 py-5 border-r', 'px-3 py-3 border-r')
code = code.replace('px-6 py-5 text-right', 'px-4 py-3 text-right')

# Shipping cover row icon
code = code.replace(
    '<div className="w-2 h-2 rounded-full bg-teal-500" />',
    '<Package size={16} className="text-teal-600 opacity-80" />'
)

# Shipping cover pill style
code = code.replace(
    'row?.qty ? <span className="inline-block bg-slate-100 px-3 py-1.5 rounded-lg font-black text-slate-700 tabular-nums text-sm border border-slate-200 shadow-sm">{row.qty.toLocaleString()}</span>',
    'row?.qty ? <span className="inline-block bg-white text-teal-800 px-3 py-1.5 rounded-lg font-black tabular-nums text-sm border border-slate-200 shadow-sm">{row.qty.toLocaleString()}</span>'
)

# 4. Reduce margin of the page
code = code.replace(
    '<main className="mx-auto max-w-[1600px] w-full flex-1 overflow-hidden px-6 py-4 flex flex-col gap-4">',
    '<main className="mx-auto max-w-[1600px] w-full flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">'
)
code = code.replace(
    'mx-auto flex max-w-7xl w-full flex-wrap items-center justify-between gap-4 px-6 py-4',
    'mx-auto flex max-w-7xl w-full flex-wrap items-center justify-between gap-3 px-4 py-3'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
