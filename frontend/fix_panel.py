import sys
import re

filepath = 'f:/Inventory-Management/frontend/src/components/DailyReportSection.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

if 'import { createPortal }' not in content:
    content = content.replace('import { useState, useEffect, useMemo } from "react";', 'import { useState, useEffect, useMemo } from "react";\nimport { createPortal } from "react-dom";')

start_idx = content.find('function ZoneSummaryPanel({')
end_idx = content.find('function FlipkartZoneBatchModal({')

new_panel = '''function ZoneSummaryPanel({ show, summary, reportDate, onClose, onViewBatch, onDeleteBatch }) {
  const groupedItems = summary?.items ? summary.items.reduce((acc, item) => {
    const platform = item.platform || "Flipkart";
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(item);
    return acc;
  }, {}) : {};

  if (!show) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-5xl rounded-[24px] border border-slate-200/60 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100/60 p-2.5 rounded-xl text-blue-600">
              <Package size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 id="flipkart-zone-title" className="text-lg font-black text-slate-900 leading-tight tracking-tight">
                Zone Summary
              </h2>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                {formatReportDate(reportDate)} &bull; {summary.total || 0} Label{summary.total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
          {Object.entries(groupedItems).map(([platform, items]) => {
            const platformTotal = items.reduce((sum, it) => sum + it.label_count, 0);
            return (
              <div key={platform} className="flex flex-col gap-3">
                <div className="flex items-center gap-3 px-1">
                  <h3 className="font-black text-slate-800 text-sm tracking-tight">{platform}</h3>
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums">
                    {platformTotal}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {items.map((item) => (
                    <div
                      key={item.zone}
                      className="group bg-white px-3 py-2 rounded-[14px] border border-slate-200 shadow-sm flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all cursor-default"
                    >
                      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wide">
                        {item.zone}
                      </span>
                      <span className="text-base font-black text-[#0F2137] tabular-nums">
                        {item.label_count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {(summary.batches ?? []).length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3.5 px-1">
              Processed Batches
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {summary.batches.map((batch, index) => (
                <div
                  key={batch.id}
                  className="group flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-blue-200 hover:shadow-md transition-all overflow-hidden"
                >
                  <div className="px-3.5 py-3 flex justify-between items-center border-b border-slate-50">
                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider truncate pr-2">
                      {batch.platform || "Flipkart"} #{index + 1}
                    </span>
                    <span className="font-black text-[#0F2137] text-sm tabular-nums shrink-0">
                      {batch.label_count}
                    </span>
                  </div>
                  <div className="flex bg-slate-50/50 divide-x divide-slate-100">
                    <button
                      type="button"
                      onClick={() => onViewBatch(batch)}
                      className="flex-1 py-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex justify-center"
                      title="View Batch Details"
                    >
                      <Eye size={16} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBatch && onDeleteBatch(batch)}
                      className="flex-1 py-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex justify-center"
                      title="Delete Batch"
                    >
                      <Trash2 size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

'''

content = content[:start_idx] + new_panel + content[end_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated ZoneSummaryPanel successfully')
