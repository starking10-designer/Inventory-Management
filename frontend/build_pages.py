import re
import os

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

stock_code = read_file('src/pages/StockInventoryPage.jsx')

# --- Build StickerInventoryPage.jsx ---
stick_code = stock_code

# Replace keys
stick_code = stick_code.replace('"stock_inventory_saved_styles"', '"sticker_inventory_saved_styles"')
stick_code = stick_code.replace('"stock_inventory_saved_colors"', '"sticker_inventory_saved_colors"')

# Class name
stick_code = stick_code.replace('StockInventoryPage', 'StickerInventoryPage')

# State variable for saving
stick_code = stick_code.replace('stockUploading', 'stickerUploading')
stick_code = stick_code.replace('setStockUploading', 'setStickerUploading')
stick_code = stick_code.replace('stockDownloading', 'stickerDownloading')
stick_code = stick_code.replace('setStockDownloading', 'setStickerDownloading')
stick_code = stick_code.replace('stockRows', 'stickerRows')
stick_code = stick_code.replace('setStockRows', 'setStickerRows')

# API changes
stick_code = stick_code.replace('loadStockInventory', 'loadStickerInventory')
stick_code = stick_code.replace('"/stock-inventory"', '"/sticker-inventory"')
stick_code = stick_code.replace('downloadStockInventory', 'downloadStickerInventory')
stick_code = stick_code.replace('uploadStockFile', 'uploadStickerFile')
stick_code = stick_code.replace('"/upload-stock-inventory"', '"/upload-sticker-inventory"')
stick_code = stick_code.replace('"stock"', '"sticker"')
stick_code = stick_code.replace('"stock_inventory.xlsx"', '"sticker_inventory.xlsx"')

# Text content
stick_code = stick_code.replace('Stock Inventory', 'Sticker Inventory')
stick_code = stick_code.replace('Upload Stock Excel', 'Upload Stickers')
stick_code = stick_code.replace('Plain pieces stock categorized by user-selected styles, colors, and standard sizes (M, L, XL).', 'detailed DTF Sticker quantity')
stick_code = stick_code.replace('<Package size={20} className="text-[#0F2137]" />', '<Tag size={20} className="text-[#0F2137]" />')
stick_code = stick_code.replace('import {', 'import {\n  Tag,', 1)

# Remove size logic
stick_code = re.sub(r'const SIZES = useMemo\(\(\) => getSortedSizes\(stickerRows\), \[stickerRows\]\);\n?', '', stick_code)
stick_code = stick_code.replace('sizes: [],', '')
stick_code = stick_code.replace('sizes: []', '')
stick_code = re.sub(r'const \[checkedSizes, setCheckedSizes\] = useState\(new Set\(\)\);\n?', '', stick_code)

stick_code = re.sub(r'let initialSizes = new Set\(\);.*?setCheckedSizes\(initialSizes\);\n?', '', stick_code, flags=re.DOTALL)
stick_code = stick_code.replace('setCheckedSizes(new Set(savedSnapshot.sizes));\n', '')
stick_code = stick_code.replace(', sizes: []', '')

# Remove Size sorting functions
stick_code = re.sub(r'const SIZE_ORDER_MAP = \{.*?\};\n?', '', stick_code, flags=re.DOTALL)
stick_code = re.sub(r'function getSortedSizes\(rows\) \{.*?\}\n?', '', stick_code, flags=re.DOTALL)
stick_code = re.sub(r'function getSavedSizes\(\) \{.*?\}\n?', '', stick_code, flags=re.DOTALL)
stick_code = stick_code.replace('const STORAGE_SIZES_KEY = "inventory_saved_sizes";\n', '')

# Update Pivot Logic for Stickers
pivot_regex = re.compile(r'const pivotTableData = useMemo\(\(\) => \{.*?return tableRows;\n  \}, \[stickerRows, checkedStyles, checkedColors\]\);', re.DOTALL)

match = pivot_regex.search(stick_code)
if match:
    sticker_pivot_logic = """const pivotTableData = useMemo(() => {
    const activeStyles = Array.from(checkedStyles);
    const activeColors = Array.from(checkedColors);

    // Map existing rows by (style, color)
    const existingMap = new Map();
    for (const r of stickerRows) {
      const key = `${r.style.trim().toLowerCase()}\\x00${r.color.trim().toLowerCase()}`;
      existingMap.set(key, { id: r.id, qty: Number(r.qty || 0) });
    }

    const tableRows = [];

    for (const styleName of activeStyles) {
      for (const colorName of activeColors) {
        const key = `${styleName.trim().toLowerCase()}\\x00${colorName.trim().toLowerCase()}`;
        const found = existingMap.get(key);
        const qty = found ? found.qty : 0;
        
        tableRows.push({
          style: styleName,
          color: colorName,
          displayColor: colorName,
          total: qty,
          id: found ? found.id : null,
          qty: qty
        });
      }
    }

    return tableRows;
  }, [stickerRows, checkedStyles, checkedColors]);"""
    stick_code = stick_code.replace(match.group(0), sticker_pivot_logic)


# Modify saveCell logic
save_stock_cell_regex = re.compile(r'const saveStockCell = async.*?\n  };', re.DOTALL)
match = save_stock_cell_regex.search(stick_code)
if match:
    save_sticker_cell_code = """const saveStickerCell = async (id) => {
    const qty = parseInt(editQty, 10);
    if (Number.isNaN(qty) || qty < 0) {
      alert("Enter a valid non-negative quantity");
      return;
    }

    try {
      await axios.patch(
        `${API_BASE}/sticker-inventory/${id}`,
        { qty },
        { headers: getAdminKeyHeader() },
      );
      setEditingCell(null);
      await loadStickerInventory();
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail;
      alert(
        typeof msg === "string"
          ? msg
          : "Save failed. Set VITE_ADMIN_KEY in frontend .env to match server ADMIN_API_KEY.",
      );
    }
  };"""
    stick_code = stick_code.replace(match.group(0), save_sticker_cell_code)


# Fix the rendering of table header and body
stick_code = stick_code.replace('const colSpan = 3 + SIZES.length;', 'const colSpan = 3;')


# Remove size headers
sizes_header_regex = re.compile(r'\{SIZES\.map\(\(size\) => \(\s*<th key=\{size\}.*?\{size\}\s*</th>\s*\)\)\}', re.DOTALL)
stick_code = sizes_header_regex.sub('', stick_code)

# Replace body mapping
body_map_regex = re.compile(r'\{SIZES\.map\(\(size\) => \{(.*?)\}\)\}', re.DOTALL)
match = body_map_regex.search(stick_code)
if match:
    sticker_body_cell = """
                        <td className="px-3 py-3 tabular-nums text-xs">
                          {!row.id ? (
                            <span className="text-slate-300">-</span>
                          ) : editingCell === row.id ? (
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveStickerCell(row.id);
                                  }
                                }}
                                className="w-16 rounded border border-[#0F2137] bg-white px-1.5 py-0.5 text-center text-xs font-bold text-slate-900 outline-none"
                              />
                              <div className="flex gap-1">
                                <button type="button" onClick={() => saveStickerCell(row.id)} className="text-[#0F2137] text-[10px] font-extrabold hover:underline">
                                  Save
                                </button>
                                <button type="button" onClick={() => setEditingCell(null)} className="text-slate-400 text-[10px]">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCell(row.id);
                                setEditQty(String(row.qty));
                              }}
                              className={`w-full py-0.5 rounded transition font-semibold ${
                                row.qty > 0
                                  ? "text-slate-900 font-bold hover:bg-slate-100"
                                  : "text-slate-400 hover:text-slate-700"
                              }`}
                              title="Click to edit quantity"
                            >
                              {formatCellQty(row.qty)}
                            </button>
                          )}
                        </td>
"""
    stick_code = stick_code.replace(match.group(0), sticker_body_cell)

# For stickers we just remove the Total column completely since there are no sizes
stick_code = stick_code.replace('<td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">\n                        {formatCellQty(row.total)}\n                      </td>', '')
stick_code = stick_code.replace('<th className="px-4 py-3 min-w-[110px] text-right">', '<th className="px-4 py-3 min-w-[110px] text-right hidden">')


footer_regex = re.compile(r'\{SIZES\.map\(\(size\) => \{(.*?)\}\)\}', re.DOTALL)
match = footer_regex.search(stick_code)
if match:
    stick_code = stick_code.replace(match.group(0), '')

write_file('src/pages/StickerInventoryPage.jsx', stick_code)

print("Done Sticker")
