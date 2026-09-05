import { useState, useEffect } from "react";
import { Lock, User, Mail, Sparkles, Image as ImageIcon, KeyRound, Building2 } from "lucide-react";
import axios from "axios";
import { API_BASE } from "../api.js";

export default function RegisterPage({ onRegisterSuccess }) {
  const [step, setStep] = useState(1); // 1 = OTP, 2 = Profile, 3 = Brand

  // OTP State
  const [productKey, setProductKey] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Profile State
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");

  // Brand State
  const [brandName, setBrandName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [appIcon, setAppIcon] = useState("");

  const [registerError, setRegisterError] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleKeyChange = (e) => {
    // Remove all non-digits
    const raw = e.target.value.replace(/\D/g, "");
    
    // Add hyphens every 4 digits
    let formatted = raw;
    if (raw.length > 4 && raw.length <= 8) {
      formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    } else if (raw.length > 8) {
      formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    }
    
    setProductKey(formatted);
  };

  const requestProductKey = async () => {
    setIsOtpLoading(true);
    setOtpMessage("");
    try {
      const response = await axios.post(`${API_BASE}/api/system/request-key`, {
        display_name: displayName,
        username,
        email,
        password,
        mobile_number: mobileNumber,
        brand_name: brandName,
        gst_number: gstNumber,
        address
      });
      setOtpMessage(response.data.message);
      setCountdown(600); // 10 minutes
    } catch (err) {
      setOtpMessage("Failed to request key. Please check your backend configuration.");
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!displayName || !username || !email || !password) {
        setRegisterError("Please fill all required profile fields.");
        return;
      }
      if (!email.toLowerCase().endsWith('@gmail.com')) {
        setRegisterError("Email must end with @gmail.com");
        return;
      }
      if (mobileNumber && (mobileNumber.length !== 10 || !/^\d+$/.test(mobileNumber))) {
        setRegisterError("Mobile number must be exactly 10 digits");
        return;
      }
      if (password.length <= 5) {
        setRegisterError("Password must be more than 5 characters");
        return;
      }
      if (password !== confirmPassword) {
        setRegisterError("Passwords do not match.");
        return;
      }
      setRegisterError("");
      setStep(2);
    } else if (step === 2) {
      if (!brandName) {
        setRegisterError("Brand Name is required.");
        return;
      }
      setRegisterError("");
      setStep(3);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("File size must be less than 2MB.");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setAppIcon(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!productKey) {
      setRegisterError("Please enter the activation key.");
      return;
    }
    setRegisterError("");
    setRegisterLoading(true);
    
    const cleanKey = productKey.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleanKey.length !== 12) {
      setRegisterError("Please enter a valid 12-digit key.");
      setRegisterLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/api/system/register`, {
        product_key: cleanKey,
        display_name: displayName,
        username,
        email,
        password,
        mobile_number: mobileNumber,
        brand_name: brandName,
        gst_number: gstNumber,
        address,
        app_icon: appIcon
      });

      const data = response.data;
      
      const sessionUser = {
        username: data.user?.username,
        displayName: data.user?.displayName,
        email: data.user?.email,
        mobileNumber: data.user?.mobileNumber,
        role: "System Administrator",
        loginTime: new Date().toISOString(),
      };

      // Set the token for future API calls!
      localStorage.setItem("admin_token", data.access_token);

      // Also set the brand in localStorage so it matches Profile Section logic
      localStorage.setItem("brandName", data.brand?.brandName || "");
      localStorage.setItem("gstNumber", data.brand?.gstNumber || "");
      localStorage.setItem("brandAddress", data.brand?.brandAddress || "");
      localStorage.setItem("appIcon", data.brand?.appIcon || "");
      
      localStorage.setItem("admin_session", JSON.stringify(sessionUser));

      if (onRegisterSuccess) {
        onRegisterSuccess(sessionUser);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setRegisterError(err.response?.data?.detail || "Registration failed. Invalid key or server error.");
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans bg-slate-50">
      {/* Ambient background glow orbs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-slate-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-200/40 rounded-full blur-3xl pointer-events-none" />
      
      <div className="w-full max-w-xl relative z-10 rounded-[2.5rem] shadow-[0_8px_40px_rgb(0,0,0,0.08)] border border-white bg-white/80 backdrop-blur-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#0F2137] to-[#1E3A66] p-8 text-white text-center relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white shadow-lg border border-white/20 backdrop-blur-md">
            <Building2 size={28} />
          </div>
          <h1 className="text-3xl font-black tracking-tight relative z-10">System Setup</h1>
          <p className="text-blue-100/80 mt-1.5 text-sm font-medium relative z-10">Register your brand and activate the software</p>
        </div>

        {/* Steps */}
        <div className="flex bg-white/50 border-b border-slate-100/50 backdrop-blur-sm p-4 shrink-0">
          <div className={`flex-1 text-center text-xs uppercase tracking-wider font-bold transition-colors ${step >= 1 ? 'text-[#0F2137]' : 'text-slate-400'}`}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-1.5 ${step >= 1 ? 'bg-[#0F2137] text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
            Profile
          </div>
          <div className={`flex-1 text-center text-xs uppercase tracking-wider font-bold transition-colors ${step >= 2 ? 'text-[#0F2137]' : 'text-slate-400'}`}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-1.5 ${step >= 2 ? 'bg-[#0F2137] text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
            Brand
          </div>
          <div className={`flex-1 text-center text-xs uppercase tracking-wider font-bold transition-colors ${step >= 3 ? 'text-[#0F2137]' : 'text-slate-400'}`}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-1.5 ${step >= 3 ? 'bg-[#0F2137] text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
            Activation
          </div>
        </div>

        <div className="p-8">
          {registerError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold rounded-xl flex items-center gap-2">
              ⚠️ {registerError}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center space-y-2 mb-8">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-slate-50 text-slate-700 shadow-inner border border-slate-100 mb-2">
                  <KeyRound size={28} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Product Key Required</h2>
                <p className="text-sm text-slate-500 font-medium">Please contact the developer for the activation key. Click the button below to send your details.</p>
              </div>

              <div className="space-y-5">
                <button
                  type="button"
                  onClick={requestProductKey}
                  disabled={isOtpLoading || countdown > 0}
                  className="w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-60 shadow-sm"
                >
                  {isOtpLoading ? "Requesting..." : countdown > 0 ? `Key Sent (Expires in ${Math.floor(countdown/60)}:${(countdown%60).toString().padStart(2, '0')})` : "Request Activation Key"}
                </button>
                
                {otpMessage && <p className="text-xs text-center font-bold text-emerald-600 bg-emerald-50 py-2 rounded-xl border border-emerald-100">{otpMessage}</p>}

                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">Enter 12-Digit Product Key</label>
                  <input
                    type="text"
                    value={productKey}
                    onChange={handleKeyChange}
                    maxLength={14}
                    placeholder="XXXX-XXXX-XXXX"
                    className="w-full text-center tracking-[0.2em] text-lg font-bold p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
              </div>

              <button
                onClick={handleRegister}
                disabled={registerLoading}
                className="w-full mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] text-white font-bold hover:from-[#1E3A66] hover:to-[#0F2137] transition-all shadow-lg shadow-slate-900/20 active:scale-[0.98] disabled:opacity-60"
              >
                {registerLoading ? "Verifying..." : "Complete Setup"}
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Display Name *</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Username *</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mobile Number</label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Password *</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                
                <button onClick={handleNextStep} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] text-white font-bold hover:from-[#1E3A66] hover:to-[#0F2137] transition-all shadow-lg shadow-slate-900/20 active:scale-[0.98]">Next Step</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">GST Number</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows="2"
                  className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0F2137]/30 focus:bg-white focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-inner resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">App Icon</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50/50 focus:outline-none focus:border-[#0F2137]/30 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-[11px] file:uppercase file:font-bold file:bg-[#0F2137] file:text-white file:cursor-pointer hover:file:bg-[#1E3A66] transition-all"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setStep(1)} className="w-1/3 py-3.5 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">Back</button>
                <button type="button" onClick={handleNextStep}  className="w-2/3 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                  <Sparkles size={18} />
                  Next Step
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
