import React, { useEffect, useState } from "react";
import { useAuth, saveSession, clearSession, type AuthUser } from "../lib/auth";

// Read a param from the hash query string e.g. #/auth?token=xxx
function getHashParam(key: string): string | null {
  return new URLSearchParams(location.hash.split("?")[1] ?? "").get(key);
}

export default function Auth() {
  const user = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // On mount — handle Discord callback token or error
  useEffect(() => {
    const token        = getHashParam("token");
    const discordError = getHashParam("discord_error");

    if (token) {
      // Exchange the one-time token for the full user object
      setLoading(true);
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((u: AuthUser) => {
          saveSession(token, u);
          // Clean token from URL then navigate home
          history.replaceState(null, "", location.pathname + "#/");
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        })
        .catch(() => setError("Login failed. Please try again."))
        .finally(() => setLoading(false));
    }

    if (discordError) {
      history.replaceState(null, "", location.pathname + "#/auth");
      setError(
        discordError === "not_in_guild"
          ? "You need to be in the boop Discord server to log in."
          : "Discord login failed. Please try again."
      );
    }
  }, []);

  async function logout() {
    const token = localStorage.getItem("boop_session");
    if (token) await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    clearSession();
  }

  // ── Logged in view ───────────────────────────────────────────────────────────
  if (user) {
    const avatarUrl = user.discord_avatar;
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-2 mb-6">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-violet-500/40" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-2xl font-black text-violet-300">
                {user.username[0].toUpperCase()}
              </div>
            )}
            <p className="text-lg font-black text-white">{user.username}</p>
            {user.family_name && <p className="text-sm text-slate-400">{user.family_name}</p>}
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

  // ── Login view ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black text-white">boop<span className="text-violet-400">.fish</span></h2>
          <p className="text-slate-400 mt-1 text-sm">Sign in with your Discord account.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">

          {loading ? (
            <p className="text-center text-slate-500 py-4 text-sm">Logging in…</p>
          ) : (
            <a
              href="/auth/discord"
              className="flex items-center justify-center gap-3 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
            >
              <DiscordIcon />
              Continue with Discord
            </a>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-slate-700 mt-4">
          You must be a member of the boop Discord server to log in.
        </p>
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}
