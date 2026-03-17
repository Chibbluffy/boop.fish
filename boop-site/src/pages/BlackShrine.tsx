import React, { useEffect, useState } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";
import type { ShrineTeam } from "./ShrineSection";

type Signup = {
  id: string;
  user_id: string;
  username: string;
  character_name: string | null;
  bdo_class: string | null;
  ap: number | null;
  aap: number | null;
  dp: number | null;
  note: string | null;
  signed_up_at: string;
};

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

export default function BlackShrine() {
  const user      = useAuth();
  const isOfficer = isOfficerOrAdmin(user);

  const [signups,    setSignups]    = useState<Signup[]>([]);
  const [teams,      setTeams]      = useState<ShrineTeam[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clearing,   setClearing]   = useState(false);

  const mySignup = signups.find(s => s.user_id === user?.id) ?? null;

  // Load signups + teams
  useEffect(() => {
    if (!user || user.role === "pending") return;
    Promise.all([
      fetch("/api/shrine",       { headers: authH() }).then(r => r.json()),
      fetch("/api/shrine/teams", { headers: authH() }).then(r => r.json()),
    ]).then(([sups, tms]) => {
      setSignups(Array.isArray(sups) ? sups : []);
      setTeams(Array.isArray(tms) ? tms : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  // Sync profile gear changes into the signups list (keeps the participants table current)
  useEffect(() => {
    if (!user || !signups.length) return;
    setSignups(prev => prev.map(s =>
      s.user_id === user.id
        ? { ...s, bdo_class: user.bdo_class, ap: user.gear_ap, aap: user.gear_aap, dp: user.gear_dp }
        : s
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.bdo_class, user?.gear_ap, user?.gear_aap, user?.gear_dp, signups.length]);

  // Access gate
  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">⛩️</p>
          <p className="text-white font-bold text-lg">Members only</p>
          <p className="text-slate-500 mt-2 text-sm">
            {!user ? "Sign in to view Black Shrine sign-ups." : "Your account is pending approval."}
          </p>
        </div>
      </div>
    );
  }

  async function signUp() {
    setSubmitting(true);
    const res = await fetch("/api/shrine", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({
        bdo_class: user!.bdo_class  || undefined,
        ap:        user!.gear_ap   ?? undefined,
        aap:       user!.gear_aap  ?? undefined,
        dp:        user!.gear_dp   ?? undefined,
      }),
    });
    if (res.ok) {
      const fresh = await fetch("/api/shrine", { headers: authH() }).then(r => r.json());
      setSignups(Array.isArray(fresh) ? fresh : []);
    }
    setSubmitting(false);
  }

  async function withdraw() {
    const signupId = mySignup?.id;
    await fetch("/api/shrine/me", { method: "DELETE", headers: authH() });
    setSignups(prev => prev.filter(s => s.user_id !== user!.id));
    if (signupId) {
      setTeams(prev => prev.map(t => ({
        ...t,
        members: t.members.filter(m => m.signup_id !== signupId),
      })));
    }
  }

  async function removeSignup(id: string) {
    await fetch(`/api/shrine/${id}`, { method: "DELETE", headers: authH() });
    setSignups(prev => prev.filter(s => s.id !== id));
    setTeams(prev => prev.map(t => ({
      ...t,
      members: t.members.filter(m => m.signup_id !== id),
    })));
  }

  async function clearAll() {
    if (!confirm("Clear all sign-ups?")) return;
    setClearing(true);
    await fetch("/api/shrine/clear", { method: "POST", headers: authH() });
    setSignups([]);
    const tms = await fetch("/api/shrine/teams", { headers: authH() }).then(r => r.json()).catch(() => []);
    setTeams(Array.isArray(tms) ? tms : []);
    setClearing(false);
  }

  const hasGear = user.bdo_class || user.gear_ap != null || user.gear_aap != null || user.gear_dp != null;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-4xl font-black tracking-tight text-white">Black Shrine</h2>
            <p className="text-slate-400 mt-1 text-sm">Sign up for this week's run.</p>
          </div>
          {isOfficer && (
            <button onClick={clearAll} disabled={clearing || signups.length === 0}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/30 disabled:opacity-30 transition-colors">
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          )}
        </div>

        {/* ── Sign-up card ── */}
        {mySignup ? (
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-5 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-violet-300 mb-2">You're signed up ✓</p>
                <div className="flex flex-wrap gap-3 items-center">
                  {user.bdo_class && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {user.bdo_class}
                    </span>
                  )}
                  {user.gear_ap  != null && <span className="text-xs text-slate-300">AP <span className="text-white font-black">{user.gear_ap}</span></span>}
                  {user.gear_aap != null && <span className="text-xs text-slate-300">AAP <span className="text-white font-black">{user.gear_aap}</span></span>}
                  {user.gear_dp  != null && <span className="text-xs text-slate-300">DP <span className="text-white font-black">{user.gear_dp}</span></span>}
                </div>
              </div>
              <button onClick={withdraw}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-400 hover:bg-slate-900 transition-colors">
                Withdraw
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-5 mb-6">
            {hasGear ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Signing up with your saved gear:</p>
                  <div className="flex flex-wrap gap-3 items-center">
                    {user.bdo_class && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-800 text-violet-300 border border-slate-700">
                        {user.bdo_class}
                      </span>
                    )}
                    {user.gear_ap  != null && <span className="text-xs text-slate-400">AP <span className="text-white font-bold">{user.gear_ap}</span></span>}
                    {user.gear_aap != null && <span className="text-xs text-slate-400">AAP <span className="text-white font-bold">{user.gear_aap}</span></span>}
                    {user.gear_dp  != null && <span className="text-xs text-slate-400">DP <span className="text-white font-bold">{user.gear_dp}</span></span>}
                  </div>
                </div>
                <button onClick={signUp} disabled={submitting}
                  className="shrink-0 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-black text-sm transition-colors">
                  {submitting ? "Signing up…" : "Sign Up"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white font-bold mb-0.5">Set up your gear profile first</p>
                  <p className="text-xs text-slate-500">Click your name in the top-right to add your class and gear score.</p>
                </div>
                <button onClick={signUp} disabled={submitting}
                  className="shrink-0 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 font-bold text-sm transition-colors border border-slate-700">
                  {submitting ? "…" : "Sign Up Anyway"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Teams (if any) ── */}
        {teams.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
              Teams <span className="text-slate-700">({teams.length})</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              {teams.map(team => (
                <div key={team.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-sm font-bold text-white">{team.name}</p>
                    <span className="text-[10px] font-black text-slate-600">{team.members.length}/5</span>
                  </div>
                  {team.members.length === 0 ? (
                    <p className="text-xs text-slate-700 py-2">Empty</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {team.members.map(m => (
                        <div key={m.signup_id} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[9px] font-black text-slate-400 shrink-0">
                            {(m.character_name ?? m.username)[0].toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate leading-tight">
                              {m.character_name ?? m.username}
                            </p>
                            {m.bdo_class && (
                              <p className="text-[10px] text-violet-400 leading-tight">{m.bdo_class}</p>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono shrink-0">
                            {[m.ap, m.aap, m.dp].map(v => v ?? "—").join("/")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Participants list ── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Participants</p>
            <span className="text-xs font-black text-slate-400">{signups.length}</span>
          </div>

          {loading ? (
            <p className="text-slate-600 text-center py-10 text-sm">Loading…</p>
          ) : signups.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <p className="text-3xl mb-2">⛩️</p>
              <p className="text-sm">No sign-ups yet. Be the first!</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-x-4 px-5 py-2 border-b border-slate-800/60 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                <span className="w-7" />
                <span>Character</span>
                <span>Class</span>
                <span>AP</span>
                <span>AAP</span>
                <span>DP</span>
                <span />
              </div>

              {signups.map((s, i) => (
                <div key={s.id}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-x-4 items-center px-5 py-3 ${
                    i < signups.length - 1 ? "border-b border-slate-800/40" : ""
                  } ${s.user_id === user.id ? "bg-violet-500/5" : ""}`}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">
                    {(s.character_name ?? s.username)[0].toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {s.character_name ?? s.username}
                      {s.user_id === user.id && <span className="ml-1.5 text-xs text-slate-500">(you)</span>}
                    </p>
                    {s.note && <p className="text-xs text-slate-600 truncate italic">"{s.note}"</p>}
                  </div>

                  <span className={`text-xs font-semibold whitespace-nowrap ${s.bdo_class ? "text-violet-300" : "text-slate-700"}`}>
                    {s.bdo_class ?? "—"}
                  </span>

                  {(["ap", "aap", "dp"] as const).map(stat => (
                    <span key={stat} className={`text-xs font-bold tabular-nums ${s[stat] != null ? "text-slate-200" : "text-slate-700"}`}>
                      {s[stat] ?? "—"}
                    </span>
                  ))}

                  <div className="flex items-center gap-1">
                    {isOfficer && s.user_id !== user.id && (
                      <button onClick={() => removeSignup(s.id)}
                        className="text-slate-700 hover:text-red-400 transition-colors text-xs px-1">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
