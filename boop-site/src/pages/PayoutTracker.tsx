import { useEffect, useState, useRef } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";

type PayoutMember = {
  id: string;
  username: string;
  family_name: string | null;
  payout_tier: number;
  last_old_tier: number | null;
  last_new_tier: number | null;
  last_reason: string | null;
  last_changed_at: string | null;
  last_changed_by: string | null;
};

type HistoryEntry = {
  id: string;
  old_tier: number;
  new_tier: number;
  reason: string | null;
  changed_by_name: string | null;
  created_at: string;
};

// ── Tier styling ──────────────────────────────────────────────────────────────

function tierBg(tier: number): string {
  if (tier >= 10) return "bg-yellow-400/20 text-yellow-300 border-yellow-400/50 shadow-yellow-500/20 shadow-sm";
  if (tier >= 9)  return "bg-orange-500/20 text-orange-300 border-orange-500/40";
  if (tier >= 7)  return "bg-amber-500/20  text-amber-300  border-amber-500/40";
  if (tier >= 5)  return "bg-cyan-500/20   text-cyan-300   border-cyan-500/40";
  if (tier >= 3)  return "bg-blue-500/20   text-blue-300   border-blue-500/40";
  return "bg-slate-700/50 text-slate-400 border-slate-700";
}

function tierLabel(tier: number): string { return `T${tier}`; }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

// ── History modal ─────────────────────────────────────────────────────────────

function HistoryModal({ member, onClose }: { member: PayoutMember; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/payout/history/${member.id}`, { headers: authH() })
      .then(r => r.json())
      .then(d => { setHistory(d); setLoading(false); });
  }, [member.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-white">{member.username}</h3>
            <p className="text-xs text-slate-500">Tier history</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-black px-2.5 py-1 rounded-lg border ${tierBg(member.payout_tier)}`}>
              {tierLabel(member.payout_tier)}
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-lg leading-none">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-slate-600 text-sm text-center py-8">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-8">No changes recorded yet.</p>
          ) : history.map(h => (
            <div key={h.id} className="flex items-start gap-3 py-2 border-b border-slate-800/60 last:border-0">
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${tierBg(h.old_tier)}`}>{tierLabel(h.old_tier)}</span>
                <span className="text-slate-600 text-xs">→</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${tierBg(h.new_tier)}`}>{tierLabel(h.new_tier)}</span>
              </div>
              <div className="flex-1 min-w-0">
                {h.reason && <p className="text-sm text-slate-300 leading-tight">{h.reason}</p>}
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {h.changed_by_name ?? "unknown"} · {timeAgo(h.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PayoutTracker() {
  const user = useAuth();

  const [members, setMembers]       = useState<PayoutMember[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [search, setSearch]         = useState("");
  const [saving, setSaving]         = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [historyFor, setHistoryFor] = useState<PayoutMember | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !isOfficerOrAdmin(user)) return;
    fetch("/api/payout", { headers: authH() })
      .then(r => r.json())
      .then(d => { setMembers(d); setLoading(false); });
  }, [user]);

  if (!user || !isOfficerOrAdmin(user)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Officers only.</p>
      </div>
    );
  }

  // ── Apply tier change ───────────────────────────────────────────────────────

  async function applyChange(ids: string[], opts: { delta?: number; set_tier?: number }, reason?: string) {
    const body: Record<string, unknown> = { user_ids: ids, reason: reason || undefined };
    if (opts.set_tier != null) body.set_tier = opts.set_tier;
    else body.delta = opts.delta;

    setSaving(prev => new Set([...prev, ...ids]));
    const res = await fetch("/api/payout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const results: { id: string; payout_tier: number }[] = await res.json();
      setMembers(prev => prev.map(m => {
        const r = results.find(x => x.id === m.id);
        if (!r) return m;
        return {
          ...m,
          payout_tier: r.payout_tier,
          last_old_tier: m.payout_tier,
          last_new_tier: r.payout_tier,
          last_reason: reason || null,
          last_changed_at: new Date().toISOString(),
          last_changed_by: user.username,
        };
      }));
    }
    setSaving(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
  }

  // ── Bulk helpers ────────────────────────────────────────────────────────────

  const selectedArr = [...selected];
  function bulkApply(opts: { delta?: number; set_tier?: number }) {
    if (!selectedArr.length) return;
    applyChange(selectedArr, opts, bulkReason);
    setBulkReason("");
    setSelected(new Set());
  }

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return !q || m.username.toLowerCase().includes(q) || (m.family_name?.toLowerCase().includes(q) ?? false);
  });

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function selectAll()   { setSelected(new Set(filtered.map(m => m.id))); }
  function deselectAll() { setSelected(new Set()); }

  const allSelected = filtered.length > 0 && filtered.every(m => selected.has(m.id));

  // ── Tier distribution summary ───────────────────────────────────────────────

  const dist = members.reduce((acc, m) => { acc[m.payout_tier] = (acc[m.payout_tier] ?? 0) + 1; return acc; }, {} as Record<number, number>);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Payout Tracker</h1>
          <p className="text-sm text-slate-500 mt-0.5">{members.length} members tracked</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Reset all button */}
          <button
            onClick={() => {
              if (confirm("Reset ALL members to T1? This will be logged.")) {
                applyChange(members.map(m => m.id), { set_tier: 1 }, "Payout reset");
              }
            }}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 transition-colors"
          >
            Reset All → T1
          </button>

          {/* Tier distribution pills */}
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {[10,9,8,7,6,5,4,3,2,1].filter(t => dist[t]).map(t => (
              <span key={t} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierBg(t)}`}>
                T{t}×{dist[t]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Search + select controls */}
      <div className="flex gap-2 mb-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search members…"
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <button onClick={allSelected ? deselectAll : selectAll}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors whitespace-nowrap">
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* ── Bulk action bar (always visible, active when selection > 0) ── */}
      <div className={`sticky top-16 z-30 mb-3 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 border transition-all ${
        selected.size > 0
          ? "bg-slate-900 border-violet-500/30 shadow-xl shadow-black/40"
          : "bg-slate-900/40 border-slate-800/60"
      }`}>
        <span className={`text-xs font-black shrink-0 transition-colors ${selected.size > 0 ? "text-violet-300" : "text-slate-600"}`}>
          {selected.size > 0 ? `${selected.size} selected` : "0 selected"}
        </span>

        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <input
            ref={reasonRef}
            value={bulkReason}
            onChange={e => setBulkReason(e.target.value)}
            disabled={selected.size === 0}
            placeholder="Reason (optional)…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </div>

        <div className={`flex items-center gap-1.5 flex-wrap transition-opacity ${selected.size === 0 ? "opacity-30 pointer-events-none" : ""}`}>
          <button onClick={() => bulkApply({ delta: +1 })}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/30 transition-colors">
            +1 Tier
          </button>
          <button onClick={() => bulkApply({ delta: -1 })}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 transition-colors">
            −1 Tier
          </button>
          <button onClick={() => bulkApply({ set_tier: 10 })}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-300 border border-yellow-400/40 transition-colors">
            Set T10
          </button>
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) { bulkApply({ set_tier: parseInt(e.target.value) }); e.target.value = ""; } }}
            className="px-2 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <option value="" disabled>Set tier…</option>
            {[1,2,3,4,5,6,7,8,9,10].map(t => (
              <option key={t} value={t}>T{t}</option>
            ))}
          </select>
          <button onClick={deselectAll}
            className="px-2 py-1.5 text-xs text-slate-500 hover:text-white transition-colors">
            ✕
          </button>
        </div>
      </div>

      {/* ── Member table ── */}
      {loading ? (
        <p className="text-slate-600 text-center py-16">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-600 text-center py-16">No members found.</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_8rem_1fr_2rem] gap-3 px-4 py-2.5 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            <span>
              <input type="checkbox" checked={allSelected} onChange={allSelected ? deselectAll : selectAll}
                className="accent-violet-500 cursor-pointer" />
            </span>
            <span>Player</span>
            <span>Tier</span>
            <span>Last Change</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map((m, i) => {
            const isSaving = saving.has(m.id);
            const isChecked = selected.has(m.id);
            return (
              <div key={m.id}
                onClick={() => toggleSelect(m.id)}
                className={`grid grid-cols-[2rem_1fr_8rem_1fr_2rem] gap-3 items-center px-4 py-3 transition-colors cursor-pointer ${
                  isChecked ? "bg-violet-900/10" : "hover:bg-slate-800/30"
                } ${i < filtered.length - 1 ? "border-b border-slate-800/50" : ""}`}
              >
                {/* Checkbox (visual only — row click handles toggle) */}
                <input type="checkbox" checked={isChecked} onChange={() => {}} onClick={e => e.stopPropagation()}
                  className="accent-violet-500 cursor-pointer" />

                {/* Name */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.username}</p>
                  {m.family_name && <p className="text-xs text-slate-600 truncate">{m.family_name}</p>}
                </div>

                {/* Tier + quick +/- */}
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => applyChange([m.id], { delta: -1 })}
                    disabled={isSaving || m.payout_tier <= 1}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  >−</button>

                  <span className={`text-xs font-black px-2 py-1 rounded-lg border min-w-[2.5rem] text-center transition-all ${tierBg(m.payout_tier)} ${isSaving ? "opacity-50" : ""}`}>
                    {tierLabel(m.payout_tier)}
                  </span>

                  <button
                    onClick={() => applyChange([m.id], { delta: +1 })}
                    disabled={isSaving || m.payout_tier >= 10}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-green-400 hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
                  >+</button>
                </div>

                {/* Last change */}
                <div className="min-w-0">
                  {m.last_changed_at ? (
                    <>
                      <p className="text-xs text-slate-500 truncate">
                        {m.last_old_tier != null && m.last_new_tier != null && (
                          <span className={`font-bold mr-1 ${m.last_new_tier > m.last_old_tier! ? "text-green-500" : "text-red-500"}`}>
                            {m.last_new_tier > m.last_old_tier! ? "▲" : "▼"} T{m.last_old_tier}→T{m.last_new_tier}
                          </span>
                        )}
                        {timeAgo(m.last_changed_at)}
                        {m.last_changed_by && <span className="text-slate-600"> · {m.last_changed_by}</span>}
                      </p>
                      {m.last_reason && (
                        <p className="text-xs text-slate-600 truncate">{m.last_reason}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-700">No changes yet</p>
                  )}
                </div>

                {/* History icon */}
                <button onClick={e => { e.stopPropagation(); setHistoryFor(m); }}
                  title="View history"
                  className="text-slate-600 hover:text-violet-400 transition-colors text-sm leading-none">
                  📋
                </button>
              </div>
            );
          })}
        </div>
      )}

      {historyFor && <HistoryModal member={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
