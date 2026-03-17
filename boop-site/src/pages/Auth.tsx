import React, { useEffect, useState } from "react";
import { useAuth, saveSession, clearSession } from "../lib/auth";

type Mode = "login" | "register" | "forgot" | "reset";

function getResetToken(): string | null {
  return new URLSearchParams(location.hash.split("?")[1] ?? "").get("reset");
}

export default function Auth() {
  const user = useAuth();
  const [mode, setMode] = useState<Mode>(() => (getResetToken() ? "reset" : "login"));

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [charName, setCharName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Detect reset token in URL on mount
  useEffect(() => {
    if (getResetToken()) setMode("reset");
  }, []);

  function reset() { setError(null); setInfo(null); }

  // ── Submit handlers ─────────────────────────────────────────────────────────

  async function submitLoginRegister() {
    reset();
    if (!username.trim() || !password) return setError("Fill in all fields.");
    if (mode === "register" && password !== confirm) return setError("Passwords do not match.");
    if (mode === "register" && password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      const body: Record<string, string> = { username, password };
      if (mode === "register" && charName.trim()) body.character_name = charName.trim();
      if (mode === "register" && email.trim()) body.email = email.trim();

      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      saveSession(data.token, data.user);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot() {
    reset();
    if (!email.trim()) return setError("Enter your email address.");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show the same message — never confirm whether email exists
      setInfo("If that email is registered, a reset link is on its way. Check your inbox (and spam).");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReset() {
    reset();
    const token = getResetToken();
    if (!token) return setError("Missing reset token. Request a new link.");
    if (!password) return setError("Enter a new password.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      setInfo("Password updated! You can now sign in.");
      // Clean the token from the URL
      history.replaceState(null, "", location.pathname + "#/auth");
      setMode("login");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const token = localStorage.getItem("boop_session");
    if (token) await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    clearSession();
  }

  // ── Logged in ────────────────────────────────────────────────────────────────
  if (user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-16 h-16 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-2xl font-black text-violet-300">
              {user.username[0].toUpperCase()}
            </div>
            <p className="text-lg font-black text-white">{user.username}</p>
            {user.character_name && <p className="text-sm text-slate-400">{user.character_name}</p>}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
              user.role === "admin"   ? "bg-red-500/20 text-red-400 border border-red-500/30" :
              user.role === "officer" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                                        "bg-slate-700 text-slate-400"
            }`}>
              {user.role}
            </span>
          </div>
          <button onClick={logout} className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── Shared layout wrapper ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black text-white">boop<span className="text-violet-400">.fish</span></h2>
          <p className="text-slate-400 mt-1 text-sm">
            {mode === "login"    ? "Welcome back." :
             mode === "register" ? "Join the guild." :
             mode === "forgot"   ? "Recover your account." :
                                   "Choose a new password."}
          </p>
        </div>

        {/* Mode tabs — only show for login/register */}
        {(mode === "login" || mode === "register") && (
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6">
            {(["login", "register"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); reset(); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === m ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}>
                {m === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">

          {/* ── Login ── */}
          {mode === "login" && <>
            <Field label="Username">
              <TextInput value={username} onChange={setUsername} placeholder="your_username" onEnter={submitLoginRegister} />
            </Field>
            <Field label="Password">
              <TextInput type="password" value={password} onChange={setPassword} placeholder="••••••••" onEnter={submitLoginRegister} />
            </Field>
            <button onClick={() => { setMode("forgot"); reset(); }}
              className="text-xs text-slate-500 hover:text-violet-400 transition-colors text-left -mt-2">
              Forgot password?
            </button>
          </>}

          {/* ── Register ── */}
          {mode === "register" && <>
            <Field label="Username">
              <TextInput value={username} onChange={setUsername} placeholder="your_username" onEnter={submitLoginRegister} />
            </Field>
            <Field label="Character Name" optional>
              <TextInput value={charName} onChange={setCharName} placeholder="In-game name" onEnter={submitLoginRegister} />
            </Field>
            <Field label="Email" optional>
              <TextInput type="email" value={email} onChange={setEmail} placeholder="you@example.com" onEnter={submitLoginRegister} />
            </Field>
            <Field label="Password">
              <TextInput type="password" value={password} onChange={setPassword} placeholder="8+ characters" onEnter={submitLoginRegister} />
            </Field>
            <Field label="Confirm Password">
              <TextInput type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" onEnter={submitLoginRegister} />
            </Field>
          </>}

          {/* ── Forgot password ── */}
          {mode === "forgot" && <>
            <Field label="Email address">
              <TextInput type="email" value={email} onChange={setEmail} placeholder="you@example.com" onEnter={submitForgot} />
            </Field>
          </>}

          {/* ── Reset password ── */}
          {mode === "reset" && <>
            <Field label="New Password">
              <TextInput type="password" value={password} onChange={setPassword} placeholder="8+ characters" onEnter={submitReset} />
            </Field>
            <Field label="Confirm New Password">
              <TextInput type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" onEnter={submitReset} />
            </Field>
          </>}

          {/* Feedback */}
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          {info  && <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{info}</p>}

          {/* Submit */}
          <button
            onClick={mode === "forgot" ? submitForgot : mode === "reset" ? submitReset : submitLoginRegister}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors mt-1"
          >
            {loading ? "..." :
             mode === "login"    ? "Sign in" :
             mode === "register" ? "Create account" :
             mode === "forgot"   ? "Send reset link" :
                                   "Update password"}
          </button>

          {/* Back links */}
          {(mode === "forgot" || mode === "reset") && (
            <button onClick={() => { setMode("login"); reset(); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors text-center">
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small shared sub-components ───────────────────────────────────────────────

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
        {label}{optional && <span className="normal-case text-slate-600 font-normal ml-1">(optional)</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", onEnter }:
  { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; onEnter?: () => void }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
    />
  );
}
