import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Upload,
  Package,
  ListOrdered,
  Warehouse,
  ChevronRight,
  Printer,
  Trash2,
  AlertTriangle,
  Tag,
} from "lucide-react";
import { API_BASE } from "./api.js";
import SalesSection from "./components/SalesSection.jsx";
import {
  buildMarketplaceFormData,
  hasMarketplaceFiles,
  printFinalReport,
} from "./utils/printReport.js";
import {
  clearConfirmationMarketplaceFiles,
  clearPendingMarketplaceFiles,
  deletePendingMarketplaceFile,
  loadPendingMarketplaceFiles,
  savePendingMarketplaceFile,
} from "./utils/pendingMarketplaceFiles.js";

const getUploadErrorMessage = async (error, fallback) => {
  const responseData = error.response?.data;

  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      const json = JSON.parse(text);
      return json.detail || json.error || text || fallback;
    } catch {
      return fallback;
    }
  }

  const detail = responseData?.detail || responseData?.error;

  if (typeof detail === "string") {
    return detail;
  }

  if (detail) {
    return JSON.stringify(detail);
  }

  return error.message || fallback;
};

function App() {
  const [flipkartFile, setFlipkartFile] = useState(null);
  const [amazonFile, setAmazonFile] = useState(null);
  const [ajioFile, setAjioFile] = useState(null);
  const [meeshoFile, setMeeshoFile] = useState(null);
  const [myntraFile, setMyntraFile] = useState(null);
  const [skuMasterFile, setSkuMasterFile] = useState(null);
  const [activeSkuMaster, setActiveSkuMaster] = useState(null);
  const [loadingSkuMaster, setLoadingSkuMaster] = useState(true);

  const returnsFileInputRef = useRef(null);
  const [returnsUploading, setReturnsUploading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [showFinalReportDetails, setShowFinalReportDetails] = useState(false);

  const marketplaceFiles = () => ({
    flipkart: flipkartFile,
    amazon: amazonFile,
    ajio: ajioFile,
    meesho: meeshoFile,
    myntra: myntraFile,
  });

  const clearMarketplaceFileState = () => {
    setFlipkartFile(null);
    setAmazonFile(null);
    setAjioFile(null);
    setMeeshoFile(null);
    setMyntraFile(null);
  };

  const uploadCards = [
    {
      key: "flipkart",
      title: "Flipkart",
      state: flipkartFile,
      setState: setFlipkartFile,
    },
    {
      key: "amazon",
      title: "Amazon",
      state: amazonFile,
      setState: setAmazonFile,
    },
    {
      key: "ajio",
      title: "Ajio",
      state: ajioFile,
      setState: setAjioFile,
    },
    {
      key: "meesho",
      title: "Meesho",
      state: meeshoFile,
      setState: setMeeshoFile,
    },
    {
      key: "myntra",
      title: "Myntra",
      state: myntraFile,
      setState: setMyntraFile,
    },
  ];

  const downloadReportBlob = (blob) => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement("a");
    link.href = url;
    const today = new Date();
    const datePart = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;
    link.setAttribute("download", `final_report_${datePart}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const generateFinalReport = async () => {
    const files = marketplaceFiles();
    if (!hasMarketplaceFiles(files)) {
      alert("Upload at least one marketplace order file.");
      return;
    }

    setReportBusy(true);
    try {
      const formData = buildMarketplaceFormData(files);
      formData.append(
        "include_detail_columns",
        showFinalReportDetails ? "true" : "false",
      );
      const response = await axios.post(
        `${API_BASE}/export-final-report`,
        formData,
        { responseType: "blob" },
      );
      downloadReportBlob(response.data);
      await clearPendingMarketplaceFiles();
      await clearConfirmationMarketplaceFiles();
      clearMarketplaceFileState();
    } catch (error) {
      console.error(error);
      alert(await getUploadErrorMessage(error, "Failed to generate report"));
    } finally {
      setReportBusy(false);
    }
  };

  const printFinalReportOnly = async () => {
    const files = marketplaceFiles();
    if (!hasMarketplaceFiles(files)) {
      alert("Upload at least one marketplace order file to print.");
      return;
    }

    setReportBusy(true);
    try {
      const formData = buildMarketplaceFormData(files);
      const { data } = await axios.post(
        `${API_BASE}/generate-final-report`,
        formData,
      );
      printFinalReport(data.report, {
        generatedAt: new Date().toLocaleString("en-IN", { hour12: true }),
      });
    } catch (error) {
      console.error(error);
      alert(
        await getUploadErrorMessage(
          error,
          "Failed to prepare report for print",
        ),
      );
    } finally {
      setReportBusy(false);
    }
  };

  const uploadSkuMaster = async () => {
    if (!(skuMasterFile instanceof File)) {
      alert("Please select a valid SKU file");
      return;
    }

    try {
      const formData = new FormData();

      formData.append("file", skuMasterFile, skuMasterFile.name);

      console.log("Uploading:", skuMasterFile);

      const response = await axios.post(`${API_BASE}/upload-file`, formData);

      console.log(response.data);

      alert("SKU Master Uploaded Successfully");

      await fetchCurrentSkuMaster();
    } catch (error) {
      console.log("FULL ERROR:", error);

      console.log("RESPONSE DATA:", error.response?.data);

      console.log("RESPONSE STATUS:", error.response?.status);

      alert(await getUploadErrorMessage(error, "SKU Master upload failed"));
    }
  };

  const deleteSkuMaster = async () => {
    try {
      await axios.delete(`${API_BASE}/delete-sku-master`);
      setActiveSkuMaster(null);
      setSkuMasterFile(null);
      alert("SKU Master Deleted");
    } catch (error) {
      console.error(error);
      alert("Failed to delete SKU master");
    }
  };

  const fetchCurrentSkuMaster = async () => {
    try {
      const response = await axios.get(`${API_BASE}/current-sku-master`);
      if (response.data.filename) {
        setActiveSkuMaster(response.data.filename);
      } else {
        setActiveSkuMaster(null);
      }
    } catch (error) {
      console.error(error);
    }
    setLoadingSkuMaster(false);
  };

  useEffect(() => {
    fetchCurrentSkuMaster();
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([
      loadPendingMarketplaceFiles(),
      clearConfirmationMarketplaceFiles(),
    ])
      .then(([files]) => {
        if (!active) return;

        setFlipkartFile(files.flipkart);
        setAmazonFile(files.amazon);
        setAjioFile(files.ajio);
        setMeeshoFile(files.meesho);
        setMyntraFile(files.myntra);
      })
      .catch((error) => {
        console.error("Failed to restore marketplace files", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectMarketplaceFile = async (item, file) => {
    if (!file) return;

    try {
      await savePendingMarketplaceFile(item.key, file);
      item.setState(file);
    } catch (error) {
      console.error(error);
      alert("Failed to keep this file for refresh.");
    }
  };

  const deleteMarketplaceFile = async (item) => {
    try {
      await deletePendingMarketplaceFile(item.key);
      item.setState(null);
    } catch (error) {
      console.error(error);
      alert("Failed to remove this file.");
    }
  };

  const uploadReturnsFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReturnsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name || "returns.csv");
      const { data } = await axios.post(`${API_BASE}/upload-returns`, formData);
      const n = data.updated_items ?? 0;
      alert(`${data.message ?? "Done"} (${n} SKU piece updates)`);
    } catch (err) {
      console.error(err);
      alert(await getUploadErrorMessage(err, "Returns upload failed"));
    } finally {
      setReturnsUploading(false);
    }
  };

  const [alerts, setAlerts] = useState({
    count: 0,
    items: [],
    stock_count: 0,
    sticker_count: 0,
  });
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  const loadStockAlerts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/stock-alerts`);

      setAlerts({
        count: response.data.count || 0,
        items: response.data.items || [],
        stock_count: response.data.stock_count || 0,
        sticker_count: response.data.sticker_count || 0,
      });
    } catch (error) {
      console.error("Failed to load stock alerts", error);
    }
  };

  useEffect(() => {
    loadStockAlerts();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-100 text-slate-800">
      <div className="border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              I&D Inventory Management
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
              Warehouse Dispatch Dashboard
            </p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-white/55 border border-white/80 text-indigo-700 shadow-sm text-sm font-medium">
            Live Processing
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <Link
            to="/low-stock"
            className="group rounded-3xl bg-white/55 p-5 backdrop-blur-xl shadow-sm transition hover:border-red-300 hover:bg-red-50/40 border border-white/80"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">Low Stock Alerts</p>

                <h2 className="text-3xl font-bold text-red-600 mt-1">
                  {alerts.count}
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <div className="text-xs text-slate-600">
                Pieces: {alerts.stock_count} | Stickers: {alerts.sticker_count}
              </div>
              {alerts.items.slice(0, 3).map((item) => (
                <div
                  key={`${item.type}-${item.style}-${item.color}-${item.size ?? "sticker"}`}
                  className="text-xs text-red-600"
                >
                  {item.style} | {item.color}
                  {item.size ? ` | ${item.size}` : ""} ({item.qty})
                </div>
              ))}

              <span className="inline-flex items-center text-xs text-indigo-600 font-medium pt-1 group-hover:underline">
                Open detailed view
              </span>
            </div>
          </Link>
          <div className="rounded-3xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold">SKU Master</h2>
              <p className="text-slate-500 mt-1 text-xs">
                Marketplace SKU database
              </p>
            </div>
            {loadingSkuMaster ? (
              <div className="text-slate-500 text-sm">Loading...</div>
            ) : activeSkuMaster ? (
              <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-3 backdrop-blur">
                <p className="text-xs text-emerald-700">Active</p>
                <h3 className="text-sm font-semibold mt-1 truncate">
                  {activeSkuMaster}
                </h3>
                <button
                  type="button"
                  onClick={deleteSkuMaster}
                  className="mt-3 px-3 py-2 rounded-lg bg-red-100/90 border border-red-200 text-red-700 text-xs font-medium hover:bg-red-200 transition"
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-white/45 backdrop-blur">
                <input
                  type="file"
                  onChange={(e) => setSkuMasterFile(e.target.files[0])}
                  className="block w-full text-xs"
                />
                {skuMasterFile && (
                  <div className="mt-3 text-emerald-700 text-xs truncate">
                    {skuMasterFile.name}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!skuMasterFile}
                  onClick={uploadSkuMaster}
                  className="mt-3 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 text-white text-xs font-semibold hover:scale-[1.02] transition"
                >
                  Upload SKU
                </button>
              </div>
            )}
          </div>
        </div>

        <SalesSection />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          <Link
            to="/daily-report"
            className="group flex flex-col rounded-2xl border border-white/80 bg-white/55 p-5 backdrop-blur-xl shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <ListOrdered className="text-indigo-600" size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Daily order details
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Full table: date, platform, style, color, size, quantities.
                  </p>
                </div>
              </div>
              <ChevronRight
                className="text-slate-400 group-hover:text-indigo-600 shrink-0 mt-1"
                size={22}
              />
            </div>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-700">
              Open detailed view
            </span>
          </Link>

          <Link
            to="/inventory"
            className="group flex flex-col rounded-2xl border border-white/80 bg-white/55 p-5 backdrop-blur-xl shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <Warehouse className="text-emerald-600" size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Return inventory
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    maintain return stock levels by style, color, size, and
                    total pieces.
                  </p>
                </div>
              </div>
              <ChevronRight
                className="text-slate-400 group-hover:text-emerald-600 shrink-0 mt-1"
                size={22}
              />
            </div>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-700">
              Open detailed view
            </span>
          </Link>

          <Link
            to="/stock-inventory"
            className="group flex flex-col rounded-2xl border border-white/80 bg-white/55 p-5 backdrop-blur-xl shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <Package className="text-indigo-600" size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Stock inventory
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    plain pieces stock by color, size, and editable total.
                  </p>
                </div>
              </div>
              <ChevronRight
                className="text-slate-400 group-hover:text-indigo-600 shrink-0 mt-1"
                size={22}
              />
            </div>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-indigo-700">
              Open detailed view
            </span>
          </Link>

          <Link
            to="/sticker-inventory"
            className="group flex flex-col rounded-2xl border border-white/80 bg-white/55 p-5 backdrop-blur-xl shadow-sm transition hover:border-emerald-300 hover:bg-fuchsia-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <Tag className="text-emerals-600" size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Sticker inventory
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    LSDS and SN sticker stock by numbered color.
                  </p>
                </div>
              </div>
              <ChevronRight
                className="text-slate-400 group-hover:text-fuchsia-600 shrink-0 mt-1"
                size={22}
              />
            </div>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-700">
              Open detailed view
            </span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 items-start">
          <div className="rounded-2xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Upload Marketplace Files</h2>
              <p className="text-slate-500 mt-1 text-sm">
                Upload daily order sheets from marketplaces
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {uploadCards.map((item) => (
                <div
                  key={item.title}
                  className="relative rounded-xl border border-white/80 bg-white/45 backdrop-blur p-4 hover:border-indigo-300 hover:bg-indigo-50/70 transition-all duration-300 group"
                >
                  {item.state && (
                    <button
                      type="button"
                      title={`Remove ${item.title} file`}
                      onClick={() => deleteMarketplaceFile(item)}
                      className="absolute right-3 top-3 p-2 rounded-lg border border-red-200 bg-white/90 text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <label
                    className={`block ${
                      item.state ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="file"
                      className="hidden"
                      disabled={!!item.state}
                      onChange={(e) => {
                        selectMarketplaceFile(item, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                      <Upload size={20} className="text-indigo-600" />
                    </div>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="text-slate-500 text-sm mt-1">
                      Upload order report
                    </p>
                    {item.state && (
                      <div className="mt-4 rounded-lg bg-emerald-100/90 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 truncate">
                        {item.state.name}
                      </div>
                    )}
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3 items-center">
              <input
                ref={returnsFileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={uploadReturnsFile}
              />
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 font-semibold text-sm shadow-lg shadow-indigo-500/20 text-white hover:scale-[1.02] transition disabled:opacity-60"
                disabled={reportBusy}
                onClick={generateFinalReport}
              >
                {reportBusy ? "Generating…" : "Generate Final Report"}
              </button>
              <label className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/55 px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={showFinalReportDetails}
                  onChange={(event) =>
                    setShowFinalReportDetails(event.target.checked)
                  }
                />
                Detail columns
              </label>
              <button
                type="button"
                title="Print report (upload files first)"
                disabled={reportBusy}
                onClick={printFinalReportOnly}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition"
              >
                <Printer size={20} />
              </button>
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl bg-white/45 border border-white/80 font-semibold text-sm hover:bg-white/80 transition disabled:opacity-60"
                disabled={returnsUploading}
                onClick={() => returnsFileInputRef.current?.click()}
              >
                {returnsUploading ? "Uploading…" : "Upload Returns"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showLowStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-red-600">
                Low Stock Items ({alerts.count})
              </h2>

              <button
                onClick={() => setShowLowStockModal(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Style</th>
                    <th className="text-left py-2">Color</th>
                    <th className="text-left py-2">Size</th>
                    <th className="text-right py-2">Qty</th>
                  </tr>
                </thead>

                <tbody>
                  {alerts.items.map((item) => (
                    <tr
                      key={`${item.style}-${item.color}-${item.size}`}
                      className="border-b"
                    >
                      <td className="py-2">{item.style}</td>

                      <td className="py-2">{item.color}</td>

                      <td className="py-2">{item.size}</td>

                      <td className="py-2 text-right font-semibold text-red-600">
                        {item.qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
