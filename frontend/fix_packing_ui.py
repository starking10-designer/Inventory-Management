import re

file_path = 'f:/Inventory-Management/frontend/src/pages/PackingInventoryPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update main tag layout
code = code.replace(
    '<main className="mx-auto max-w-7xl w-full flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 space-y-6">',
    '<main className="mx-auto max-w-[1600px] w-full flex-1 overflow-hidden px-6 py-4 flex flex-col gap-4">'
)

# 2. Update the grid layout wrapper
grid_pat = r'<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">\s*\{TABLES\.map\(\(table\) =>\s*table\.type === "shipping_cover"\s*\?\s*<div className="lg:col-span-2">\{renderShippingCoverTable\(table\)\}</div>\s*:\s*renderSimpleTable\(table\),\s*\)\}\s*</div>'
grid_rep = '''<div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1 min-h-0 overflow-hidden pb-4">
            {TABLES.map((table) =>
              table.type === "shipping_cover"
                ? renderShippingCoverTable(table)
                : renderSimpleTable(table),
            )}
          </div>'''
code = re.sub(grid_pat, grid_rep, code, flags=re.DOTALL)

# 3. Remove gridColumn inline styles
code = re.sub(r'\s*style=\{\{ gridColumn: table\.type === "shipping_cover" \? "1 / -1" : undefined \}\}', '', code)
code = re.sub(r'\s*style=\{\{ gridColumn: "1 / -1" \}\}', '', code)

# 4. Make tables scrollable by ensuring overflow-auto behaves correctly inside the section
code = code.replace(
    'className="flex-1 overflow-auto p-2"',
    'className="flex-1 overflow-auto p-2 min-h-0"'
)
code = code.replace(
    'className="overflow-auto p-4 flex-1"',
    'className="flex-1 overflow-auto p-4 min-h-0"'
)

# Wait, check if there's any overflow-hidden that needs adjustment.
# The section has flex flex-col relative h-full group overflow-hidden.
# This should allow the inner flex-1 overflow-auto to scroll correctly.

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
