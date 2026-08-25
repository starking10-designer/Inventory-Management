import { useState } from "react";
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      // Retrieve stored credentials from localStorage, or fallback to default
      const storedAuth = JSON.parse(
        localStorage.getItem("admin_auth_data") || "{}"
      );
      const validUsername = storedAuth.username || "Admin";
      const validPassword = storedAuth.password || "Admin@inventorymanagement";

      if (
        username.trim() === validUsername &&
        password === validPassword
      ) {
        const sessionUser = {
          username: validUsername,
          displayName: storedAuth.displayName || "Admin",
          email: storedAuth.email || "admin@inventorymanagement.com",
          role: "System Administrator",
          loginTime: new Date().toISOString(),
        };

        localStorage.setItem("admin_session", JSON.stringify(sessionUser));
        onLoginSuccess(sessionUser);
      } else {
        setError("Invalid username or password. Please check your credentials.");
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glow orbs (Navy / Slate / Ice Blue) */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-slate-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-200/40 rounded-full blur-3xl pointer-events-none" />

      {/* Glassmorphic Login Card */}
      <div className="w-full max-w-md relative z-10 glass-panel rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/90 bg-white/70 backdrop-blur-2xl">
        {/* Header / Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0F2137] via-[#1E3A66] to-[#0A192F] text-white shadow-lg shadow-slate-900/20 border border-white/60">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Admin Portal
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 font-medium">
            I&D E-Commerce Operations & Inventory Management
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-rose-50/90 border border-rose-200/80 p-3.5 text-xs font-bold text-rose-700 shadow-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User size={18} />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-xs backdrop-blur-md transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 py-3 pl-10 pr-11 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-xs backdrop-blur-md transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0F2137] to-[#1E3A66] py-3.5 px-4 text-sm font-bold text-white shadow-md transition hover:from-[#1E3A66] hover:to-[#0F2137] disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Sign In to Dashboard"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
