import { useState, useEffect } from "react";
import { User, Lock, Mail, ShieldCheck, KeyRound, Check, Sparkles, Eye, EyeOff, Image as ImageIcon } from "lucide-react";

export default function ProfileSection({ user, onUpdateUser, onLogout, setAppIcon, setProfilePicture, profilePicture }) {
  const [displayName, setDisplayName] = useState(user?.displayName || "Admin");
  const [email, setEmail] = useState(user?.email || "admin@snfonline.com");
  const [username, setUsername] = useState(user?.username || "Admin");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "Admin");
      setEmail(user.email || "admin@snfonline.com");
      setUsername(user.username || "Admin");
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
      password: storedAuth.password || "Admin@snfonline.com",
    };

    localStorage.setItem("admin_auth_data", JSON.stringify(updatedAuth));

    const updatedSession = {
      ...user,
      displayName: updatedAuth.displayName,
      email: updatedAuth.email,
      username: updatedAuth.username,
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
    setTimeout(() => setPasswordSuccess(""), 5000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-[2rem] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        <div className="absolute top-0 right-0 p-32 bg-gradient-to-br from-blue-50 to-emerald-50 rounded-full blur-3xl opacity-50 -z-10 -mr-16 -mt-16 pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-center gap-6 z-10 relative">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[#0F2137] to-[#1E3A66] text-white shadow-lg border-4 border-white overflow-hidden">
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <User size={40} className="opacity-90" />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 border-2 border-white p-1.5 shadow-sm">
              <Check size={12} className="text-white" />
            </div>
          </div>
          
          <div className="text-center md:text-left flex-1">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-1">
              <h2 className="text-3xl font-black tracking-tight text-slate-900">
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

      {/* Unified Settings Card */}
      <div className="rounded-[2rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12">
          
          {/* Profile Info Section */}
          <div className="md:col-span-7 p-8 md:p-10 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/30">
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

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)] transition-all hover:bg-slate-800 hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.3)] active:scale-[0.98]"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>

          {/* Security Section */}
          <div className="md:col-span-5 p-8 md:p-10 bg-white">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Security</h3>
                <p className="text-xs text-slate-500 mt-0.5">Update your password</p>
              </div>
            </div>

            {passwordError && (
              <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-bold text-rose-800 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
                <div className="mt-0.5 shrink-0">⚠️</div>
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-6 rounded-xl bg-emerald-50/80 border border-emerald-200 p-3.5 text-xs font-bold text-emerald-800 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
                <div className="h-5 w-5 rounded-full bg-emerald-200/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} className="text-emerald-700" />
                </div>
                <div className="leading-relaxed">{passwordSuccess}</div>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Current Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-slate-800 transition-colors">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm font-semibold text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">New Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-slate-800 transition-colors">
                    <KeyRound size={16} />
                  </div>
                  <input
                    type={showNewPass ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm font-semibold text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Confirm Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-slate-800 transition-colors">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showNewPass ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
