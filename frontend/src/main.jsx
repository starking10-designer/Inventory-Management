import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { WorkspacePageLayout } from "./components/WorkspaceNavigation.jsx";
import DailyReportPage from "./pages/DailyReportPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import StockInventoryPage from "./pages/StockInventoryPage.jsx";
import StockAnalysisPage from "./pages/StockAnalysisPage.jsx";
import StickerAnalysisPage from "./pages/StickerAnalysisPage.jsx";
import StickerInventoryPage from "./pages/StickerInventoryPage.jsx";
import LowStockPage from "./pages/LowStockPage.jsx";
import SalesReportsPage from "./pages/SalesReportsPage.jsx";
import SalesAnalyticsReportPage from "./pages/SalesAnalyticsReportPage.jsx";
import SalesAnalyticsDetailPage from "./pages/SalesAnalyticsDetailPage.jsx";
import SkuMasterPage from "./pages/SkuMasterPage.jsx";
import PackingInventoryPage from "./pages/PackingInventoryPage.jsx";
import ReturnAnalysisPage from "./pages/ReturnAnalysisPage.jsx";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Initialize Lenis for butter smooth scrolling but faster
const lenis = new Lenis({
  autoRaf: true,
  lerp: 0.2, // Higher lerp = faster, more responsive (default is 0.1)
  wheelMultiplier: 1.5, // Scroll further per wheel tick
});

// Fallback manual requestAnimationFrame if autoRaf is not supported in the installed version
if (!lenis.options?.autoRaf) {
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<WorkspacePageLayout />}>
          <Route path="/daily-report" element={<DailyReportPage />} />
          <Route path="/return-inventory" element={<InventoryPage />} />
          <Route path="/return-inventory/analysis" element={<ReturnAnalysisPage />} />
          <Route path="/inventory" element={<Navigate to="/return-inventory" replace />} />
          <Route path="/stock-inventory" element={<StockInventoryPage />} />
          <Route path="/stock-inventory/analysis" element={<StockAnalysisPage />} />
          <Route path="/sticker-inventory/sticker-analysis" element={<StickerAnalysisPage />} />
          <Route path="/sticker-inventory" element={<StickerInventoryPage />} />
          <Route path="/low-stock" element={<LowStockPage />} />
          <Route path="/sales-reports" element={<SalesReportsPage />} />
          <Route path="/sku-master" element={<SkuMasterPage />} />
          <Route path="/packing-inventory" element={<PackingInventoryPage />} />
          <Route
            path="/sales-analytics-report"
            element={<SalesAnalyticsReportPage />}
          />
          <Route
            path="/sales-analytics-report/:reportType"
            element={<SalesAnalyticsDetailPage />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
