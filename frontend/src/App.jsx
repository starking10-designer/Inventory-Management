import defaultAppIcon from "./assets/Inventory icon.png";
import WorkspaceTopBar from "./components/WorkspaceTopBar.jsx";
import MarketplaceUploadCard from "./components/MarketplaceUploadCard.jsx";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import "./dashboard.css";
import "./order-preview.css";
import "./manual-order.css";
import "./sales-analytics-page.css";
import WorkspaceNavigation from "./components/WorkspaceNavigation.jsx";
import axios from "axios";
import {
  Upload,
  Package,
  ListOrdered,
  Warehouse,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Tag,
  Scissors,
  Layers,
  Calendar,
  Share2,
  ThumbsUp,
  Star,
  Menu,
  X,
  LogOut,
  Save,
  History,
  Mail,
  ArrowRight,
  BarChart2,
  } from "lucide-react";
import { API_BASE } from "./api.js";
import SalesSection from "./components/SalesSection.jsx";
import WarehouseSection from "./components/WarehouseSection.jsx";
import DailyReportSection, { ReportDetailTable } from "./components/DailyReportSection.jsx";
import LoginPage from "./components/LoginPage.jsx";
import RegisterPage from "./components/RegisterPage.jsx";
import ProfileSection from "./components/ProfileSection.jsx";
import {
  FlipkartIcon,
  AmazonIcon,
  AjioIcon,
  MeeshoIcon,
  MyntraIcon,
} from "./components/MarketplaceIcons.jsx";
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

const readErrorPayload = async (error) => {
  const responseData = error.response?.data;

  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  return responseData || null;
};

const getUnknownSkuDetail = async (error) => {
  if (error.response?.status !== 409) {
    return null;
  }

  const payload = await readErrorPayload(error);
  const detail = payload?.detail;

  if (detail?.code !== "UNKNOWN_SKUS" || !Array.isArray(detail.skus)) {
    return null;
  }

  return detail;
};

const buildUnknownSkuRows = (items) =>
  items.map((item) => ({
    platform: item.platform || "",
    sku: item.sku || "",
    normalized_sku: item.normalized_sku || "",
    quantity: item.quantity || 0,
    style: "",
    size: "",
    pack_of: "",
    pieces: [],
  }));

const UNKNOWN_SKU_SIZE_OPTIONS = ["S", "M", "L", "XL", "2XL"];

function ComboTextInput({ value, onChange, options = [], className = "" }) {
  const [open, setOpen] = useState(false);
  const normalizedValue = String(value || "").toLowerCase();
  const filteredOptions = options.filter((option) =>
    String(option).toLowerCase().includes(normalizedValue),
  );

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={className}
      />
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 font-medium hover:glass"
        aria-label="Show saved options"
      >
        ▼
      </button>
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[70] mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-200 glass p-1 text-sm shadow-xl backdrop-blur-xl">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:glass hover:text-[#0F2137] transition"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  // Authentication State
  const [user, setUser] = useState(() => {
    const session = localStorage.getItem("admin_session");
    if (session) {
      try {
        return JSON.parse(session);
      } catch (e) { console.error(e);
        return null;
      }
    }
    return null;
  });

  const [appIcon, setAppIcon] = useState(localStorage.getItem("appIcon"));
  const [profilePicture, setProfilePicture] = useState(localStorage.getItem("profilePicture"));
  const [brandName, setBrandName] = useState(localStorage.getItem("brandName") || "JS inventory");
  const [isRegistered, setIsRegistered] = useState(null);

  useEffect(() => {
    // Check if the system is registered via product key
    axios.get(`${API_BASE}/api/system/status`)
      .then(res => {
        setIsRegistered(res.data.is_registered);
      })
      .catch(err => {
        console.error("Backend not reachable or status failed:", err);
        // Fallback to true if you don't want to block them when offline, or false to force registration
        // Using false as this is the new default flow
        setIsRegistered(false);
      });
  }, []);

  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.removeAttribute("type");
    link.href = appIcon || defaultAppIcon;
  }, [appIcon]);

  useEffect(() => {
    document.title = brandName.trim() || "JS inventory";
  }, [brandName]);

  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    if (["dashboard", "daily-report", "label-cropper", "inventory", "warehouse", "profile"].includes(hash)) {
      return hash;
    }
    return "dashboard";
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [flipkartFile, setFlipkartFile] = useState(null);

  const getDefaultFlipkartDate = () => {
    const now = new Date();
    let target = new Date(now);
    if (now.getHours() >= 14) {
      target.setDate(target.getDate() + 1);
    }
    if (target.getDay() === 0) {
      target.setDate(target.getDate() + 1);
    }
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const [flipkartDispatchDate, setFlipkartDispatchDate] = useState(getDefaultFlipkartDate());
  const [amazonFile, setAmazonFile] = useState(null);
  const [ajioFile, setAjioFile] = useState(null);
  const [meeshoFile, setMeeshoFile] = useState(null);
  const [myntraFile, setMyntraFile] = useState(null);
  const [skuMasterFile, setSkuMasterFile] = useState(null);
  const [activeSkuMaster, setActiveSkuMaster] = useState(null);
  const [loadingSkuMaster, setLoadingSkuMaster] = useState(true);
  const [cropperFlipkartFile, setCropperFlipkartFile] = useState(null);
  const [flipkartSortBySku, setFlipkartSortBySku] = useState(true);
  const [cropperAmazonFile, setCropperAmazonFile] = useState(null);
  const [cropperAjioLabelFile, setCropperAjioLabelFile] = useState([]);
  const [cropperAjioInvoiceFile, setCropperAjioInvoiceFile] = useState([]);
  const [cropperMeeshoFile, setCropperMeeshoFile] = useState([]);
  const [labelCropperBusy, setLabelCropperBusy] = useState(false);
  const [missingLabelSkuRows, setMissingLabelSkuRows] = useState([]);
  const [missingLabelSkuFile, setMissingLabelSkuFile] = useState(null);
  const [missingLabelSkuSaving, setMissingLabelSkuSaving] = useState(false);
  const [missingFlipkartZoneRows, setMissingFlipkartZoneRows] = useState([]);
  const [missingFlipkartZoneFile, setMissingFlipkartZoneFile] = useState(null);
  const [missingFlipkartZoneSaving, setMissingFlipkartZoneSaving] = useState(false);

  const [reportBusy, setReportBusy] = useState(false);
  const [showFinalReportDetails, setShowFinalReportDetails] = useState(false);
  const [showOrderSummary, setShowOrderSummary] = useState(true);
  
  const [previewReportData, setPreviewReportData] = useState(null);
  const [previewTab, setPreviewTab] = useState("detailed");
  const [previewReportPlatform, setPreviewReportPlatform] = useState("All");
  const [deletedRowIds, setDeletedRowIds] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [detailFilters, setDetailFilters] = useState({ platform: new Set(), sku: new Set(), search: "" });
  const [openDetailFilter, setOpenDetailFilter] = useState(null);
  const [manualOrders, setManualOrders] = useState([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showManualOrderPopup, setShowManualOrderPopup] = useState(false);
  const [manualOrderForm, setManualOrderForm] = useState({ platform: "" });
  const [unknownSkuRows, setUnknownSkuRows] = useState([]);
  const [unknownSkuRetryAction, setUnknownSkuRetryAction] = useState(null);
  const [unknownSkuSaving, setUnknownSkuSaving] = useState(false);
  const [skuMasterOptions, setSkuMasterOptions] = useState({ columns: {} });

  const [alerts, setAlerts] = useState({
    count: 0,
    items: [],
    stock_count: 0,
    sticker_count: 0,
  });
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [salesSummary, setSalesSummary] = useState({
    count: 0,
    reports: [],
  });
  const [dashboardStats, setDashboardStats] = useState({
    total_orders: 0,
    daily_orders: 0,
    total_pieces: 0,
  });

  const handleLoginSuccess = (sessionUser) => {
    setAppIcon(localStorage.getItem("appIcon") || "");
    setBrandName(localStorage.getItem("brandName") || "JS inventory");
    setProfilePicture(localStorage.getItem("profilePicture") || "");
    setUser(sessionUser);
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out of the Admin Portal?")) {
      localStorage.removeItem("admin_session");
      setUser(null);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (["dashboard", "daily-report", "daily-orders", "label-cropper", "inventory", "warehouse", "profile"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

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
      badge: "Orders CSV/Excel",
      icon: FlipkartIcon,
    },
    {
      key: "amazon",
      title: "Amazon",
      state: amazonFile,
      setState: setAmazonFile,
      badge: "Easy Ship",
      icon: AmazonIcon,
    },
    {
      key: "ajio",
      title: "Ajio",
      state: ajioFile,
      setState: setAjioFile,
      badge: "B2C Orders",
      icon: AjioIcon,
    },
    {
      key: "meesho",
      title: "Meesho",
      state: meeshoFile,
      setState: setMeeshoFile,
      badge: "Dispatches",
      icon: MeeshoIcon,
    },
    {
      key: "myntra",
      title: "Myntra",
      state: myntraFile,
      setState: setMyntraFile,
      badge: "Forward Orders",
      icon: MyntraIcon,
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

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadCropperResponse = (response) => {
    const disposition = response.headers["content-disposition"] || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainName = disposition.match(/filename="([^"]+)"/i);
    const filename = encodedName ? decodeURIComponent(encodedName[1]) : plainName?.[1];
    if (!filename) throw new Error("The label filename was not returned. Restart the backend and try again.");
    downloadBlob(response.data, filename);
  };

  const showUnknownSkuPopup = async (detail, retryAction) => {
    const cols = await fetchSkuMasterOptions();
    setUnknownSkuRows(detail.skus.map((item) => {
      const row = {
        platform: item.platform || "Common",
        sku: item.sku || "",
        normalized_sku: item.normalized_sku || "",
        quantity: item.quantity || 0
      };
      if (cols) {
        Object.keys(cols).forEach(colName => {
            row[colName] = "";
        });
      }
      return row;
    }));
    setUnknownSkuRetryAction(retryAction);
  };

  const fetchSkuMasterOptions = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/sku-master/options`);
      const cols = data.columns || {};
      setSkuMasterOptions({ columns: cols });
      return cols;
    } catch (error) {
      console.error("Failed to load SKU master options", error);
      return {};
    }
  };

  const handleUnknownSkuError = async (error, retryAction) => {
    const detail = await getUnknownSkuDetail(error);
    if (!detail) return false;
    showUnknownSkuPopup(detail, retryAction);
    return true;
  };

  const updateUnknownSkuRow = (rowIndex, field, value) => {
    setUnknownSkuRows((rows) =>
      rows.map((row, index) =>
        index === rowIndex ? { ...row, [field]: value } : row,
      ),
    );
  };

  const updateUnknownSkuPiece = (rowIndex, pieceIndex, field, value) => {
    setUnknownSkuRows((rows) =>
      rows.map((row, index) => {
        if (index !== rowIndex) return row;
        return {
          ...row,
          pieces: row.pieces.map((piece, piecePosition) =>
            piecePosition === pieceIndex ? { ...piece, [field]: value } : piece,
          ),
        };
      }),
    );
  };

  const closeUnknownSkuPopup = () => {
    setUnknownSkuRows([]);
    setUnknownSkuRetryAction(null);
  };

  const saveUnknownSkus = async () => {
    setUnknownSkuSaving(true);
    try {
      const payload = unknownSkuRows.map((row) => {
        const item = { ...row };
        delete item.quantity;
        delete item.normalized_sku;
        return item;
      });

      await axios.post(`${API_BASE}/sku-master/manual`, payload);
      await fetchCurrentSkuMaster();

      const retryAction = unknownSkuRetryAction;
      closeUnknownSkuPopup();

      if (retryAction === "print") {
        await printFinalReportOnly();
      } else {
        await generateFinalReport();
      }
    } catch (error) {
      console.error(error);
      alert(await getUploadErrorMessage(error, "Failed to save SKU details"));
    } finally {
      setUnknownSkuSaving(false);
    }
  };

  const generateSingleAmazonCropperPdf = async (file, manualEntries = null) => {
    const formData = new FormData();
    formData.append("amazon_file", file, file.name);

    if (manualEntries) {
      formData.append("amazon_manual_entries", JSON.stringify(manualEntries));
    }

    const response = await axios.post(`${API_BASE}/label-cropper`, formData, {
      responseType: "blob",
    });

    downloadCropperResponse(response);
  };

  const generateSingleFlipkartCropperPdf = async (file, manualZones = null) => {
    const formData = new FormData();
    formData.append("flipkart_file", file, file.name);
    formData.append("flipkart_sort_by_sku", String(flipkartSortBySku));

    if (manualZones) {
      formData.append("flipkart_manual_zones", JSON.stringify(manualZones));
    }

    const response = await axios.post(`${API_BASE}/label-cropper`, formData, {
      responseType: "blob",
    });

    downloadCropperResponse(response);
  };

  const generateAjioCropperPdf = async (labelFiles, invoiceFiles) => {
    const formData = new FormData();
    labelFiles.forEach((file) => {
      formData.append("ajio_label_files", file, file.name);
    });
    invoiceFiles.forEach((file) => {
      formData.append("ajio_invoice_files", file, file.name);
    });

    const response = await axios.post(`${API_BASE}/label-cropper`, formData, {
      responseType: "blob",
    });

    downloadCropperResponse(response);
  };

  const generateMeeshoSortedPdf = async (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("meesho_files", file, file.name);
    });

    const response = await axios.post(`${API_BASE}/label-cropper`, formData, {
      responseType: "blob",
    });

    downloadCropperResponse(response);
  };

  const getMissingLabelSkuDetail = async (error) => {
    if (error.response?.status !== 409) return null;
    const payload = await readErrorPayload(error);
    const detail = payload?.detail;
    if (detail?.code !== "LABEL_SKUS_MISSING" || !Array.isArray(detail.items)) return null;
    return detail;
  };

  const getMissingFlipkartZoneDetail = async (error) => {
    if (error.response?.status !== 409) return null;
    const payload = await readErrorPayload(error);
    const detail = payload?.detail;
    if (detail?.code !== "FLIPKART_ZONES_MISSING" || !Array.isArray(detail.items)) return null;
    return detail;
  };

  const openMissingLabelSkuPopup = (detail, file) => {
    setMissingLabelSkuRows(
      detail.items.map((item) => ({
        ...item,
        sku: "",
        qty: String(item.qty || "1"),
      })),
    );
    setMissingLabelSkuFile(file);
  };

  const closeMissingLabelSkuPopup = () => {
    setMissingLabelSkuRows([]);
    setMissingLabelSkuFile(null);
  };

  const openMissingFlipkartZonePopup = (detail, file) => {
    setMissingFlipkartZoneRows(
      detail.items.map((item) => ({
        ...item,
        zone: "",
      })),
    );
    setMissingFlipkartZoneFile(file);
  };

  const closeMissingFlipkartZonePopup = () => {
    setMissingFlipkartZoneRows([]);
    setMissingFlipkartZoneFile(null);
  };

  const updateMissingFlipkartZoneRow = (rowIndex, value) => {
    setMissingFlipkartZoneRows((rows) =>
      rows.map((row, index) =>
        index === rowIndex ? { ...row, zone: value } : row,
      ),
    );
  };

  const updateMissingLabelSkuRow = (rowIndex, field, value) => {
    setMissingLabelSkuRows((rows) =>
      rows.map((row, index) =>
        index === rowIndex ? { ...row, [field]: value } : row,
      ),
    );
  };

  const saveMissingLabelSkus = async () => {
    const incompleteRow = missingLabelSkuRows.find(
      (row) => !String(row.sku || "").trim() || !String(row.qty || "").trim(),
    );

    if (incompleteRow) {
      alert("Enter SKU and quantity for every missing label.");
      return;
    }

    if (!missingLabelSkuFile) {
      alert("Amazon PDF is no longer available. Upload it again.");
      return;
    }

    const manualEntries = Object.fromEntries(
      missingLabelSkuRows.map((row) => [
        String(row.label_number),
        {
          sku: String(row.sku || "").trim(),
          qty: String(row.qty || "1").trim(),
        },
      ]),
    );

    setMissingLabelSkuSaving(true);
    try {
      await generateSingleAmazonCropperPdf(missingLabelSkuFile, manualEntries);
      closeMissingLabelSkuPopup();
      setCropperAmazonFile(null);
    } catch (error) {
      console.error(error);
      alert(await getUploadErrorMessage(error, "Failed to generate label PDF"));
    } finally {
      setMissingLabelSkuSaving(false);
    }
  };

  const saveMissingFlipkartZones = async () => {
    const incompleteRow = missingFlipkartZoneRows.find(
      (row) => !String(row.zone || "").trim(),
    );

    if (incompleteRow) {
      alert("Enter zone for every missing Flipkart label.");
      return;
    }

    if (!missingFlipkartZoneFile) {
      alert("Flipkart PDF is no longer available. Upload it again.");
      return;
    }

    const manualZones = Object.fromEntries(
      missingFlipkartZoneRows.map((row) => [
        String(row.label_number),
        String(row.zone || "").trim(),
      ]),
    );

    setMissingFlipkartZoneSaving(true);
    try {
      await generateSingleFlipkartCropperPdf(
        missingFlipkartZoneFile,
        manualZones,
      );
      closeMissingFlipkartZonePopup();
      setCropperFlipkartFile(null);
    } catch (error) {
      console.error(error);
      const missingZoneDetail = await getMissingFlipkartZoneDetail(error);

      if (missingZoneDetail && missingFlipkartZoneFile) {
        openMissingFlipkartZonePopup(
          missingZoneDetail,
          missingFlipkartZoneFile,
        );
        alert("Some zones still need a valid entry.");
        return;
      }

      alert(await getUploadErrorMessage(error, "Failed to generate label PDF"));
    } finally {
      setMissingFlipkartZoneSaving(false);
    }
  };

  const generateLabelCropperPdf = async () => {
    const hasAjioFile = cropperAjioLabelFile.length || cropperAjioInvoiceFile.length;

    if (
      !cropperAmazonFile &&
      !cropperFlipkartFile &&
      !hasAjioFile &&
      !cropperMeeshoFile.length
    ) {
      alert("Upload a Flipkart, Amazon, AJIO, or Meesho label PDF.");
      return;
    }

    if (
      (cropperAjioLabelFile.length && !cropperAjioInvoiceFile.length) ||
      (cropperAjioInvoiceFile.length && !cropperAjioLabelFile.length)
    ) {
      alert("Upload AJIO shipping labels and customer invoices together.");
      return;
    }

    setLabelCropperBusy(true);
    try {
      if (cropperFlipkartFile) {
        await generateSingleFlipkartCropperPdf(cropperFlipkartFile);
      }

      if (cropperAmazonFile) {
        await generateSingleAmazonCropperPdf(cropperAmazonFile);
      }

      if (cropperAjioLabelFile.length) {
        await generateAjioCropperPdf(
          cropperAjioLabelFile,
          cropperAjioInvoiceFile,
        );
      }

      if (cropperMeeshoFile.length) {
        await generateMeeshoSortedPdf(cropperMeeshoFile);
      }

      setCropperFlipkartFile(null);
      setCropperAmazonFile(null);
      setCropperAjioLabelFile([]);
      setCropperAjioInvoiceFile([]);
      setCropperMeeshoFile([]);
    } catch (error) {
      console.error(error);
      const missingDetail = await getMissingLabelSkuDetail(error);
      const missingZoneDetail = await getMissingFlipkartZoneDetail(error);

      if (missingZoneDetail && cropperFlipkartFile) {
        openMissingFlipkartZonePopup(missingZoneDetail, cropperFlipkartFile);
        return;
      }

      if (missingDetail && cropperAmazonFile) {
        openMissingLabelSkuPopup(missingDetail, cropperAmazonFile);
        return;
      }

      alert(await getUploadErrorMessage(error, "Failed to generate label PDF"));
    } finally {
      setLabelCropperBusy(false);
    }
  };

  const generateFinalReport = async (overrideManuals = null, overrideDeleted = null) => {
    const files = marketplaceFiles();
    const currentManuals = overrideManuals !== null ? overrideManuals : manualOrders;
    
    if (!hasMarketplaceFiles(files) && currentManuals.length === 0) {
      alert("Upload at least one marketplace order file or add a manual order.");
      return;
    }

    setReportBusy(true);
    try {
      const formData = buildMarketplaceFormData(files, {
        flipkartDispatchDate,
      });
      if (currentManuals.length > 0) {
        formData.append("manual_orders", JSON.stringify(currentManuals));
      }
      
      const currentDeleted = overrideDeleted !== null ? overrideDeleted : deletedRowIds;
      if (currentDeleted.length > 0) {
        formData.append("deleted_row_ids", JSON.stringify(currentDeleted));
      }
      
      const response = await axios.post(
        `${API_BASE}/preview-final-report`,
        formData
      );
      setPreviewReportData(response.data);
      setPreviewReportPlatform("All");
      setShowPreviewModal(true);
      
     
    } catch (error) {
      console.error(error);
      if (await handleUnknownSkuError(error, "preview")) {
        return;
      }
      alert(await getUploadErrorMessage(error, "Failed to generate preview"));
    } finally {
      setReportBusy(false);
    }
  };

  const finalizeReport = async () => {
    const files = marketplaceFiles();
    setReportBusy(true);
    try {
      const formData = buildMarketplaceFormData(files, {
        flipkartDispatchDate,
      });
      formData.append(
        "include_detail_columns",
        showFinalReportDetails ? "true" : "false",
      );
      formData.append(
        "include_order_summary",
        showOrderSummary ? "true" : "false",
      );
      if (manualOrders.length > 0) {
        formData.append("manual_orders", JSON.stringify(manualOrders));
      }
      if (deletedRowIds.length > 0) {
        formData.append("deleted_row_ids", JSON.stringify(deletedRowIds));
      }
      const response = await axios.post(
        `${API_BASE}/export-final-report`,
        formData,
        { responseType: "blob" },
      );
      downloadReportBlob(response.data);
      
      // Clear state
      setShowPreviewModal(false);
      setPreviewReportData(null);
      setManualOrders([]);
      await clearPendingMarketplaceFiles();
      await clearConfirmationMarketplaceFiles();
      clearMarketplaceFileState();
      loadSalesSummary();
    } catch (error) {
      console.error(error);
      alert(await getUploadErrorMessage(error, "Failed to export report"));
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
      const formData = buildMarketplaceFormData(files, {
        flipkartDispatchDate,
      });
      const { data } = await axios.post(
        `${API_BASE}/generate-final-report`,
        formData,
      );
      printFinalReport(data.report, {
        generatedAt: new Date().toLocaleString("en-IN", { hour12: true }),
      });
      loadSalesSummary();
    } catch (error) {
      console.error(error);
      if (await handleUnknownSkuError(error, "print")) {
        return;
      }
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
    if (user) {
      fetchCurrentSkuMaster();
    }
  }, [user]);

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

  const loadSalesSummary = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/sales-reports`);
      setSalesSummary({
        count: data.count || 0,
        reports: data.reports || [],
      });
    } catch (error) {
      console.error("Failed to load sales summary", error);
    }
  };

  const loadDashboardStats = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/dashboard-stats`);
      setDashboardStats({
        total_orders: data.total_orders || 0,
        daily_orders: data.daily_orders || 0,
        total_pieces: data.total_pieces || 0,
      });
    } catch (error) {
      console.error("Failed to load dashboard stats", error);
    }
  };

  useEffect(() => {
    if (user) {
      loadStockAlerts();
      loadSalesSummary();
      loadDashboardStats();
    }
  }, [user]);

  const uploadedMarketplaceCount = uploadCards.filter((item) => item.state).length;
  const uploadedLabelCount = [
    cropperFlipkartFile,
    cropperAmazonFile,
    cropperAjioLabelFile.length,
    cropperAjioInvoiceFile.length,
    cropperMeeshoFile.length,
  ].filter(Boolean).length;

  const inventoryLinks = [
    {
      to: "/return-inventory",
      title: "Return Inventory",
      description: "Return stock by style, color, and size.",
      icon: Warehouse,
      accent: "platform-wise",
      badge: "Returns Active",
    },
    {
      to: "/stock-inventory",
      title: "Stock Inventory",
      description: "Plain pieces stock and master totals.",
      icon: Package,
      accent: "style-wise",
      badge: "Stock Master",
    },
    {
      to: "/sticker-inventory",
      title: "Sticker Inventory",
      description: "DTF sticker stock details and sizes.",
      icon: Tag,
      accent: "sales-wise",
      badge: "DTF Stickers",
    },
    {
      to: "/packing-inventory",
      title: "Packing Inventory",
      description: "Labels, covers, boards, and materials.",
      icon: Layers,
      accent: "combo-pack-wise",
      badge: "Packaging",
    },
    {
      to: "/low-stock",
      title: "Low Stock",
      description: "Pieces and stickers that need attention.",
      icon: AlertTriangle,
      accent: "color-wise",
      badge: `${alerts.count} Alerts`,
    },
    {
      to: "/sku-master",
      title: "SKU Master",
      description: "Marketplace style and SKU cross-reference database.",
      icon: Tag,
      accent: "style-color-wise",
      badge: activeSkuMaster ? "Active Master" : "Database",
    },
  ];

  const getSectionTitle = () => {
    switch (activeTab) {
      case "dashboard":
        return "Dashboard Overview";
      case "daily-report":
        return "Daily Report & Marketplace Files";
      case "daily-orders":
        return "Daily Final Order Details";
      case "label-cropper":
        return "Shipping Label Cropper";
      case "inventory":
        return "Inventory Management";
      case "warehouse":
        return "Warehouse Dispatch & Analytics";
      case "profile":
        return "Profile Settings";
      default:
        return "Dashboard Overview";
    }
  };

  // If not authenticated, render Login Page
  if (isRegistered === null) {
    return (
      <div className="min-h-screen flex items-center justify-center glass">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-800 font-medium font-bold">Checking system status...</p>
        </div>
      </div>
    );
  }

  if (isRegistered === false) {
    return <RegisterPage onRegisterSuccess={(sessionUser) => {
      setIsRegistered(true);
      if (sessionUser) handleLoginSuccess(sessionUser);
    }} />;
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`min-h-screen flex text-slate-800 antialiased selection:glass selection:text-slate-900 ${activeTab === "dashboard" ? "dashboard-theme" : activeTab === "daily-orders" ? "daily-orders-theme" : ""}`}>
      <WorkspaceNavigation activeTab={activeTab} onNavigate={handleTabChange} alertCount={alerts.count} />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-28">


        {/* Top Header Bar */}
        <WorkspaceTopBar>
          <div className="flex items-center gap-4">
            <div 
              onClick={() => handleTabChange("profile")}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0F2137] to-[#1E3A66] p-0.5 shadow-md shadow-slate-900/10 border border-white/50 cursor-pointer overflow-hidden hover:scale-105 transition-transform"
              title="View Profile"
            >
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="w-full h-full object-cover rounded-[14px]" />
              ) : (
                <span className="text-white font-black text-lg">{user?.displayName ? user.displayName.charAt(0).toUpperCase() : "A"}</span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                {getSectionTitle()}
              </h1>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                {brandName.trim() || "JS inventory"}
              </p>
            </div>
          </div>

        </WorkspaceTopBar>

        {/* Dynamic Center Views */}
        <main key={activeTab} data-lenis-prevent={activeTab === "dashboard" || activeTab === "daily-orders" ? "" : undefined} className={`workspace-tab-content flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6${activeTab === "daily-orders" ? " daily-orders-content" : ["daily-report", "label-cropper"].includes(activeTab) ? " marketplace-report-content" : ""}`}>

          {/* VIEW 1: DASHBOARD (Exclusively contains the KPI cards + Sales Performance in Bento Layout) */}
          {activeTab === "dashboard" && (
            <div className="dashboard-content">
              <section className="dashboard-metrics" aria-label="Business overview">
                <article className="dashboard-stat">
                  <div className="dashboard-card-top"><span>Total orders</span><span className="dashboard-icon"><ListOrdered size={21} /></span></div>
                  <strong>{Number(dashboardStats.total_orders).toLocaleString("en-IN")}</strong>
                  <p>Orders across your marketplaces</p>
                  <div className="dashboard-card-foot"><span className="dashboard-dot" /> Dispatch overview</div>
                </article>
                <article className="dashboard-stat">
                  <div className="dashboard-card-top"><span>Total pieces</span><span className="dashboard-icon blue"><Package size={21} /></span></div>
                  <strong>{Number(dashboardStats.total_pieces).toLocaleString("en-IN")}</strong>
                  <p>Units processed &amp; packed</p>
                  <div className="dashboard-card-foot"><Layers size={14} /> Fulfilment overview</div>
                </article>
                <button type="button" onClick={() => document.getElementById("hidden-send-mail-btn")?.click()} className="dashboard-action">
                  <div className="dashboard-card-top"><span>Report sharing</span><span className="dashboard-icon violet"><Mail size={21} /></span></div>
                  <h3>Send a report</h3><p>Email sales reports &amp; updates</p>
                  <div className="dashboard-card-foot">Compose email <ArrowRight size={16} /></div>
                </button>
                <Link to="/sales-analytics-report" className="dashboard-action">
                  <div className="dashboard-card-top"><span>Sales insights</span><span className="dashboard-icon amber"><BarChart2 size={21} /></span></div>
                  <h3>Explore analytics</h3><p>A closer look at your performance</p>
                  <div className="dashboard-card-foot">View reports <ArrowRight size={16} /></div>
                </Link>
              </section>
              <section className="dashboard-sales" aria-label="Sales performance">
                <SalesSection />
              </section>
            </div>
          )}

          {/* VIEW 2: DAILY REPORT */}
          {activeTab === "daily-report" && (
            <div className="space-y-6">
              <div className="marketplace-upload-section daily-report-upload-section">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Marketplace Files
                    </h2>
                    <p className="mt-1 text-xs text-slate-800 font-medium">
                      Upload daily order sheets from marketplaces to produce unified dispatches and analytics.
                    </p>
                  </div>
                  <span className="rounded-xl bg-[#0F2137]/10 border border-[#0F2137]/20 px-3 py-1.5 text-xs font-bold text-[#0F2137]">
                    {uploadedMarketplaceCount}/{uploadCards.length} Uploaded
                  </span>
                </div>

                {/* Upload Cards Grid */}
                <div className="marketplace-upload-grid">
                  {uploadCards.map((item) => (
                    <MarketplaceUploadCard
                      key={item.key}
                      item={item}
                      onSelect={(file) => selectMarketplaceFile(item, file)}
                      onRemove={() => deleteMarketplaceFile(item)}
                      dispatchDate={flipkartDispatchDate}
                      onDispatchDateChange={setFlipkartDispatchDate}
                    />
                  ))}
                </div>

                {/* Toolbar Actions */}
                <div className="mt-6 flex flex-wrap gap-3 items-center border-t border-slate-200/60 pt-5">
                  <button
                    id="generate-final-report-btn"
                    type="button"
                    className="rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-60"
                    disabled={reportBusy}
                    onClick={() => {
                      setDeletedRowIds([]);
                      setSelectedRowIds(new Set());
                      generateFinalReport();
                    }}
                  >
                    {reportBusy ? "Generating…" : "Generate Final Report"}
                  </button>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 glass px-3.5 py-2 text-xs font-bold text-slate-700 cursor-pointer shadow-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0F2137] rounded"
                      checked={showFinalReportDetails}
                      onChange={(event) =>
                        setShowFinalReportDetails(event.target.checked)
                      }
                    />
                    Detail columns
                  </label>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 glass px-3.5 py-2 text-xs font-bold text-slate-700 cursor-pointer shadow-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0F2137] rounded"
                      checked={showOrderSummary}
                      onChange={(event) =>
                        setShowOrderSummary(event.target.checked)
                      }
                    />
                    Order summary
                  </label>
                  <button
                    type="button"
                    onClick={() => handleTabChange("daily-orders")}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 glass px-5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-xs ml-auto"
                  >
                    <ListOrdered size={16} className="text-[#0F2137]" />
                    View Daily Order Details
                    <ChevronRight size={14} className="opacity-60" />
                  </button>
                </div>
              </div>


              {/* Daily Final Order Details (Preview Card) */}
              {showPreviewModal && previewReportData && (() => {
                const rawOrders = previewReportData.raw_orders || [];
                const allRowIds = rawOrders.map(o => o.row_id);
                const allSelected = allRowIds.length > 0 && allRowIds.every(id => selectedRowIds.has(id));
                const someSelected = selectedRowIds.size > 0;

                const handleToggleAll = () => {
                  if (allSelected) {
                    setSelectedRowIds(new Set());
                  } else {
                    setSelectedRowIds(new Set(allRowIds));
                  }
                };

                const handleToggleRow = (id) => {
                  setSelectedRowIds(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  });
                };

                const handleDeleteSelected = async () => {
                  const newDeleted = [...deletedRowIds, ...selectedRowIds];
                  setDeletedRowIds(newDeleted);
                  setSelectedRowIds(new Set());
                  generateFinalReport(manualOrders, newDeleted);
                };

                return (
                  <div className="order-preview premium-card rounded-3xl shadow-sm flex flex-col border border-slate-200 glass">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <h2 className="text-slate-800 font-black text-lg tracking-tight">Daily Final Order Details</h2>
                        <span className="text-xs font-semibold text-slate-800 font-medium glass rounded-full px-2.5 py-0.5">Preview</span>
                      </div>

                      {/* Tab Toggle + Add Orders */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Delete Selected (Detailed View only) */}
                        {previewTab === "detailed" && someSelected && (
                          <button
                            onClick={handleDeleteSelected}
                            disabled={reportBusy}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
                          >
                            Delete Selected ({selectedRowIds.size})
                          </button>
                        )}

                        {/* Add Orders */}
                        <button
                          onClick={() => { setManualOrderForm({ platform: "" }); setShowManualOrderPopup(true); }}
                          className="rounded-xl border border-[#0F2137]/20 bg-[#0F2137]/5 px-4 py-2 text-xs font-bold text-[#0F2137] hover:bg-[#0F2137]/10 transition-colors"
                        >
                          + Add Orders
                        </button>

                        {/* Tab buttons */}
                        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold">
                          <button
                            onClick={() => setPreviewTab("detailed")}
                            className={`px-4 py-2 transition-colors ${previewTab === "detailed" ? "bg-[#0F2137] text-white" : "glass text-slate-800 font-medium hover:glass"}`}
                          >
                            Detailed View
                          </button>
                          <button
                            onClick={() => setPreviewTab("summary")}
                            className={`px-4 py-2 border-l border-slate-200 transition-colors ${previewTab === "summary" ? "bg-[#0F2137] text-white" : "glass text-slate-800 font-medium hover:glass"}`}
                          >
                            Final Report
                          </button>
                        </div>

                        {/* Close */}
                        <button onClick={() => { setShowPreviewModal(false); setPreviewReportData(null); setManualOrders([]); setDeletedRowIds([]); setSelectedRowIds(new Set()); }}
                          className="rounded-xl p-1.5 text-slate-800 font-medium hover:glass hover:text-slate-700 transition">
                          <X size={18} />
                        </button>
                      </div>
                    </div>

                    {/* Platform Summary Chips */}
                    {previewReportData.summary && previewReportData.summary.length > 0 && (
                      <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-slate-100 glass/60">
                        {(() => {
                          const totalOrders = previewReportData.summary.reduce(
                            (total, item) => total + Number(item.total_orders || 0),
                            0
                          );
                          const totalPieces = previewReportData.summary.reduce(
                            (total, item) => total + Number(item.piece_qty || 0),
                            0
                          );

                          return (
                            <>
                              {/* All Platforms Summary */}
                              <div className="bg-[#0F2137] border border-[#0F2137] rounded-xl px-3.5 py-2 shadow-sm flex items-center gap-3">
                                <div className="text-xs font-bold text-white">All Platforms</div>
                                <div className="h-3.5 w-px glass" />
                                <div className="text-xs text-white/80">
                                  <span className="font-bold text-white">{totalOrders}</span> Orders
                                </div>
                                <div className="text-xs text-white/80">
                                  <span className="font-bold text-white">{totalPieces}</span> Pieces
                                </div>
                              </div>

                              {/* Individual Platform Summary */}
                              {previewReportData.summary.map(s => (
                                <div key={s.platform} className="border border-slate-200 rounded-xl px-3.5 py-2 shadow-sm flex items-center gap-3">
                                  <div className="text-xs font-bold text-slate-800 font-medium">{s.platform}</div>
                                  <div className="h-3.5 w-px glass" />
                                  <div className="text-xs text-slate-800 font-medium"><span className="font-bold text-slate-800">{s.total_orders}</span> Orders</div>
                                  <div className="text-xs text-slate-800 font-medium"><span className="font-bold text-slate-800">{s.piece_qty}</span> Pieces</div>
                                </div>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Tab Content */}
                    <div className="flex-1">
                      {/* DETAILED VIEW */}
                      {previewTab === "detailed" && (() => {
                        const searchQ = (detailFilters.search || "").toLowerCase();
                        const filteredOrders = rawOrders.filter(o => {
                          const matchPlatform = detailFilters.platform.size === 0 || detailFilters.platform.has(o.platform || "");
                          const matchSku = detailFilters.sku.size === 0 || detailFilters.sku.has(o.sku || "");
                          const matchSearch = !searchQ || [
                            o.platform, o.order_id, o.sku, String(o.quantity ?? "")
                          ].some(v => (v || "").toLowerCase().includes(searchQ));
                          return matchPlatform && matchSku && matchSearch;
                        });

                        const uniqueVals = {
                          platform: [...new Set(rawOrders.map(o => o.platform || ""))].filter(Boolean).sort(),
                          sku: [...new Set(rawOrders.map(o => o.sku || ""))].filter(Boolean).sort(),
                        };

                        const toggleDetailFilter = (col, val) => {
                          setDetailFilters(prev => {
                            const next = new Set(prev[col]);
                            if (next.has(val)) next.delete(val); else next.add(val);
                            return { ...prev, [col]: next };
                          });
                        };
                        const clearDetailFilter = (col) => setDetailFilters(prev => ({ ...prev, [col]: new Set() }));

                        const renderFilterTh = (col, label) => {
                          const isActive = detailFilters[col]?.size > 0;
                          const isOpen = openDetailFilter === col;
                          return (
                            <th>
                              <div className="relative inline-flex items-center gap-1">
                                <span>{label}</span>
                                <button type="button" onClick={() => setOpenDetailFilter(isOpen ? null : col)}
                                  className={`p-0.5 rounded transition-colors ${isActive ? "text-blue-600 bg-blue-100" : "text-slate-800 font-medium hover:glass"}`}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 3 : 2}>
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                  </svg>
                                </button>
                                {isOpen && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setOpenDetailFilter(null)} />
                                    <div className="order-preview-filter absolute top-full left-0 mt-1 w-52 border border-slate-200 rounded-xl shadow-xl z-50 p-2 flex flex-col gap-0.5 font-normal normal-case tracking-normal">
                                      <div className="flex justify-between items-center px-2 py-1 mb-1 border-b border-slate-100">
                                        <span className="text-[10px] font-bold text-slate-800 font-medium uppercase tracking-wide">Filter by {label}</span>
                                        {isActive && <button onClick={() => clearDetailFilter(col)} className="text-[10px] font-bold text-rose-600 hover:underline">Clear</button>}
                                      </div>
                                      <div className="max-h-52 overflow-y-auto">
                                        {uniqueVals[col].map(val => (
                                          <label key={val} className="flex items-center gap-2 px-2 py-1.5 hover:glass rounded cursor-pointer text-xs text-slate-700">
                                            <input type="checkbox" checked={detailFilters[col]?.has(val)} onChange={() => toggleDetailFilter(col, val)} className="rounded border-slate-300 text-blue-600" />
                                            <span className="break-all">{val}</span>
                                          </label>
                                        ))}
                                        {uniqueVals[col].length === 0 && <span className="text-xs text-slate-800 font-medium px-2 py-2 block">No options</span>}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </th>
                          );
                        };

                        return (
                          <div>
                            {/* Search bar */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 glass/60">
                              <div className="relative flex-1 max-w-xs">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-800 font-medium" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                                </svg>
                                <input
                                  type="text"
                                  placeholder="Search orders…"
                                  value={detailFilters.search || ""}
                                  onChange={e => setDetailFilters(prev => ({ ...prev, search: e.target.value }))}
                                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 glass outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                                />
                              </div>
                              <span className="text-xs text-slate-800 font-medium font-medium">{filteredOrders.length} / {rawOrders.length} rows</span>
                            </div>
                            <div data-lenis-prevent className="report-table-scroll overflow-auto max-h-[460px]">
                              {rawOrders.length === 0 ? (
                                <p className="px-6 py-12 text-center text-slate-800 font-medium text-sm">No orders loaded.</p>
                              ) : (
                                <table className="glass-table order-preview-detailed">
                                  <thead className="sticky top-0 glass/95 backdrop-blur-md text-slate-700 text-xs font-bold uppercase tracking-wider z-10 border-b border-slate-200 shadow-sm">
                                    <tr>
                                      <th>
                                        <input type="checkbox" checked={allSelected} onChange={handleToggleAll} className="rounded border-slate-300 text-[#0F2137] focus:ring-0" />
                                      </th>
                                      {renderFilterTh("platform", "Platform")}
                                      <th>Order ID</th>
                                      {renderFilterTh("sku", "SKU")}
                                      <th>Qty</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {filteredOrders.length === 0 ? (
                                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-800 font-medium text-sm">No matching orders.</td></tr>
                                    ) : filteredOrders.map((order, idx) => {
                                      const isChecked = selectedRowIds.has(order.row_id);
                                      return (
                                        <tr key={order.row_id || idx} aria-selected={isChecked} className={`transition ${isChecked ? "bg-rose-50/60" : "hover:glass/80"}`}>
                                          <td>
                                            <input type="checkbox" checked={isChecked} onChange={() => handleToggleRow(order.row_id)} className="rounded border-slate-300 text-[#0F2137] focus:ring-0" />
                                          </td>
                                          <td>
                                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold glass text-slate-700">{order.platform || "—"}</span>
                                          </td>
                                          <td title={String(order.order_id || "")}>{order.order_id || "—"}</td>
                                          <td title={String(order.sku || "")}>{order.sku || "—"}</td>
                                          <td>{order.quantity ?? "—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* FINAL REPORT VIEW */}
                      {previewTab === "summary" && (
                        <div className="glass overflow-hidden">
                          <div className="flex flex-wrap gap-2 border-b border-slate-100 glass/70 px-4 py-3">
                            {["All", ...(previewReportData.summary || []).map((item) => item.platform)].map((platform) => (
                              <button
                                key={platform}
                                type="button"
                                onClick={() => setPreviewReportPlatform(platform)}
                                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                                  previewReportPlatform === platform
                                    ? "bg-[#0F2137] text-white"
                                    : "border border-slate-200 glass text-slate-800 font-medium hover:glass"
                                }`}
                              >
                                {platform}
                              </button>
                            ))}
                          </div>
                          <ReportDetailTable
                            rows={
                              previewReportPlatform === "All"
                                ? previewReportData.report
                                : previewReportData.platform_reports?.[previewReportPlatform] || []
                            }
                            hidePlatformColumn={true}
                          />
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex flex-wrap items-center justify-end gap-3 p-5 border-t border-slate-200 glass/50 rounded-b-3xl">
                      <button
                        onClick={() => { setShowPreviewModal(false); setPreviewReportData(null); setManualOrders([]); setDeletedRowIds([]); setSelectedRowIds(new Set()); }}
                        className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-800 font-medium hover:glass transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={finalizeReport}
                        disabled={reportBusy}
                        className="rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-6 py-2.5 text-sm font-bold text-white hover:from-[#1E3A66] hover:to-[#0F2137] transition-all shadow-sm disabled:opacity-50"
                      >
                        {reportBusy ? "Processing…" : "OK (Save & Download)"}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* VIEW: DAILY ORDERS */}
          {activeTab === "daily-orders" && (
            <div className="daily-orders-view">
              <DailyReportSection />
            </div>
          )}

          {/* VIEW 3: LABEL CROPPER */}
          {activeTab === "label-cropper" && (
            <div className="space-y-6">
              <div className="marketplace-upload-section label-cropper-upload-section">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Label Cropper
                    </h2>
                    <p className="mt-1 text-xs text-slate-800 font-medium">
                      Upload marketplace shipping label PDFs to crop, sort, and format ready-to-print labels.
                    </p>
                  </div>
                  <span className="rounded-xl bg-[#0F2137]/10 border border-[#0F2137]/20 px-3 py-1.5 text-xs font-bold text-[#0F2137]">
                    {uploadedLabelCount}/5 Uploaded
                  </span>
                </div>

                <div className="marketplace-upload-grid">
                  {[
                    { key: "cropper-flipkart", title: "Flipkart", state: cropperFlipkartFile, setFile: setCropperFlipkartFile, icon: FlipkartIcon, description: "Upload shipping labels" },
                    { key: "cropper-amazon", title: "Amazon", state: cropperAmazonFile, setFile: setCropperAmazonFile, icon: AmazonIcon, description: "Upload shipping labels" },
                    { key: "cropper-meesho", title: "Meesho", state: cropperMeeshoFile, setFile: setCropperMeeshoFile, icon: MeeshoIcon, multiple: true, description: "Upload label PDFs" },
                    { key: "cropper-ajio-label", title: "Ajio Label", state: cropperAjioLabelFile, setFile: setCropperAjioLabelFile, icon: AjioIcon, multiple: true, description: "Upload shipping labels" },
                    { key: "cropper-ajio-invoice", title: "Ajio Invoice", state: cropperAjioInvoiceFile, setFile: setCropperAjioInvoiceFile, icon: AjioIcon, multiple: true, description: "Upload customer invoices" },
                  ].map((item) => (
                    <MarketplaceUploadCard
                      key={item.key}
                      item={{ ...item, accept: "application/pdf,.pdf" }}
                      headerAction={item.key === "cropper-flipkart" ? (
                        <button
                          type="button"
                          role="switch"
                          aria-label="Sort Flipkart labels by SKU"
                          aria-checked={flipkartSortBySku}
                          disabled={labelCropperBusy}
                          onClick={() => setFlipkartSortBySku(value => !value)}
                          className="label-sku-sort-toggle"
                          title="Sort labels alphabetically by SKU and center each label. Turn off to use the original cropping method."
                        >
                          <span>SKU A–Z</span><span className="label-sku-sort-track" aria-hidden="true" />
                        </button>
                      ) : null}
                      onSelect={item.setFile}
                      onRemove={() => item.setFile(item.multiple ? [] : null)}
                    />
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200/60 pt-5">
                  <button
                    type="button"
                    disabled={
                      labelCropperBusy ||
                      (!cropperAmazonFile &&
                        !cropperFlipkartFile &&
                        !cropperAjioLabelFile.length &&
                        !cropperAjioInvoiceFile.length &&
                        !cropperMeeshoFile.length)
                    }
                    onClick={generateLabelCropperPdf}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50"
                  >
                    <Scissors size={18} className="text-white" />
                    {labelCropperBusy ? "Processing & Generating..." : "Generate Cropped Labels PDF"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCropperFlipkartFile(null);
                      setCropperAmazonFile(null);
                      setCropperAjioLabelFile([]);
                      setCropperAjioInvoiceFile([]);
                      setCropperMeeshoFile([]);
                    }}
                    className="rounded-xl border border-slate-200 glass px-4 py-2.5 text-xs font-bold text-slate-800 font-medium hover:glass shadow-xs"
                  >
                    Clear All Files
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: INVENTORY */}
          {activeTab === "inventory" && (
            <div className="space-y-6">
              <div className="inventory-hub-section">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Inventory Management
                    </h2>
                    <p className="mt-1 text-xs text-slate-800 font-medium">
                      Available inventory cards with quick access and detailed page links.
                    </p>
                  </div>
                  <span className="rounded-xl glass/90 border border-slate-200/60 px-3 py-1.5 text-xs font-bold text-slate-700">
                    {inventoryLinks.length} Inventory Hubs
                  </span>
                </div>

                {/* Inventory Cards Grid */}
                <div className="analytics-report-grid">
                  {inventoryLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="analytics-report-card"
                        data-accent={item.accent}
                      >
                        <div className="analytics-card-top">
                          <div className="analytics-report-icon">
                            <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                          </div>
                          <div className="analytics-card-copy">
                            <h3 className="analytics-card-title">{item.title}</h3>
                            <p className="analytics-card-description">{item.description}</p>
                          </div>
                        </div>
                        <div className="analytics-card-footer">
                          <span className="analytics-record-count">{item.badge}</span>
                          <span className="analytics-card-action">View details <ArrowRight size={16} className="analytics-card-arrow" aria-hidden="true" /></span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: WAREHOUSE */}
          {activeTab === "warehouse" && (
            <WarehouseSection />
          )}

          {/* VIEW 6: PROFILE */}
          {activeTab === "profile" && (
            <ProfileSection
              user={user}
              onUpdateUser={handleLoginSuccess}
              onLogout={handleLogout}
              setAppIcon={setAppIcon}
              setProfilePicture={setProfilePicture}
              profilePicture={profilePicture}
              setAppBrandName={setBrandName}
            />
          )}
        </main>
      </div>

      {/* MODALS (Frosted Glass Light Theme) */}
      {/* 1. Missing SKU Modal */}
      {missingLabelSkuRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass/40 backdrop-blur-md px-4">
          <div className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-3xl glass shadow-2xl border border-slate-200 flex flex-col backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 bg-[#0F2137]/5">
              <div>
                <div className="flex items-center gap-2 text-[#0F2137] font-bold text-base">
                  <AlertTriangle size={20} />
                  Label SKU Missing
                </div>
                <p className="text-xs text-slate-800 font-medium mt-1">
                  Enter SKU and quantity for the invoice, then generate cropped labels again.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMissingLabelSkuPopup}
                disabled={missingLabelSkuSaving}
                className="rounded-xl border border-slate-200 glass px-3 py-1.5 text-xs font-bold text-slate-800 font-medium hover:glass"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {missingLabelSkuRows.map((row, rowIndex) => (
                <div
                  key={`${row.label_number}-${row.invoice_page}`}
                  className="rounded-2xl border border-slate-200 glass/50 p-4"
                >
                  <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-lg glass px-2.5 py-1 text-slate-800 border border-slate-200 shadow-xs">
                      Label #{row.label_number}
                    </span>
                    <span className="rounded-lg glass px-2.5 py-1 text-slate-800 font-medium border border-slate-200 shadow-xs">
                      Invoice page {row.invoice_page}
                    </span>
                    {row.order_number && (
                      <span className="rounded-lg glass px-2.5 py-1 text-slate-800 font-medium border border-slate-200 shadow-xs">
                        Order #{row.order_number}
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 glass p-3 text-xs text-slate-700">
                    {row.description || "No description text was extracted."}
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
                    <label className="text-xs font-bold text-slate-700">
                      SKU
                      <input
                        type="text"
                        value={row.sku}
                        onChange={(event) =>
                          updateMissingLabelSkuRow(
                            rowIndex,
                            "sku",
                            event.target.value,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300/80 glass px-3 py-2 text-xs focus:ring-2 focus:ring-slate-800 focus:outline-none"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(event) =>
                          updateMissingLabelSkuRow(
                            rowIndex,
                            "qty",
                            event.target.value,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300/80 glass px-3 py-2 text-xs focus:ring-2 focus:ring-slate-800 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4 glass/60">
              <button
                type="button"
                onClick={closeMissingLabelSkuPopup}
                disabled={missingLabelSkuSaving}
                className="rounded-xl border border-slate-200 glass px-4 py-2 text-xs font-bold text-slate-800 font-medium hover:glass shadow-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveMissingLabelSkus}
                disabled={missingLabelSkuSaving}
                className="rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-5 py-2 text-xs font-bold text-white hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-60 shadow-sm"
              >
                {missingLabelSkuSaving ? "Generating..." : "Generate PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Missing Zone Modal */}
      {missingFlipkartZoneRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass/40 backdrop-blur-md px-4">
          <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-3xl glass shadow-2xl border border-slate-200 flex flex-col backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 bg-[#0F2137]/5">
              <div>
                <div className="flex items-center gap-2 text-[#0F2137] font-bold text-base">
                  <AlertTriangle size={20} />
                  Zone Missing
                </div>
                <p className="text-xs text-slate-800 font-medium mt-1">
                  Enter zone for each label page, then generate cropped labels.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMissingFlipkartZonePopup}
                disabled={missingFlipkartZoneSaving}
                className="rounded-xl border border-slate-200 glass px-3 py-1.5 text-xs font-bold text-slate-800 font-medium hover:glass"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {missingFlipkartZoneRows.map((row, rowIndex) => (
                <div
                  key={`${row.label_number}-${row.page}`}
                  className="rounded-2xl border border-slate-200 glass/50 p-4"
                >
                  <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-lg glass px-2.5 py-1 text-slate-800 border border-slate-200 shadow-xs">
                      Page #{row.page}
                    </span>
                    <span className="rounded-lg glass px-2.5 py-1 text-slate-800 font-medium border border-slate-200 shadow-xs">
                      Label #{row.label_number}
                    </span>
                  </div>

                  <label className="text-xs font-bold text-slate-700">
                    Zone
                    <input
                      type="text"
                      value={row.zone}
                      onChange={(event) =>
                        updateMissingFlipkartZoneRow(
                          rowIndex,
                          event.target.value,
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300/80 glass px-3 py-2 text-xs uppercase focus:ring-2 focus:ring-slate-800 focus:outline-none"
                      placeholder="e.g. B2"
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4 glass/60">
              <button
                type="button"
                onClick={closeMissingFlipkartZonePopup}
                disabled={missingFlipkartZoneSaving}
                className="rounded-xl border border-slate-200 glass px-4 py-2 text-xs font-bold text-slate-800 font-medium hover:glass shadow-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveMissingFlipkartZones}
                disabled={missingFlipkartZoneSaving}
                className="rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-5 py-2 text-xs font-bold text-white hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-60 shadow-sm"
              >
                {missingFlipkartZoneSaving ? "Generating..." : "Generate PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Unknown SKU Modal */}
      {unknownSkuRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass/60 backdrop-blur-md px-4">
          <div className="w-full max-w-[85vw] h-[80vh] max-h-[85vh] overflow-hidden rounded-[2.5rem] glass shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-100 flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-10 py-8 glass z-10">
              <div>
                <div className="flex items-center gap-3 text-slate-800 font-black text-2xl tracking-tight">
                  <AlertTriangle size={28} className="text-rose-500 drop-shadow-sm" />
                  Unknown SKU Detected
                </div>
                <p className="text-base text-slate-800 font-medium mt-2 font-medium">
                  Add the missing SKU details to master dictionary to proceed with final report generation.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUnknownSkuPopup}
                disabled={unknownSkuSaving}
                className="rounded-2xl glass px-6 py-3 text-sm font-bold text-slate-800 font-medium hover:glass transition-colors shadow-sm"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-10 py-8 space-y-6 flex-1 glass/50">
              {unknownSkuRows.map((row, rowIndex) => (
                <div
                  key={`${row.platform}-${row.normalized_sku}-${rowIndex}`}
                  className="rounded-3xl border border-slate-100 glass p-8 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="mb-8 flex flex-wrap items-center gap-4 text-sm font-semibold border-b border-slate-100 pb-5">
                    <span className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-5 py-2.5 text-blue-700 font-mono font-bold shadow-sm">
                      <Tag size={16} />
                      {row.sku}
                    </span>
                    <span className="rounded-2xl glass px-5 py-2.5 text-slate-800 font-medium shadow-sm">
                      Platform: <span className="text-slate-800 font-bold ml-1">{row.platform}</span>
                    </span>
                    <span className="rounded-2xl glass px-5 py-2.5 text-slate-800 font-medium shadow-sm">
                      Qty: <span className="text-slate-800 font-bold ml-1">{row.quantity}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-6">
                    <label className="text-sm font-bold text-slate-800 font-medium">
                      SKU
                      <input
                        type="text"
                        value={row.sku}
                        readOnly
                        className="mt-2.5 w-full rounded-2xl border border-slate-200 glass px-4 py-3.5 text-sm text-slate-800 font-medium font-mono cursor-not-allowed shadow-inner"
                      />
                    </label>
                    {Object.keys(skuMasterOptions.columns || {})
                      .filter((colName) => !['color2', 'color3', 'color4', 'color5'].includes(colName))
                      .map((colName) => (
                        <label key={colName} className="text-sm font-bold text-slate-800 font-medium capitalize">
                          {colName.replace(/_/g, ' ')}
                          <ComboTextInput
                            value={row[colName] || ""}
                            onChange={(value) =>
                              updateUnknownSkuRow(rowIndex, colName, value)
                            }
                            options={skuMasterOptions.columns[colName] || []}
                            className="mt-2.5 w-full rounded-2xl border border-slate-200 glass py-3.5 pl-4 pr-10 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                          />
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-4 border-t border-slate-100 px-10 py-6 glass z-10">
              <button
                type="button"
                onClick={closeUnknownSkuPopup}
                disabled={unknownSkuSaving}
                className="rounded-2xl border border-slate-200 glass px-8 py-3.5 text-sm font-bold text-slate-800 font-medium hover:glass shadow-sm transition-all hover:shadow focus:ring-4 focus:ring-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveUnknownSkus}
                disabled={unknownSkuSaving}
                className="rounded-2xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 shadow-md hover:shadow-lg transition-all flex items-center gap-2 focus:ring-4 focus:ring-blue-500/20"
              >
                {unknownSkuSaving ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save & Generate Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Low Stock Modal */}
      {showLowStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass/40 backdrop-blur-md px-4">
          <div className="w-full max-w-3xl glass rounded-3xl shadow-2xl p-6 max-h-[80vh] flex flex-col border border-slate-200 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600 font-extrabold text-lg">
                <AlertTriangle size={22} />
                <h2>Low Stock Items ({alerts.count})</h2>
              </div>
              <button
                onClick={() => setShowLowStockModal(false)}
                className="rounded-xl p-1.5 text-slate-800 font-medium hover:glass hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="glass-table">
                <thead className="glass/90 text-xs font-bold uppercase text-slate-800 font-medium sticky top-0">
                  <tr>
                    <th>Style</th>
                    <th>Color</th>
                    <th>Size</th>
                    <th>Qty Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alerts.items.map((item, idx) => (
                    <tr
                      key={`${item.style}-${item.color}-${item.size}-${idx}`}
                      className="hover:bg-rose-50/40 transition"
                    >
                      <td>{item.style}</td>
                      <td>{item.color}</td>
                      <td>{item.size || "Sticker"}</td>
                      <td>
                        {item.qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <Link
                to="/low-stock"
                className="rounded-xl bg-[#0F2137] px-4 py-2 text-xs font-bold text-white hover:glass shadow-sm"
                onClick={() => setShowLowStockModal(false)}
              >
                Go to Low Stock Page
              </Link>
            </div>
          </div>
        </div>
      )}
      {/* 6. Manual Order Popup */}
      {showManualOrderPopup && (() => {
        const PLATFORM_COLORS = {
          Flipkart: { bg: "from-blue-600 to-indigo-700", badge: "bg-blue-100 text-blue-700 border-blue-200", icon: "🛒" },
          Amazon: { bg: "from-orange-500 to-amber-600", badge: "bg-amber-100 text-amber-700 border-amber-200", icon: "📦" },
          Ajio: { bg: "from-rose-600 to-pink-700", badge: "bg-rose-100 text-rose-700 border-rose-200", icon: "👗" },
          Meesho: { bg: "from-fuchsia-600 to-purple-700", badge: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200", icon: "🏷️" },
          Myntra: { bg: "from-pink-600 to-rose-500", badge: "bg-pink-100 text-pink-700 border-pink-200", icon: "✨" },
          "Flipkart Warehouse": { bg: "from-slate-700 to-slate-900", badge: "glass text-slate-700 border-slate-200", icon: "🏭" },
        };
        const platforms = Object.keys(PLATFORM_COLORS);
        const selectedPlatform = manualOrderForm.platform;
        const inputCls = "manual-order-input";
        const renderField = (label, hint, children) => (
          <div className="manual-order-field">
            <div className="flex items-center justify-between">
              <label htmlFor={`manual-${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</label>
              {hint && <span className="text-[10px] text-slate-800 font-medium font-medium">{hint}</span>}
            </div>
            {children}
          </div>
        );

        return (
          <div className="manual-order-overlay" onKeyDown={e => { if (e.key === "Escape") setShowManualOrderPopup(false); }}>
            <div className="manual-order-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-order-title">
              {/* Manual entry header */}
              <div className="manual-order-header">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="manual-order-eyebrow">Manual Entry</p>
                    <h3 id="manual-order-title">
                      {selectedPlatform ? `Add ${selectedPlatform} Order` : "Add Manual Order"}
                    </h3>
                    {selectedPlatform && (
                      <p className="manual-order-description">Enter the order details to include it in your daily report.</p>
                    )}
                  </div>
                  <button onClick={() => setShowManualOrderPopup(false)} className="manual-order-close" aria-label="Close manual entry">
                    <X size={24} />
                  </button>
                </div>
              </div>
              <section className="manual-order-marketplaces" aria-label="Choose a marketplace">
                <div className="manual-order-platform-label">Marketplace <span>Choose your sales channel</span></div>
                <div className="manual-order-platforms" role="group" aria-label="Marketplace">
                  {platforms.map(p => {
                    const isSel = selectedPlatform === p;
                    return (
                      <button key={p} onClick={() => setManualOrderForm({ platform: p, sku: "", quantity: 1, order_id: "", price: 0 })}
                        aria-pressed={isSel} className={`manual-order-platform ${isSel ? "is-selected" : ""}`}>
                        <span className="manual-order-platform-icon" aria-hidden="true">{p === "Flipkart" ? <FlipkartIcon /> : p === "Amazon" ? <AmazonIcon /> : p === "Ajio" ? <AjioIcon /> : p === "Meesho" ? <MeeshoIcon /> : p === "Myntra" ? <MyntraIcon /> : <Warehouse size={22} />}</span><span>{p}</span>

                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Form Body */}
              <div className="manual-order-body">
                {selectedPlatform && <div className="manual-order-section-heading"><div><h4>Order details</h4><p>One order. All the essentials.</p></div><span className="manual-order-live">{selectedPlatform}</span></div>}
                {!selectedPlatform ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="text-5xl mb-4">☝️</div>
                    <p className="text-base font-semibold text-slate-800 font-medium">Select a platform above to continue</p>
                  </div>
                ) : (
                  <div className="manual-order-entry-panel">
                    {renderField("SKU", "Required",
                      <input id="manual-sku" autoFocus type="text" className={inputCls} placeholder="e.g. STYLE-COLOR-SIZE"
                        value={manualOrderForm.sku || ""}
                        onChange={e => setManualOrderForm({ ...manualOrderForm, sku: e.target.value })} />
                    )}
                    {renderField("Order ID","Required",
                      <input id="manual-order-id" type="text" className={inputCls} placeholder="Order reference number"
                        value={manualOrderForm.order_id || ""}
                        onChange={e => setManualOrderForm({ ...manualOrderForm, order_id: e.target.value })} />
                    )}
                    <div className="manual-order-numbers">
                      {renderField("Quantity", "Min 1",
                        <input id="manual-quantity" type="number" min="1" className={inputCls}
                          value={manualOrderForm.quantity || 1}
                          onChange={e => setManualOrderForm({ ...manualOrderForm, quantity: parseInt(e.target.value) || 1 })} />
                      )}
                      {renderField("Price", "Required",
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-800 font-medium text-sm font-bold">₹</span>
                          <input id="manual-price" type="number" min="0" step="0.01" className={inputCls + " pl-8"}
                            value={manualOrderForm.price || 0}
                            onChange={e => setManualOrderForm({ ...manualOrderForm, price: parseFloat(e.target.value) || 0 })} />
                        </div>
                      )}
                    </div>
                    {manualOrderForm.sku && (
                      <div className="manual-order-summary">
                        <span className="text-xs font-bold">Ready to add</span>
                        <span className="text-xs font-mono">{manualOrderForm.sku}</span>
                        <span className="ml-auto text-xs font-bold">×{manualOrderForm.quantity}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="manual-order-footer">
                <button onClick={() => setShowManualOrderPopup(false)} className="manual-order-cancel">
                  Cancel
                </button>
                <button
                  disabled={!manualOrderForm.platform || !manualOrderForm.sku}
                  onClick={() => {
                    const newOrder = { 
                      ...manualOrderForm, 
                      id: `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}` 
                    };
                    const nextManuals = [...manualOrders, newOrder];
                    setManualOrders(nextManuals);
                    setShowManualOrderPopup(false);
                    // Live refresh the preview using the fresh array, while preserving any currently deleted rows
                    generateFinalReport(nextManuals, deletedRowIds);
                  }}
                  className="manual-order-submit"
                >
                  Add Order <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

export default App;
