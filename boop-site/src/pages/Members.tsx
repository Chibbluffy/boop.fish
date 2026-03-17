import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type Member = {
  id: string;
  username: string;
  email: string | null;
  role: "pending" | "member" | "officer" | "admin";
  character_name: string | null;
  ribbit_count: number;
  created_at: string;
};

const ROLE_STYLE: Record<string, string> = {
  admin:   "bg-red-500/20 text-red-400 border border-red-500/30",
  officer: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  member:  "bg-slate-700/50 text-slate-400 border border-slate-700",
  pending: "bg-slate-800/80 text-slate-500 border border-slate-700/50",
};

export default function Members() {
  const user = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("boop_session");
    fetch("/api/members", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setMembers(data); setLoading(false); })
      .catch(() => { setError("Failed to load members."); setLoading(false); });
  }, []);

  async function changeRole(memberId: string, newRole: string) {
    setUpdating(memberId);
    const token = localStorage.getItem("boop_session");
    const res = await fetch(`/api/members/${memberId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role: newRole }),
    });

    if (res.ok) {
      const updated = await res.json();
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: updated.role } : m)
        .sort((a, b) => {
          const order = { admin: 0, officer: 1, member: 2 };
          return (order[a.role] - order[b.role]) || a.username.localeCompare(b.username);
        })
      );
    }
    setUpdating(null);
  }

  async function resetAllRibbits() {
    if (!confirm("Reset ALL members' ribbit counts to 0? This cannot be undone.")) return;
    setResettingAll(true);
    const token = localStorage.getItem("boop_session");
    const res = await fetch("/api/members/ribbits/reset-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMembers(prev => prev.map(m => ({ ...m, ribbit_count: 0 })));
    }
    setResettingAll(false);
  }

  async function resetRibbits(memberId: string) {
    setResetting(memberId);
    const token = localStorage.getItem("boop_session");
    const res = await fetch(`/api/members/${memberId}/ribbits/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ribbit_count: 0 } : m));
    }
    setResetting(null);
  }

  if (!user || (user.role !== "officer" && user.role !== "admin")) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Access denied.</p>
      </div>
    );
  }

  const counts = members.reduce((acc, m) => { acc[m.role] = (acc[m.role] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-4xl font-black tracking-tight text-white">Members</h2>
          <p className="text-slate-400 mt-1">Manage guild roster and roles.</p>

          {/* Stats */}
          <div className="flex gap-4 mt-4">
            {[
              { label: "Total",    value: members.length,                                  color: "text-white" },
              { label: "Pending",  value: counts.pending ?? 0,                             color: "text-slate-400" },
              { label: "Members",  value: counts.member ?? 0,                              color: "text-slate-300" },
              { label: "Officers", value: (counts.officer ?? 0) + (counts.admin ?? 0),     color: "text-amber-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 min-w-[80px] text-center">
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={resetAllRibbits}
            disabled={resettingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            🐸 {resettingAll ? "Resetting..." : "Reset all ribbits"}
          </button>
        </div>

        {/* Error */}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Table */}
        {loading ? (
          <div className="text-slate-500 text-center py-20">Loading...</div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-widest">
              <span className="w-8" />
              <span>Username</span>
              <span>Character</span>
              <span>Joined</span>
              <span title="Ribbit count — activity marker">🐸</span>
              <span>Role</span>
            </div>

            {members.map((m, i) => {
              const isMe = m.id === user.id;
              const canEdit = !isMe && (user.role === "admin" || m.role === "member");

              return (
                <div
                  key={m.id}
                  className={`grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5 ${
                    i < members.length - 1 ? "border-b border-slate-800/60" : ""
                  } hover:bg-slate-800/30 transition-colors`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    m.role === "admin"   ? "bg-red-500/20 text-red-300" :
                    m.role === "officer" ? "bg-amber-500/20 text-amber-300" :
                                           "bg-slate-800 text-slate-400"
                  }`}>
                    {m.username[0].toUpperCase()}
                  </div>

                  {/* Username */}
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {m.username}
                      {isMe && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    </p>
                    {m.email && <p className="text-xs text-slate-600 truncate">{m.email}</p>}
                  </div>

                  {/* Character */}
                  <p className="text-sm text-slate-400 truncate">{m.character_name ?? "—"}</p>

                  {/* Joined */}
                  <p className="text-xs text-slate-600 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>

                  {/* Ribbits */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold tabular-nums ${m.ribbit_count > 0 ? "text-green-400" : "text-slate-700"}`}>
                      {m.ribbit_count.toLocaleString()}
                    </span>
                    {!isMe && (
                      <button
                        onClick={() => resetRibbits(m.id)}
                        disabled={resetting === m.id || m.ribbit_count === 0}
                        title="Reset ribbits"
                        className="text-slate-700 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[11px] leading-none"
                      >
                        ↺
                      </button>
                    )}
                  </div>

                  {/* Role */}
                  <div className="shrink-0">
                    {canEdit ? (
                      <select
                        value={m.role}
                        disabled={updating === m.id}
                        onChange={e => changeRole(m.id, e.target.value)}
                        className={`text-xs font-bold px-2 py-1 rounded-lg border bg-slate-950 cursor-pointer transition-opacity disabled:opacity-40 ${ROLE_STYLE[m.role]}`}
                      >
                        <option value="pending">pending</option>
                        <option value="member">member</option>
                        <option value="officer">officer</option>
                        {user.role === "admin" && <option value="admin">admin</option>}
                      </select>
                    ) : (
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${ROLE_STYLE[m.role]}`}>
                        {m.role}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Role legend */}
        <div className="mt-6 flex gap-4 text-xs text-slate-600">
          <span><span className="text-amber-400 font-semibold">Officers</span> can view members and promote members to officer.</span>
          <span><span className="text-red-400 font-semibold">Admins</span> can assign any role.</span>
        </div>
      </div>
    </div>
  );
}
