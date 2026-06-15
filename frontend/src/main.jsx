import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import DailyReportPage from "./pages/DailyReportPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import StockInventoryPage from "./pages/StockInventoryPage.jsx";
import StickerInventoryPage from "./pages/StickerInventoryPage.jsx";
import LowStockPage from "./pages/LowStockPage.jsx";
import SalesReportsPage from "./pages/SalesReportsPage.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/daily-report" element={<DailyReportPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/stock-inventory" element={<StockInventoryPage />} />
        <Route path="/sticker-inventory" element={<StickerInventoryPage />} />
        <Route path="/low-stock" element={<LowStockPage />} />
        <Route path="/sales-reports" element={<SalesReportsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
