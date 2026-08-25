import re

file_path = 'f:/Inventory-Management/frontend/src/pages/PackingInventoryPage.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Replace h-full with h-fit to prevent stretching
code = code.replace('h-full group w-full', 'group w-full max-h-full h-fit')

# Replace flex-1 with shrink on the table container
# Current: <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
code = code.replace(
    'className="flex-1 min-h-0 overflow-hidden flex flex-col relative"',
    'className="shrink min-h-0 overflow-hidden flex flex-col relative"'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)
