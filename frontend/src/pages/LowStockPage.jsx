import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../api.js";
import { AlertTriangle, ChevronLeft } from "lucide-react";

function StockTable({ title, rows, sticker }) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200/80 bg-white/60 flex items-center justify-between">
        <h2 className="font-bold text-slate-900">{title}</h2>
        <span className="text-sm font-semibold text-red-600">
          {rows.length}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="bg-[#1F4E78] text-white text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-2.5">Style</th>
              <th className="text-left px-4 py-2.5">Color</th>
              {!sticker && <th className="text-left px-4 py-2.5">Size</th>}
              <th className="text-right px-4 py-2.5">Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={sticker ? 3 : 4}
                  className="px-4 py-12 text-center text-slate-500 bg-white/70"
                >
                  No low stock items.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={`${item.style}-${item.color}-${item.size ?? "sticker"}`}
                  className="border-b border-slate-100 bg-white/70"
                >
                  <td className="px-4 py-2 font-medium">{item.style}</td>
                  <td className="px-4 py-2">{item.color}</td>
                  {!sticker && <td className="px-4 py-2">{item.size}</td>}
                  <td className="px-4 py-2 text-right font-semibold text-red-600 tabular-nums">
                    {item.qty}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LowStockPage() {
  const [alerts, setAlerts] = useState({
    count: 0,
    stock_items: [],
    sticker_items: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAlerts = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API_BASE}/stock-alerts`);
        setAlerts({
          count: data.count || 0,
          stock_items: data.stock_items || [],
          sticker_items: data.sticker_items || [],
        });
      } catch (error) {
        console.error("Failed to load stock alerts", error);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-100 text-slate-800">
      <div className="border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ChevronLeft size={18} />
            Home
          </Link>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="text-red-600" size={22} />
            Low stock details
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-5">
          <p className="text-sm text-slate-500">
            {loading
              ? "Loading low stock items..."
              : `${alerts.count} total low stock item${alerts.count === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <StockTable
            title="Low stock inventory piece"
            rows={alerts.stock_items}
          />
          <StockTable
            title="Low sticker qty"
            rows={alerts.sticker_items}
            sticker
          />
        </div>
      </div>
    </div>
  );
}
