import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Upload,
  FileSpreadsheet,
  Package,
  Truck,
  ListOrdered,
  Warehouse,
  ChevronRight,
  Printer,
  CheckCircle2,
  Trash2,
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
  loadConfirmationMarketplaceFiles,
  loadPendingMarketplaceFiles,
  saveConfirmationMarketplaceFiles,
  savePendingMarketplaceFile,
} from "./utils/pendingMarketplaceFiles.js";

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
  const [confirmationFiles, setConfirmationFiles] = useState(null);

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

  const hasPendingConfirmation = hasMarketplaceFiles(
    confirmationFiles ?? {}
  );

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
    const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
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
      const response = await axios.post(
        `${API_BASE}/export-final-report`,
        formData,
        { responseType: "blob" },
      );
      downloadReportBlob(response.data);
      await saveConfirmationMarketplaceFiles(files);
      await clearPendingMarketplaceFiles();
      setConfirmationFiles(files);
      clearMarketplaceFileState();
    } catch (error) {
      console.error(error);
      alert("Failed to generate report");
    } finally {
      setReportBusy(false);
    }
  };

  const confirmFinalReport = async () => {
    const files = hasPendingConfirmation
      ? confirmationFiles
      : marketplaceFiles();
    if (!hasMarketplaceFiles(files)) {
      alert("Upload at least one marketplace order file.");
      return;
    }

    const ok = window.confirm(
      "Confirm this report and deduct used return quantities from return inventory? This cannot be undone automatically.",
    );
    if (!ok) return;

    setReportBusy(true);
    try {
      const formData = buildMarketplaceFormData(files);
      const { data } = await axios.post(
        `${API_BASE}/confirm-final-report`,
        formData,
      );
      alert(
        `${data.message}\nDeducted: ${data.total_qty_deducted ?? 0} units across ${data.lines_updated ?? 0} line(s).`,
      );
      await clearConfirmationMarketplaceFiles();
      setConfirmationFiles(null);
    } catch (error) {
      console.error(error);
      const d = error.response?.data?.detail;
      alert(typeof d === "string" ? d : "Failed to confirm report");
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
      alert("Failed to prepare report for print");
    } finally {
      setReportBusy(false);
    }
  };

  const uploadSkuMaster = async () => {
    try {
      const formData = new FormData();
      formData.append("file", skuMasterFile);
      await axios.post(`${API_BASE}/upload-file`, formData);
      alert("SKU Master Uploaded Successfully");
      await fetchCurrentSkuMaster();
    } catch (error) {
      console.error(error.response);
      alert("Failed to upload SKU master");
      if (skuMasterFile?.name) setActiveSkuMaster(skuMasterFile.name);
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
      loadConfirmationMarketplaceFiles(),
    ])
      .then(([files, confirmFiles]) => {
        if (!active) return;

        setFlipkartFile(files.flipkart);
        setAmazonFile(files.amazon);
        setAjioFile(files.ajio);
        setMeeshoFile(files.meesho);
        setMyntraFile(files.myntra);
        setConfirmationFiles(
          hasMarketplaceFiles(confirmFiles) ? confirmFiles : null
        );
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
      formData.append("file", file);
      const { data } = await axios.post(`${API_BASE}/upload-returns`, formData);
      const n = data.updated_items ?? 0;
      alert(`${data.message ?? "Done"} (${n} SKU piece updates)`);
    } catch (err) {
      console.error(err);
      const d = err.response?.data?.detail;
      alert(
        typeof d === "string"
          ? d
          : d
            ? JSON.stringify(d)
            : "Returns upload failed",
      );
    } finally {
      setReturnsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-sky-100 text-slate-800">
      <div className="border-b border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Inventory Management
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          <div className="rounded-3xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">Platforms</p>
                <h2 className="text-3xl font-bold mt-2">5</h2>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <Package size={28} className="text-indigo-600" />
              </div>
            </div>
          </div>
          <div className="rounded-3xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">Daily Orders</p>
                <h2 className="text-3xl font-bold mt-2">Ready</h2>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Truck size={28} className="text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="rounded-3xl bg-white/55 border border-white/80 p-5 backdrop-blur-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">Report Status</p>
                <h2 className="text-3xl font-bold mt-2">Pending</h2>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-pink-100 flex items-center justify-center">
                <FileSpreadsheet size={28} className="text-pink-600" />
              </div>
            </div>
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
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
                    Daily final order details
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Full table: date, platform, style, color, size, quantities.
                  </p>
                </div>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-indigo-600 shrink-0 mt-1" size={22} />
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
                    Search return stock and edit quantities on a dedicated page.
                  </p>
                </div>
              </div>
              <ChevronRight className="text-slate-400 group-hover:text-emerald-600 shrink-0 mt-1" size={22} />
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
                  {item.state && !hasPendingConfirmation && (
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
                      item.state || hasPendingConfirmation
                        ? "cursor-default"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="file"
                      className="hidden"
                      disabled={!!item.state || hasPendingConfirmation}
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
                disabled={reportBusy || hasPendingConfirmation}
                onClick={generateFinalReport}
              >
                {reportBusy ? "Generating…" : "Generate Final Report"}
              </button>
              <button
                type="button"
                disabled={reportBusy}
                onClick={confirmFinalReport}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 transition inline-flex items-center gap-2"
              >
                <CheckCircle2 size={18} />
                {reportBusy ? "Processing…" : "Confirm Report"}
              </button>
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
    </div>
  );
}

export default App;
