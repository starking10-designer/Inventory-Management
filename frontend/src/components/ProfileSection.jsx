import { useState, useEffect } from "react";
import { User, Mail, ShieldCheck, Check, Sparkles, Image as ImageIcon, Edit3 } from "lucide-react";

export default function ProfileSection({ user, onUpdateUser, setAppIcon, setProfilePicture, profilePicture, setAppBrandName }) {
  const [displayName, setDisplayName] = useState(user?.displayName || "Admin");
  const [email, setEmail] = useState(user?.email || "admin@snfonline.com");
  const [username, setUsername] = useState(user?.username || "Admin");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
    
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [brandName, setBrandName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber || "");
  const [googleAppPassword, setGoogleAppPassword] = useState("");
  const [isAppPasswordSaved, setIsAppPasswordSaved] = useState(false);
  const [isEditingAppPassword, setIsEditingAppPassword] = useState(false);
  const [brandSuccess, setBrandSuccess] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "Admin");
      setEmail(user.email || "admin@snfonline.com");
      setUsername(user.username || "Admin");
      const storedAuth = JSON.parse(localStorage.getItem("admin_auth_data") || "{}");
      setMobileNumber(user.mobileNumber || storedAuth.mobileNumber || localStorage.getItem("brandMobile") || "");
    }
    setBrandName(localStorage.getItem("brandName") || "");
    setGstNumber(localStorage.getItem("gstNumber") || "");
    setAddress(localStorage.getItem("brandAddress") || "");
    
    const storedAppPass = localStorage.getItem("googleAppPassword");
    if (storedAppPass) {
      setIsAppPasswordSaved(true);
      setGoogleAppPassword(storedAppPass);
    }
  }, [user]);

  const handleImageUpload = (e, storageKey, setter) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("File size must be less than 2MB.");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Str = event.target.result;
        localStorage.setItem(storageKey, base64Str);
        if (setter) setter(base64Str);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    setProfileSuccess("");

    const storedAuth = JSON.parse(
      localStorage.getItem("admin_auth_data") || "{}"
    );

    const updatedAuth = {
      ...storedAuth,
      displayName: displayName.trim() || "Admin",
      email: email.trim() || "admin@snfonline.com",
      username: username.trim() || "Admin",
      mobileNumber: mobileNumber.trim(),
      password: storedAuth.password || "Admin@snfonline.com",
    };

    localStorage.setItem("admin_auth_data", JSON.stringify(updatedAuth));
    localStorage.setItem("brandMobile", mobileNumber.trim()); // Keep for backwards compatibility if needed
    
    if (googleAppPassword && googleAppPassword !== "****************") {
      localStorage.setItem("googleAppPassword", googleAppPassword.trim());
      setIsAppPasswordSaved(true);
      setIsEditingAppPassword(false);
    }

    const updatedSession = {
      ...user,
      displayName: updatedAuth.displayName,
      email: updatedAuth.email,
      username: updatedAuth.username,
      mobileNumber: updatedAuth.mobileNumber,
    };
    localStorage.setItem("admin_session", JSON.stringify(updatedSession));

    onUpdateUser(updatedSession);
    setProfileSuccess("Profile information updated successfully!");
    setTimeout(() => setProfileSuccess(""), 4000);
  };

  const handleUpdatePassword = (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    const storedAuth = JSON.parse(
      localStorage.getItem("admin_auth_data") || "{}"
    );
    const validCurrentPass = storedAuth.password || "Admin@snfonline.com";

    if (currentPassword !== validCurrentPass) {
      setPasswordError("Current password is incorrect.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    const updatedAuth = {
      ...storedAuth,
      password: newPassword,
      username: storedAuth.username || "Admin",
      displayName: storedAuth.displayName || "Admin",
      email: storedAuth.email || "admin@snfonline.com",
    };

    localStorage.setItem("admin_auth_data", JSON.stringify(updatedAuth));

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess("Admin password updated successfully! Please use this password on your next login.");
    setTimeout(() => {
      setPasswordSuccess("");
      setIsPasswordModalOpen(false);
    }, 2000);
  };

  const handleUpdateBrand = (e) => {
    e.preventDefault();
    localStorage.setItem("brandName", brandName);
    localStorage.setItem("gstNumber", gstNumber);
    localStorage.setItem("brandAddress", address);
    if (setAppBrandName) setAppBrandName(brandName);
    setBrandSuccess("Brand details updated successfully!");
    setTimeout(() => setBrandSuccess(""), 4000);
  };

  return (
    <div className="w-full flex flex-col gap-6 relative">
      {/* Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Update Password</h3>
              <p className="text-sm text-slate-500">Enter your current and new password below.</p>
            </div>
            
            <div className="p-6 space-y-4">
              {passwordError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-800">
                  ⚠️ {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800">
                  ✓ {passwordSuccess}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Current Password</label>
                <input
                  type={showCurrentPass ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">New Password</label>
                <input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Confirm Password</label>
                <input
                  type={showNewPass ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setPasswordError("");
                  setPasswordSuccess("");
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdatePassword}
                className="px-4 py-2 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="shrink-0 relative overflow-hidden rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        <div className="absolute top-0 right-0 p-32 bg-gradient-to-br from-blue-50 to-emerald-50 rounded-full blur-3xl opacity-50 -z-10 -mr-16 -mt-16 pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-center gap-6 z-10 relative">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#0F2137] to-[#1E3A66] text-white shadow-lg border-4 border-white overflow-hidden">
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <User size={32} className="opacity-90" />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 border-2 border-white p-1.5 shadow-sm">
              <Check size={12} className="text-white" />
            </div>
          </div>
          
          <div className="text-center md:text-left flex-1">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-1">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                {user?.displayName || "Admin"}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 w-fit mx-auto md:mx-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Active Session
              </span>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              {user?.email || "admin@snfonline.com"} <span className="mx-2 text-slate-300">•</span> System Administrator
            </p>
          </div>
        </div>
      </div>

      {/* Combined Settings Card */}
      <div className="rounded-[2rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          
          {/* Left Column: Profile */}
          <div className="border-r border-slate-100 flex flex-col">
            
            {/* Profile Info Section */}
            <div className="p-8 md:p-10 bg-slate-50/30">
              <div className="flex items-center gap-3 mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Profile Information</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Manage your public details and contact info</p>
                </div>
              </div>

              {profileSuccess && (
                <div className="mb-6 rounded-xl bg-emerald-50/80 border border-emerald-200 p-3.5 text-xs font-bold text-emerald-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2">
                  <div className="h-6 w-6 rounded-full bg-emerald-200/50 flex items-center justify-center shrink-0">
                    <Check size={14} className="text-emerald-700" />
                  </div>
                  {profileSuccess}
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-5">
                {/* Profile Picture Upload */}
                <div className="flex items-start gap-5">
                  <div className="relative group shrink-0">
                    <div className="h-20 w-20 overflow-hidden rounded-[1rem] border-2 border-slate-200 bg-slate-50 flex items-center justify-center shadow-sm">
                      {profilePicture ? (
                        <img src={profilePicture} alt="Profile Preview" className="h-full w-full object-cover" />
                      ) : (
                        <User size={32} className="text-slate-300" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 flex-1 pt-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Profile Picture</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, "profilePicture", setProfilePicture)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 px-4 text-xs font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400 font-medium">Max size: 2MB. Recommended: Square image.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Display Name</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#0F2137] transition-colors">
                        <User size={16} />
                      </div>
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Username</label>
                    <div className="relative group">
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Email Address</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#0F2137] transition-colors">
                        <Mail size={16} />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Mobile Number</label>
                    <input
                      type="text"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm"
                    />
                  </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Google App Password
                      <div className="relative group cursor-help text-slate-400 hover:text-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-10 font-normal normal-case tracking-normal">
                          <p className="font-bold mb-1 text-white">How to generate:</p>
                          <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                            <li>Go to your Google Account &gt; Security.</li>
                            <li>Enable 2-Step Verification.</li>
                            <li>Search for 'App Passwords'.</li>
                            <li>Create one for 'Mail' and paste the 16-character code here.</li>
                          </ol>
                        </div>
                      </div>
                    </label>
                    <div className="flex gap-2 relative">
                      <input
                        type={isAppPasswordSaved && !isEditingAppPassword ? "password" : "text"}
                        value={isAppPasswordSaved && !isEditingAppPassword ? "****************" : googleAppPassword}
                        onChange={(e) => setGoogleAppPassword(e.target.value)}
                        readOnly={isAppPasswordSaved && !isEditingAppPassword}
                        placeholder={isAppPasswordSaved && !isEditingAppPassword ? "" : "Paste 16-char app password here..."}
                        className={`w-full rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-semibold focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm ${isAppPasswordSaved && !isEditingAppPassword ? "text-slate-400 bg-slate-50 cursor-not-allowed" : "text-slate-900 bg-white"}`}
                      />
                      {isAppPasswordSaved && !isEditingAppPassword && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingAppPassword(true);
                            setGoogleAppPassword("");
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#0F2137] bg-transparent hover:bg-slate-200 rounded-lg transition-colors"
                          title="Update App Password"
                        >
                          <Edit3 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all hover:bg-slate-800 hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.3)] active:scale-[0.98]"
                  >
                    Save Profile Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Brand Details */}
          <div className="p-8 md:p-10 bg-slate-50/10">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Brand Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">Manage your brand identity and business information</p>
              </div>
            </div>

            {brandSuccess && (
              <div className="mb-6 rounded-xl bg-emerald-50/80 border border-emerald-200 p-3.5 text-xs font-bold text-emerald-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2">
                <div className="h-6 w-6 rounded-full bg-emerald-200/50 flex items-center justify-center shrink-0">
                  <Check size={14} className="text-emerald-700" />
                </div>
                {brandSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateBrand} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">App Icon</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <ImageIcon size={16} />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "appIcon", setAppIcon)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400 font-medium">Max size: 2MB. Used for browser tab favicon.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Brand Name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">GST Number</label>
                  <input
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-semibold text-slate-900 focus:border-[#0F2137]/30 focus:outline-none focus:ring-4 focus:ring-[#0F2137]/5 transition-all shadow-sm resize-none"
                ></textarea>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all hover:bg-slate-800 hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.3)] active:scale-[0.98]"
                >
                  Save Brand Details
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
