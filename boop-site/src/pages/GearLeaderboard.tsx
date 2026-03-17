import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type GearRow = {
  username: string;
  family_name: string | null;
  bdo_class: string | null;
  gear_ap: number | null;
  gear_aap: number | null;
  gear_dp: number | null;
  gs: number;
};

type SortKey = "gs" | "gear_ap" | "gear_aap" | "gear_dp";

export default function GearLeaderboard() {
  const user = useAuth();
  const [gear, setGear] = useState<GearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("gs");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    const token = localStorage.getItem("boop_session") ?? "";
    fetch("/api/leaderboard", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setGear(d.gear ?? []))
      .finally(() => setLoading(false));
  }, [user]);

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
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-black text-white">Gear Score Leaderboard</h1>
        <span className="text-sm text-slate-500">
          {showAll ? `All ${sorted.length}` : `Top ${Math.min(25, sorted.length)}`}
        </span>
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
                      {row.bdo_class ?? <span className="text-slate-600">—</span>}
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
    </div>
  );
}
