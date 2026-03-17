import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type RibbitRow = {
  username: string;
  family_name: string | null;
  ribbit_count: number;
};

export default function RibbitLeaderboard() {
  const user = useAuth();
  const [rows, setRows] = useState<RibbitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    const token = localStorage.getItem("boop_session") ?? "";
    fetch("/api/leaderboard", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setRows(d.ribbits ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Members only.</p>
      </div>
    );
  }

  const thBase = "px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap";

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-black text-white">Ribbit Leaderboard</h1>
        <span className="text-sm text-slate-500">Top 10 🐸</span>
      </div>

      {loading ? (
        <p className="text-slate-600 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-600 text-sm">No ribbit data yet.</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-slate-800">
              <tr>
                <th className={thBase}>#</th>
                <th className={thBase}>Player</th>
                <th className={`${thBase} text-right`}>Ribbits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.username} className={`border-b border-slate-800/50 last:border-0 ${i < 3 ? "bg-violet-900/10" : ""}`}>
                  <td className="px-3 py-2.5 text-sm font-black text-slate-500 w-10">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-semibold text-white">{row.username}</span>
                    {row.family_name && (
                      <span className="text-xs text-slate-500 ml-2">{row.family_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-sm font-black tabular-nums ${
                      i === 0 ? "text-yellow-400" :
                      i === 1 ? "text-slate-300" :
                      i === 2 ? "text-amber-600" :
                      "text-slate-400"
                    }`}>
                      {row.ribbit_count.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
