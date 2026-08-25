import re

file_path = 'f:/Inventory-Management/frontend/src/pages/PackingInventoryPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Reduce chart height
code = code.replace(
    'className="h-64 bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/20 p-5 shrink-0 flex flex-col relative overflow-hidden group"',
    'className="h-48 bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/20 p-4 shrink-0 flex flex-col relative overflow-hidden group"'
)

# Further reduce table padding
code = code.replace('py-2.5', 'py-1.5')
code = code.replace('py-2', 'py-1.5')

# Except keep specific paddings that might be too squished (e.g., header py-3 is fine)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
