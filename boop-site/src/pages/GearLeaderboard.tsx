import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type GearRow = {
  id: string;
  username: string;
  family_name: string | null;
  bdo_class: string | null;
  alt_class: string | null;
  gear_ap: number | null;
  gear_aap: number | null;
  gear_dp: number | null;
  gs: number;
};

type SortKey = "gs" | "gear_ap" | "gear_aap" | "gear_dp";

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

function EditGearModal({
  row,
  onClose,
  onSaved,
}: {
  row: GearRow;
  onClose: () => void;
  onSaved: (id: string, ap: number | null, aap: number | null, dp: number | null) => void;
}) {
  const [ap,  setAp]  = useState(row.gear_ap  != null ? String(row.gear_ap)  : "");
  const [aap, setAap] = useState(row.gear_aap != null ? String(row.gear_aap) : "");
  const [dp,  setDp]  = useState(row.gear_dp  != null ? String(row.gear_dp)  : "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/roster/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({
        gear_ap:  ap.trim()  ? parseInt(ap)  : null,
        gear_aap: aap.trim() ? parseInt(aap) : null,
        gear_dp:  dp.trim()  ? parseInt(dp)  : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to save");
      return;
    }
    const newAp  = ap.trim()  ? parseInt(ap)  : null;
    const newAap = aap.trim() ? parseInt(aap) : null;
    const newDp  = dp.trim()  ? parseInt(dp)  : null;
    onSaved(row.id, newAp, newAap, newDp);
    onClose();
  }

  function clearAll() {
    setAp(""); setAap(""); setDp("");
  }

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors font-mono";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-bold">{row.username}</h3>
            {row.family_name && <p className="text-slate-500 text-xs">{row.family_name}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">AP</label>
            <input className={inp} type="number" min="0" placeholder="—" value={ap}  onChange={e => setAp(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">AAP</label>
            <input className={inp} type="number" min="0" placeholder="—" value={aap} onChange={e => setAap(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">DP</label>
            <input className={inp} type="number" min="0" placeholder="—" value={dp}  onChange={e => setDp(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={clearAll}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GearLeaderboard() {
  const user = useAuth();
  const isAdmin = user?.role === "admin";
  const [gear, setGear] = useState<GearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("gs");
  const [showAll, setShowAll] = useState(false);
  const [showNonMembers, setShowNonMembers] = useState(false);
  const [editing, setEditing] = useState<GearRow | null>(null);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    setLoading(true);
    const url = isAdmin && showNonMembers ? "/api/leaderboard?all=true" : "/api/leaderboard";
    fetch(url, { headers: authH() })
      .then(r => r.json())
      .then(d => setGear(d.gear ?? []))
      .finally(() => setLoading(false));
  }, [user, showNonMembers]);

  function handleSaved(id: string, ap: number | null, aap: number | null, dp: number | null) {
    setGear(prev => prev
      .map(r => r.id === id
        ? { ...r, gear_ap: ap, gear_aap: aap, gear_dp: dp,
            gs: Math.max(ap ?? 0, aap ?? 0) + (dp ?? 0) }
        : r)
      .filter(r => r.gear_ap != null || r.gear_aap != null || r.gear_dp != null)
    );
  }

  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Members only.</p>
      </div>
    );
  }

  const sorted = [...gear].sort((a, b) => ((b[sortKey] ?? 0) as number) - ((a[sortKey] ?? 0) as number));
  const displayed = showAll ? sorted : sorted.slice(0, 25);

  const thBase = "px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap";
  const thSort = (key: SortKey) =>
    `${thBase} cursor-pointer select-none transition-colors ${sortKey === key ? "text-violet-400" : "hover:text-slate-300"}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-black text-white">Gear Score Leaderboard</h1>
          <span className="text-sm text-slate-500">
            {showAll ? `All ${sorted.length}` : `Top ${Math.min(25, sorted.length)}`}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowNonMembers(v => !v); setShowAll(false); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showNonMembers
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700"
            }`}
          >
            {showNonMembers ? "Showing All Users" : "Members Only"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-600 text-sm">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-slate-600 text-sm">No gear data yet.</p>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-slate-800">
                <tr>
                  <th className={thBase}>#</th>
                  <th className={thBase}>Player</th>
                  <th className={thBase}>Class</th>
                  <th className={thSort("gear_ap")}  onClick={() => setSortKey("gear_ap")}>
                    AP{sortKey === "gear_ap" && " ▾"}
                  </th>
                  <th className={thSort("gear_aap")} onClick={() => setSortKey("gear_aap")}>
                    AAP{sortKey === "gear_aap" && " ▾"}
                  </th>
                  <th className={thSort("gear_dp")}  onClick={() => setSortKey("gear_dp")}>
                    DP{sortKey === "gear_dp" && " ▾"}
                  </th>
                  <th className={thSort("gs")}        onClick={() => setSortKey("gs")}>
                    GS{sortKey === "gs" && " ▾"}
                  </th>
                  {isAdmin && <th className={thBase} />}
                </tr>
              </thead>
              <tbody>
                {displayed.map((row, i) => (
                  <tr key={row.username} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-sm font-black text-slate-500 w-10">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-sm font-semibold text-white">{row.username}</span>
                      {row.family_name && (
                        <span className="text-xs text-slate-500 ml-2">{row.family_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-400">
                      {row.bdo_class
                          ? <>{row.bdo_class}{row.alt_class && <span className="text-slate-600">/{row.alt_class}</span>}</>
                          : <span className="text-slate-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-sm tabular-nums font-mono ${sortKey === "gear_ap" ? "text-violet-300 font-bold" : "text-slate-300"}`}>
                      {row.gear_ap ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-sm tabular-nums font-mono ${sortKey === "gear_aap" ? "text-violet-300 font-bold" : "text-slate-300"}`}>
                      {row.gear_aap ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-sm tabular-nums font-mono ${sortKey === "gear_dp" ? "text-violet-300 font-bold" : "text-slate-300"}`}>
                      {row.gear_dp ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-sm tabular-nums font-black ${sortKey === "gs" ? "text-violet-400" : "text-slate-200"}`}>
                      {row.gs > 0 ? row.gs : <span className="text-slate-600 font-normal">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => setEditing(row)}
                          className="text-xs text-slate-600 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-slate-700/50"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length > 25 && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => setShowAll(v => !v)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-xl transition-colors"
              >
                {showAll ? "Show Top 25" : `Show All (${sorted.length})`}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditGearModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
