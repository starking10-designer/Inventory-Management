import { useState, useRef, useEffect, useMemo } from "react";
import {
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  Check,
  X,
  ChevronDown,
} from "lucide-react";

/**
 * Excel-like column header filter and sort component
 */
export default function ExcelHeaderFilter({
  label,
  columnKey,
  values = [], // unique values available in this column
  selectedValues = [], // array of selected values (empty = all)
  onFilterChange, // (newSelectedValues) => void
  sortField,
  sortAsc,
  onSort, // (columnKey, asc) => void
  align = "left", // "left" | "center" | "right"
  isNumeric = false,
  numericStockFilter = null, // "all" | "in_stock" | "zero_stock"
  onNumericStockChange = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef(null);

  const isFiltered =
    (selectedValues && selectedValues.length > 0 && selectedValues.length < values.length) ||
    (isNumeric && numericStockFilter && numericStockFilter !== "all");

  const isSorted = sortField === columnKey;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const filteredValues = useMemo(() => {
    if (!search.trim()) return values;
    return values.filter((v) =>
      String(v || "").toLowerCase().includes(search.trim().toLowerCase()),
    );
  }, [values, search]);

  const allSelected =
    !selectedValues || selectedValues.length === 0 || selectedValues.length === values.length;

  const handleSelectAllToggle = () => {
    if (allSelected) {
      onFilterChange([]);
    } else {
      onFilterChange([...values]);
    }
  };

  const handleItemToggle = (val) => {
    let next;
    if (allSelected) {
      next = values.filter((v) => v !== val);
    } else if (selectedValues.includes(val)) {
      next = selectedValues.filter((v) => v !== val);
    } else {
      next = [...selectedValues, val];
    }
    onFilterChange(next);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onFilterChange([]);
    if (onNumericStockChange) onNumericStockChange("all");
    setIsOpen(false);
  };

  return (
    <div
      ref={popoverRef}
      className={`relative inline-flex items-center gap-1.5 select-none w-full ${
        align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-between"
      }`}
    >
      {/* Title & Sort trigger */}
      <div
        onClick={() => onSort && onSort(columnKey, isSorted ? !sortAsc : true)}
        className="inline-flex items-center gap-1 cursor-pointer font-bold text-slate-700 hover:text-slate-950 transition py-1"
      >
        <span>{label}</span>
        {isSorted && (
          sortAsc ? (
            <ArrowUp size={13} className="text-[#0F2137]" />
          ) : (
            <ArrowDown size={13} className="text-[#0F2137]" />
          )
        )}
      </div>

      {/* Excel Filter Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center justify-center p-1 rounded-md transition ${
          isFiltered
            ? "bg-[#0F2137] text-white shadow-xs"
            : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
        }`}
        title={`Filter ${label}`}
      >
        <Filter size={12} />
        <ChevronDown size={10} className="ml-0.5 opacity-70" />
      </button>

      {/* Floating Excel Filter Popover */}
      {isOpen && (
        <div
          className="absolute top-full mt-1.5 z-50 w-64 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-xl text-left font-normal normal-case text-xs text-slate-800"
          style={{ [align === "right" ? "right" : "left"]: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sorting Quick Actions */}
          {onSort && (
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  onSort(columnKey, true);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition ${
                  isSorted && sortAsc ? "bg-slate-100 text-[#0F2137] font-bold" : ""
                }`}
              >
                <ArrowUp size={13} />
                Sort A to Z (Ascending)
              </button>
              <button
                type="button"
                onClick={() => {
                  onSort(columnKey, false);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition ${
                  isSorted && !sortAsc ? "bg-slate-100 text-[#0F2137] font-bold" : ""
                }`}
              >
                <ArrowDown size={13} />
                Sort Z to A (Descending)
              </button>
            </div>
          )}

          {/* Numeric Quick Filter */}
          {isNumeric && onNumericStockChange && (
            <div className="border-b border-slate-100 pb-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Stock Condition</p>
              <div className="flex flex-col gap-1">
                {[
                  { id: "all", label: "All Values" },
                  { id: "in_stock", label: "> 0 (In Stock Only)" },
                  { id: "zero_stock", label: "= 0 (Zero Stock Only)" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onNumericStockChange(opt.id);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 ${
                      numericStockFilter === opt.id ? "bg-[#0F2137]/10 text-[#0F2137] font-bold" : ""
                    }`}
                  >
                    <span>{opt.label}</span>
                    {numericStockFilter === opt.id && <Check size={13} className="text-[#0F2137]" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Value List / Checkbox Filter */}
          {values.length > 0 && !isNumeric && (
            <>
              {/* Search box inside filter */}
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${label}...`}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-[#0F2137] focus:bg-white"
                />
              </div>

              {/* Items List */}
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border-b border-slate-100 pb-2 mb-2">
                <label className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-50 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAllToggle}
                    className="rounded border-slate-300 text-[#0F2137] focus:ring-0"
                  />
                  <span>(Select All)</span>
                </label>

                {filteredValues.map((val) => {
                  const isChecked = allSelected || selectedValues.includes(val);
                  return (
                    <label
                      key={String(val)}
                      className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-slate-50 cursor-pointer text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleItemToggle(val)}
                        className="rounded border-slate-300 text-[#0F2137] focus:ring-0"
                      />
                      <span className="truncate">{val || "(Blank)"}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {/* Filter Footer Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-800"
            >
              Clear Filter
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg bg-[#0F2137] px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-slate-800"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
