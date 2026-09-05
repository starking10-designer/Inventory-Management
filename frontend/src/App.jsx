import { useState, useEffect } from "react";
import { Link,  } from "react-router-dom";
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
  Home,
  FileText,
  Layers,
  Calendar,
  Share2,
  ThumbsUp,
  Star,
  User,
  Menu,
  X,
  LogOut,
  Save,
  } from "lucide-react";
import { API_BASE } from "./api.js";
import SalesSection from "./components/SalesSection.jsx";
import WarehouseSection from "./components/WarehouseSection.jsx";
import DailyReportSection from "./components/DailyReportSection.jsx";
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
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100"
        aria-label="Show saved options"
      >
        ▼
      </button>
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-[70] mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-200/80 bg-white/95 p-1 text-sm shadow-xl backdrop-blur-xl">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-[#0F2137] transition"
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
  const [brandName, setBrandName] = useState(localStorage.getItem("brandName") || "I&D");
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
    if (appIcon) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = appIcon;
    }
  }, [appIcon]);

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
      if (["dashboard", "daily-report", "label-cropper", "inventory", "warehouse", "profile"].includes(hash)) {
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

  const croppedPdfFilename = (file) => {
    const originalName = file?.name || "labels.pdf";
    const nameWithoutExtension = originalName.replace(/\.pdf$/i, "");
    return `${nameWithoutExtension} - cropped.pdf`;
  };

  const meeshoSortedPdfFilename = (files) => {
    const fileList = Array.isArray(files) ? files : [];
    const names = fileList.map((file) => (file?.name || "meesho-labels.pdf").replace(/\.pdf$/i, ""));
    let baseName = names.join(" + ") || "meesho-labels";
    if (baseName.length > 140 && names.length > 1) {
      baseName = `${names[0]} + ${names.length - 1} more`;
    }
    return `${baseName} sorted.pdf`;
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

    downloadBlob(response.data, croppedPdfFilename(file));
  };

  const generateSingleFlipkartCropperPdf = async (file, manualZones = null) => {
    const formData = new FormData();
    formData.append("flipkart_file", file, file.name);

    if (manualZones) {
      formData.append("flipkart_manual_zones", JSON.stringify(manualZones));
    }

    const response = await axios.post(`${API_BASE}/label-cropper`, formData, {
      responseType: "blob",
    });

    downloadBlob(response.data, croppedPdfFilename(file));
  };

  const ajioCroppedPdfFilename = (files) => {
    const fileList = Array.isArray(files) ? files : [];
    const names = fileList.map((file) => (file?.name || "ajio-labels.pdf").replace(/\.pdf$/i, ""));
    let baseName = names.join(" + ") || "ajio-labels";
    if (baseName.length > 140 && names.length > 1) {
      baseName = `${names[0]} + ${names.length - 1} more`;
    }
    return `${baseName} - cropped.pdf`;
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

    downloadBlob(response.data, ajioCroppedPdfFilename(labelFiles));
  };

  const generateMeeshoSortedPdf = async (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("meesho_files", file, file.name);
    });

    const response = await axios.post(`${API_BASE}/label-cropper`, formData, {
      responseType: "blob",
    });

    downloadBlob(response.data, meeshoSortedPdfFilename(files));
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

  const generateFinalReport = async () => {
    const files = marketplaceFiles();
    if (!hasMarketplaceFiles(files)) {
      alert("Upload at least one marketplace order file.");
      return;
    }

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
      const response = await axios.post(
        `${API_BASE}/export-final-report`,
        formData,
        { responseType: "blob" },
      );
      downloadReportBlob(response.data);
      await clearPendingMarketplaceFiles();
      await clearConfirmationMarketplaceFiles();
      clearMarketplaceFileState();
      loadSalesSummary();
    } catch (error) {
      console.error(error);
      if (await handleUnknownSkuError(error, "download")) {
        return;
      }
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadStockAlerts();
    loadSalesSummary();
    loadDashboardStats();
  }, []);

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
      accent: "text-[#0F2137] bg-[#0F2137]/10 border-[#0F2137]/20",
      badge: "Returns Active",
    },
    {
      to: "/stock-inventory",
      title: "Stock Inventory",
      description: "Plain pieces stock and master totals.",
      icon: Package,
      accent: "text-[#1E3A66] bg-[#1E3A66]/10 border-[#1E3A66]/20",
      badge: "Stock Master",
    },
    {
      to: "/sticker-inventory",
      title: "Sticker Inventory",
      description: "DTF sticker stock details and sizes.",
      icon: Tag,
      accent: "text-blue-700 bg-blue-500/10 border-blue-200/80",
      badge: "DTF Stickers",
    },
    {
      to: "/packing-inventory",
      title: "Packing Inventory",
      description: "Labels, covers, boards, and materials.",
      icon: Layers,
      accent: "text-slate-700 bg-slate-500/10 border-slate-200/80",
      badge: "Packaging",
    },
    {
      to: "/low-stock",
      title: "Low Stock",
      description: "Pieces and stickers that need attention.",
      icon: AlertTriangle,
      accent: "text-rose-700 bg-rose-500/10 border-rose-200/80",
      badge: `${alerts.count} Alerts`,
    },
    {
      to: "/sku-master",
      title: "SKU Master",
      description: "Marketplace style and SKU cross-reference database.",
      icon: Tag,
      accent: "text-[#0F2137] bg-[#0F2137]/10 border-[#0F2137]/20",
      badge: activeSkuMaster ? "Active Master" : "Database",
    },
  ];

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "daily-report", label: "Daily Report", icon: FileText },
    { id: "label-cropper", label: "Label Cropper", icon: Scissors },
    { id: "inventory", label: "Inventory", icon: Package },
    { id: "warehouse", label: "Warehouse", icon: Warehouse },
    { id: "profile", label: "Profile", icon: User },
  ];

  const getSectionTitle = () => {
    switch (activeTab) {
      case "dashboard":
        return "Dashboard Overview";
      case "daily-report":
        return "Daily Report & Marketplace Files";
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-bold">Checking system status...</p>
        </div>
      </div>
    );
  }

  if (isRegistered === false) {
    return <RegisterPage onRegisterSuccess={(sessionUser) => {
      setIsRegistered(true);
      if (sessionUser) setUser(sessionUser);
    }} />;
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen flex text-slate-800 antialiased selection:bg-slate-200 selection:text-slate-900">
      {/* 1. Static Frosted Glass Sidebar (Navy Accented Light Theme) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col glass-sidebar transition-all duration-300 lg:flex">
        {/* Profile Avatar Header with Admin Profile */}
        <div
          onClick={() => handleTabChange("profile")}
          className="flex flex-col items-center border-b border-slate-200/70 px-6 py-7 text-center bg-white/40 cursor-pointer hover:bg-white/60 transition group"
          title="Click to view Admin Profile"
        >
          <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0F2137] via-[#1E3A66] to-[#0A192F] p-1 shadow-md shadow-slate-900/15 ring-4 ring-slate-900/10 border border-white overflow-hidden">
            {profilePicture ? (
              <img src={profilePicture} alt="Profile" className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-transparent text-white font-black text-xl">
                {user?.displayName ? user.displayName.charAt(0).toUpperCase() : "A"}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-xs z-10" />
          </div>
          <h2 className="text-sm font-black tracking-wide text-slate-900 uppercase group-hover:text-[#0F2137] transition">
            {user?.displayName || "Admin"}
          </h2>
          <p className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">
            {user?.email || "admin@snfonline.com"}
          </p>
        </div>

        {/* Navigation Menu Links */}
        <nav className="flex-1 space-y-1.5 px-3.5 py-4 overflow-y-auto">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={`group flex w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? "glass-pill-active"
                    : "glass-pill-idle"
                }`}
              >
                <Icon
                  size={18}
                  className={`transition-colors ${
                    isActive ? "text-[#0F2137]" : "text-slate-400 group-hover:text-slate-700"
                  }`}
                />
                <span className="capitalize">{item.label}</span>
                {item.id === "inventory" && alerts.count > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                    {alerts.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Logout Button */}
        <div className="border-t border-slate-200/70 p-3.5 bg-white/40">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200/70 bg-rose-50/60 py-2.5 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100/80 transition shadow-xs"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-xs flex-1 glass-sidebar p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
              <span className="text-base font-bold uppercase tracking-wider text-[#0F2137]">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 space-y-2 pt-4">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      isActive ? "glass-pill-active" : "glass-pill-idle"
                    }`}
                  >
                    <Icon size={18} className={isActive ? "text-[#0F2137]" : ""} />
                    {item.label}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleLogout}
                className="w-full mt-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700"
              >
                <LogOut size={18} />
                Logout
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between glass-header px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-xl border border-slate-200/80 bg-white/70 p-2 text-slate-600 hover:bg-white lg:hidden shadow-xs"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                {getSectionTitle()}
              </h1>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                {brandName || "I&D"} E-Commerce & Inventory Central
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md">
              <Calendar size={14} className="text-[#0F2137]" />
              <span>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>

            {alerts.count > 0 && (
              <button
                type="button"
                onClick={() => setShowLowStockModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-rose-50/90 border border-rose-200/80 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-xs"
              >
                <AlertTriangle size={14} />
                <span>{alerts.count} Low Stock</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Center Views */}
        <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6">
          {/* VIEW 1: DASHBOARD (Exclusively contains the 4 KPI cards + Sales Performance) */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Top 4 KPI Metrics Row (Navy Accented Frosted Glass Cards) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Card 1: Total Order Card */}
                <div className="glass-panel rounded-3xl p-6 shadow-sm glass-card-hover flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#0F2137]/12 via-white/70 to-[#1E3A66]/6 border border-white/90">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0F2137]">
                      Total Orders
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F2137] text-white font-black text-xs shadow-sm">
                      <ListOrdered size={16} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-3xl font-black tracking-tight text-slate-900">
                      {dashboardStats.total_orders}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 font-medium">
                      Active Dispatch Performance
                    </p>
                  </div>
                </div>

                {/* Card 2: Daily Order Card */}
                <div className="glass-panel rounded-3xl p-6 shadow-sm glass-card-hover flex flex-col justify-between border border-white/90">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Daily Orders
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F2137]/10 text-[#0F2137]">
                      <Share2 size={16} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                      {dashboardStats.daily_orders}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 font-medium">
                      Orders across marketplaces
                    </p>
                  </div>
                </div>

                {/* Card 3: Total Pieces Card */}
                <div className="glass-panel rounded-3xl p-6 shadow-sm glass-card-hover flex flex-col justify-between border border-white/90">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Total Pieces
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F2137]/10 text-[#0F2137]">
                      <ThumbsUp size={16} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                      {dashboardStats.total_pieces}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 font-medium">
                      Units processed & packed
                    </p>
                  </div>
                </div>

                {/* Card 4: Stock Health Card */}
                <div className="glass-panel rounded-3xl p-6 shadow-sm glass-card-hover flex flex-col justify-between border border-white/90">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Stock Health
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0F2137]/10 text-[#0F2137]">
                      <Star size={16} className="fill-[#0F2137] text-[#0F2137]" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                      {alerts.count === 0 ? "9.8" : alerts.count}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 font-medium">
                      {alerts.count === 0 ? "Optimal inventory level" : "Items requiring restock"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sales Performance Card */}
              <div className="glass-panel rounded-3xl p-6 shadow-sm">


                <SalesSection />
              </div>
            </div>
          )}

          {/* VIEW 2: DAILY REPORT */}
          {activeTab === "daily-report" && (
            <div className="space-y-6">
              <div className="glass-panel rounded-3xl p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Marketplace Files
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Upload daily order sheets from marketplaces to produce unified dispatches and analytics.
                    </p>
                  </div>
                  <span className="rounded-xl bg-[#0F2137]/10 border border-[#0F2137]/20 px-3 py-1.5 text-xs font-bold text-[#0F2137]">
                    {uploadedMarketplaceCount}/{uploadCards.length} Uploaded
                  </span>
                </div>

                {/* Upload Cards Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {uploadCards.map((item) => (
                    <div
                      key={item.title}
                      className="group relative rounded-2xl border border-slate-200/80 bg-white/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white/95 hover:shadow-[0_12px_28px_rgba(15,33,55,0.08)] backdrop-blur-md"
                    >
                      {item.state && (
                        <button
                          type="button"
                          title={`Remove ${item.title} file`}
                          onClick={() => deleteMarketplaceFile(item)}
                          className="absolute right-3 top-3 rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 shadow-sm transition hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
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
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-xs border border-slate-200/80 transition group-hover:border-slate-300 group-hover:shadow-md p-1">
                          {item.icon ? (
                            <item.icon className="h-full w-full rounded-xl" />
                          ) : (
                            <Upload size={18} className="text-slate-600" />
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Upload daily orders
                        </p>

                        {item.state && (
                          <div className="mt-3 truncate rounded-lg border border-emerald-200 bg-emerald-50/90 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">
                            ✓ {item.state.name}
                          </div>
                        )}
                      </label>
                      {item.key === "flipkart" && (
                        <div className="mt-3 flex items-center bg-white/90 rounded-lg border border-slate-200/80 p-1.5 shadow-xs w-max relative z-10">
                          <Calendar size={14} className="text-slate-500 mr-2 ml-1" />
                          <input
                            type="date"
                            value={flipkartDispatchDate}
                            onChange={(e) => setFlipkartDispatchDate(e.target.value)}
                            className="bg-transparent text-slate-700 text-xs font-semibold outline-none cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Toolbar Actions */}
                <div className="mt-6 flex flex-wrap gap-3 items-center border-t border-slate-200/60 pt-5">
                  <button
                    type="button"
                    className="rounded-xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-60"
                    disabled={reportBusy}
                    onClick={generateFinalReport}
                  >
                    {reportBusy ? "Generating…" : "Generate Final Report"}
                  </button>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3.5 py-2 text-xs font-bold text-slate-700 cursor-pointer shadow-xs">
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

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3.5 py-2 text-xs font-bold text-slate-700 cursor-pointer shadow-xs">
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
                </div>
              </div>

              {/* Full Daily Final Order Report Explorer */}
              <DailyReportSection />
            </div>
          )}

          {/* VIEW 3: LABEL CROPPER */}
          {activeTab === "label-cropper" && (
            <div className="space-y-6">
              <div className="glass-panel rounded-3xl p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Label Cropper
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Upload marketplace shipping label PDFs to crop, sort, and format ready-to-print labels.
                    </p>
                  </div>
                  <span className="rounded-xl bg-[#0F2137]/10 border border-[#0F2137]/20 px-3 py-1.5 text-xs font-bold text-[#0F2137]">
                    {uploadedLabelCount}/5 Uploaded
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    {
                      title: "Flipkart",
                      file: cropperFlipkartFile,
                      setFile: setCropperFlipkartFile,
                      icon: FlipkartIcon,
                      description: "Upload shipping labels",
                    },
                    {
                      title: "Amazon",
                      file: cropperAmazonFile,
                      setFile: setCropperAmazonFile,
                      icon: AmazonIcon,
                      description: "Upload shipping labels",
                    },
                    {
                      title: "AJIO Labels",
                      file: cropperAjioLabelFile,
                      setFile: setCropperAjioLabelFile,
                      multiple: true,
                      icon: AjioIcon,
                      description: "Upload shipping labels",
                    },
                    {
                      title: "AJIO Invoices",
                      file: cropperAjioInvoiceFile,
                      setFile: setCropperAjioInvoiceFile,
                      multiple: true,
                      icon: AjioIcon,
                      description: "Upload customer invoices",
                    },
                    {
                      title: "Meesho",
                      file: cropperMeeshoFile,
                      setFile: setCropperMeeshoFile,
                      multiple: true,
                      icon: MeeshoIcon,
                      description: "Upload label PDFs",
                    },
                  ].map((item) => {
                    const files = item.multiple ? item.file : item.file ? [item.file] : [];
                    const hasFile = files.length > 0;

                    return (
                      <div
                        key={item.title}
                        className="group relative rounded-2xl border border-slate-200/80 bg-white/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white/95 hover:shadow-[0_12px_28px_rgba(15,33,55,0.08)] backdrop-blur-md"
                      >
                        {hasFile && (
                          <button
                            type="button"
                            title={`Remove ${item.title} label PDF`}
                            onClick={() => item.setFile(item.multiple ? [] : null)}
                            className="absolute right-3 top-3 rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 shadow-sm transition hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <label
                          className={`block ${
                            hasFile ? "cursor-default" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="file"
                            accept={item.accept || "application/pdf,.pdf"}
                            multiple={item.multiple}
                            className="hidden"
                            disabled={hasFile}
                            onChange={(e) => {
                              item.setFile(
                                item.multiple
                                  ? Array.from(e.target.files || [])
                                  : e.target.files?.[0] ?? null,
                              );
                              e.target.value = "";
                            }}
                          />
                          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-xs border border-slate-200/80 transition group-hover:border-slate-300 group-hover:shadow-md p-1">
                            {item.icon ? (
                              <item.icon className="h-full w-full rounded-xl" />
                            ) : (
                              <Scissors size={18} className="text-slate-600" />
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.description || (item.multiple ? "Upload label PDFs" : "Upload label PDF")}
                          </p>
                          {hasFile && (
                            <div className="mt-3 space-y-1.5">
                              {files.map((file) => (
                                <div
                                  key={file.name}
                                  className="truncate rounded-lg border border-emerald-200 bg-emerald-50/90 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
                                >
                                  ✓ {file.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </label>
                      </div>
                    );
                  })}
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
                    className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white shadow-xs"
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
              <div className="glass-panel rounded-3xl p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Inventory Management
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Available inventory cards with quick access and detailed page links.
                    </p>
                  </div>
                  <span className="rounded-xl bg-slate-100/90 border border-slate-200/60 px-3 py-1.5 text-xs font-bold text-slate-700">
                    {inventoryLinks.length} Inventory Hubs
                  </span>
                </div>

                {/* Inventory Cards Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inventoryLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="group relative rounded-2xl border border-slate-200/80 bg-white/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white/95 hover:shadow-[0_12px_28px_rgba(15,33,55,0.08)] flex flex-col justify-between min-h-[140px] backdrop-blur-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${item.accent} shadow-xs`}>
                            <Icon size={24} />
                          </div>
                          <span className="rounded-lg bg-white/90 border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-xs">
                            {item.badge}
                          </span>
                        </div>

                        <div className="mt-4">
                          <h3 className="text-base font-extrabold text-slate-900 group-hover:text-[#0F2137] transition">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500 font-medium">
                            {item.description}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center justify-end text-xs font-bold text-slate-600 group-hover:text-[#0F2137]">
                          Open Details
                          <ChevronRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4">
          <div className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-3xl bg-white/95 shadow-2xl border border-white/90 flex flex-col backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-5 bg-[#0F2137]/5">
              <div>
                <div className="flex items-center gap-2 text-[#0F2137] font-bold text-base">
                  <AlertTriangle size={20} />
                  Label SKU Missing
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Enter SKU and quantity for the invoice, then generate cropped labels again.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMissingLabelSkuPopup}
                disabled={missingLabelSkuSaving}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {missingLabelSkuRows.map((row, rowIndex) => (
                <div
                  key={`${row.label_number}-${row.invoice_page}`}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4"
                >
                  <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-lg bg-white px-2.5 py-1 text-slate-800 border border-slate-200/80 shadow-xs">
                      Label #{row.label_number}
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-slate-600 border border-slate-200/80 shadow-xs">
                      Invoice page {row.invoice_page}
                    </span>
                    {row.order_number && (
                      <span className="rounded-lg bg-white px-2.5 py-1 text-slate-600 border border-slate-200/80 shadow-xs">
                        Order #{row.order_number}
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200/70 bg-white/90 p-3 text-xs text-slate-700">
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
                        className="mt-1 w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-slate-800 focus:outline-none"
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
                        className="mt-1 w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-slate-800 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200/80 px-6 py-4 bg-slate-50/60">
              <button
                type="button"
                onClick={closeMissingLabelSkuPopup}
                disabled={missingLabelSkuSaving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 shadow-xs"
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

      {/* 2. Missing Flipkart Zone Modal */}
      {missingFlipkartZoneRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4">
          <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-3xl bg-white/95 shadow-2xl border border-white/90 flex flex-col backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-5 bg-[#0F2137]/5">
              <div>
                <div className="flex items-center gap-2 text-[#0F2137] font-bold text-base">
                  <AlertTriangle size={20} />
                  Flipkart Zone Missing
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Enter zone for each label page, then generate cropped labels.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMissingFlipkartZonePopup}
                disabled={missingFlipkartZoneSaving}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {missingFlipkartZoneRows.map((row, rowIndex) => (
                <div
                  key={`${row.label_number}-${row.page}`}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4"
                >
                  <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-lg bg-white px-2.5 py-1 text-slate-800 border border-slate-200/80 shadow-xs">
                      Page #{row.page}
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 text-slate-600 border border-slate-200/80 shadow-xs">
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
                      className="mt-1 w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-xs uppercase focus:ring-2 focus:ring-slate-800 focus:outline-none"
                      placeholder="e.g. B2"
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200/80 px-6 py-4 bg-slate-50/60">
              <button
                type="button"
                onClick={closeMissingFlipkartZonePopup}
                disabled={missingFlipkartZoneSaving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 shadow-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4">
          <div className="w-full max-w-[85vw] h-[80vh] max-h-[85vh] overflow-hidden rounded-[2.5rem] bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-100 flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-10 py-8 bg-white z-10">
              <div>
                <div className="flex items-center gap-3 text-slate-800 font-black text-2xl tracking-tight">
                  <AlertTriangle size={28} className="text-rose-500 drop-shadow-sm" />
                  Unknown SKU Detected
                </div>
                <p className="text-base text-slate-500 mt-2 font-medium">
                  Add the missing SKU details to master dictionary to proceed with final report generation.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUnknownSkuPopup}
                disabled={unknownSkuSaving}
                className="rounded-2xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-10 py-8 space-y-6 flex-1 bg-slate-50/50">
              {unknownSkuRows.map((row, rowIndex) => (
                <div
                  key={`${row.platform}-${row.normalized_sku}-${rowIndex}`}
                  className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="mb-8 flex flex-wrap items-center gap-4 text-sm font-semibold border-b border-slate-100 pb-5">
                    <span className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-5 py-2.5 text-blue-700 font-mono font-bold shadow-sm">
                      <Tag size={16} />
                      {row.sku}
                    </span>
                    <span className="rounded-2xl bg-slate-100 px-5 py-2.5 text-slate-500 shadow-sm">
                      Platform: <span className="text-slate-800 font-bold ml-1">{row.platform}</span>
                    </span>
                    <span className="rounded-2xl bg-slate-100 px-5 py-2.5 text-slate-500 shadow-sm">
                      Qty: <span className="text-slate-800 font-bold ml-1">{row.quantity}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-6">
                    <label className="text-sm font-bold text-slate-600">
                      SKU
                      <input
                        type="text"
                        value={row.sku}
                        readOnly
                        className="mt-2.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-400 font-mono cursor-not-allowed shadow-inner"
                      />
                    </label>
                    {Object.keys(skuMasterOptions.columns || {})
                      .filter((colName) => !['color2', 'color3', 'color4', 'color5'].includes(colName))
                      .map((colName) => (
                        <label key={colName} className="text-sm font-bold text-slate-600 capitalize">
                          {colName.replace(/_/g, ' ')}
                          <ComboTextInput
                            value={row[colName] || ""}
                            onChange={(value) =>
                              updateUnknownSkuRow(rowIndex, colName, value)
                            }
                            options={skuMasterOptions.columns[colName] || []}
                            className="mt-2.5 w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-4 pr-10 text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                          />
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-4 border-t border-slate-100 px-10 py-6 bg-white z-10">
              <button
                type="button"
                onClick={closeUnknownSkuPopup}
                disabled={unknownSkuSaving}
                className="rounded-2xl border border-slate-200 bg-white px-8 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all hover:shadow focus:ring-4 focus:ring-slate-100"
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
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4">
          <div className="w-full max-w-3xl bg-white/95 rounded-3xl shadow-2xl p-6 max-h-[80vh] flex flex-col border border-white/90 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600 font-extrabold text-lg">
                <AlertTriangle size={22} />
                <h2>Low Stock Items ({alerts.count})</h2>
              </div>
              <button
                onClick={() => setShowLowStockModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/90 text-xs font-bold uppercase text-slate-600 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Style</th>
                    <th className="py-2.5 px-3">Color</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3 text-right">Qty Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alerts.items.map((item, idx) => (
                    <tr
                      key={`${item.style}-${item.color}-${item.size}-${idx}`}
                      className="hover:bg-rose-50/40 transition"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{item.style}</td>
                      <td className="py-2.5 px-3 text-slate-600">{item.color}</td>
                      <td className="py-2.5 px-3 text-slate-600">{item.size || "Sticker"}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 tabular-nums">
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
                className="rounded-xl bg-[#0F2137] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
                onClick={() => setShowLowStockModal(false)}
              >
                Go to Low Stock Page
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
