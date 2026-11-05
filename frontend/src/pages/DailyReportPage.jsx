import WorkspaceTopBar from "../components/WorkspaceTopBar.jsx";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import DailyReportSection from "../components/DailyReportSection.jsx";

export default function DailyReportPage() {
  return (
    <div className="daily-orders-page text-slate-800">
      <WorkspaceTopBar>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/#daily-report" className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 glass px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:glass transition">
            <ChevronLeft size={16} />
            Back to Dashboard
          </Link>
          <span className="rounded-xl bg-[#0F2137]/10 border border-[#0F2137]/20 px-3 py-1 text-xs font-bold text-[#0F2137]">Daily Dispatches</span>
        </div>
      </WorkspaceTopBar>
      {/* Main Content */}
      <main data-lenis-prevent className="daily-orders-content mx-auto max-w-[1600px] w-full px-6 py-6">
        <DailyReportSection />
      </main>
    </div>
  );
}
