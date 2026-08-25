import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import DailyReportSection from "../components/DailyReportSection.jsx";

export default function DailyReportPage() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            to="/#daily-report"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <ChevronLeft size={16} />
            Back to Dashboard
          </Link>
          <span className="rounded-xl bg-[#0F2137]/10 border border-[#0F2137]/20 px-3 py-1 text-xs font-bold text-[#0F2137]">
            Daily Dispatches
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        <DailyReportSection />
      </main>
    </div>
  );
}
