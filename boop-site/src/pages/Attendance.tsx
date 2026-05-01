import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";

type AttendanceEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  event_timezone: string | null;
  status: string;
};

type AttendanceSignup = {
  event_id: string;
  discord_id: string;
  discord_name: string;
  attended: boolean | null;
  avatar_url: string | null;
  username: string | null;
};

type MemberStats = {
  discord_id: string;
  name: string;
  avatar_url: string | null;
  attended: number;
  total: number;
  pct: number;
  byEvent: Record<string, boolean | null>;
};

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt={name} className="w-7 h-7 rounded-full object-cover" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function PctBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : pct >= 25 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

type SortKey = "name" | "pct" | "attended" | "total";
type SortDir = "asc" | "desc";

export default function Attendance() {
  const user = useAuth();
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [signups, setSignups] = useState<AttendanceSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"scoreboard" | "matrix">("scoreboard");
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterMin, setFilterMin] = useState(0);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    fetch("/api/attendance", { headers: authH() })
      .then(r => r.json())
      .then(d => { setEvents(d.events ?? []); setSignups(d.signups ?? []); })
      .catch(() => setError("Failed to load attendance data"))
      .finally(() => setLoading(false));
  }, [user]);

  const memberStats = useMemo<MemberStats[]>(() => {
    const map = new Map<string, MemberStats>();
    const closedEvents = events.filter(e => e.status === "closed");
    const closedIds = new Set(closedEvents.map(e => e.id));

    for (const s of signups) {
      if (!closedIds.has(s.event_id)) continue;
      if (!map.has(s.discord_id)) {
        map.set(s.discord_id, {
          discord_id: s.discord_id,
          name: s.username ?? s.discord_name,
          avatar_url: s.avatar_url,
          attended: 0,
          total: 0,
          pct: 0,
          byEvent: {},
        });
      }
      const m = map.get(s.discord_id)!;
      m.total++;
      if (s.attended) m.attended++;
      m.byEvent[s.event_id] = s.attended;
    }

    for (const m of map.values()) {
      m.pct = m.total > 0 ? Math.round((m.attended / m.total) * 100) : 0;
    }

    return Array.from(map.values());
  }, [events, signups]);

  const sorted = useMemo(() => {
    return [...memberStats]
      .filter(m => m.total >= filterMin)
      .sort((a, b) => {
        let diff = 0;
        if (sortKey === "name") diff = a.name.localeCompare(b.name);
        else if (sortKey === "pct") diff = a.pct - b.pct;
        else if (sortKey === "attended") diff = a.attended - b.attended;
        else if (sortKey === "total") diff = a.total - b.total;
        return sortDir === "desc" ? -diff : diff;
      });
  }, [memberStats, sortKey, sortDir, filterMin]);

  const closedEvents = useMemo(() => events.filter(e => e.status === "closed"), [events]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-slate-600 text-xs ml-1">↕</span>;
    return <span className="text-violet-400 text-xs ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  if (!user || user.role === "pending") {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">You need to be logged in to view attendance.</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading attendance...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-[60vh] text-red-400">{error}</div>;
  }

  const thClass = "px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 transition-colors select-none whitespace-nowrap";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance Scoreboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {closedEvents.length} events · {memberStats.length} members tracked
          </p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <button
            onClick={() => setView("scoreboard")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "scoreboard" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
          >
            Scoreboard
          </button>
          <button
            onClick={() => setView("matrix")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "matrix" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
          >
            Matrix
          </button>
        </div>
      </div>

      {view === "scoreboard" && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <label className="text-slate-400 text-sm">Min events signed up:</label>
            <input
              type="number"
              min={0}
              value={filterMin}
              onChange={e => setFilterMin(parseInt(e.target.value) || 0)}
              className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-slate-800">
                <tr>
                  <th className={`${thClass} w-8`}>#</th>
                  <th className={thClass} onClick={() => toggleSort("name")}>Member <SortIcon k="name" /></th>
                  <th className={thClass} onClick={() => toggleSort("attended")}>Attended <SortIcon k="attended" /></th>
                  <th className={thClass} onClick={() => toggleSort("total")}>Total <SortIcon k="total" /></th>
                  <th className={thClass} onClick={() => toggleSort("pct")}>Rate <SortIcon k="pct" /></th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-40">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {sorted.map((m, i) => (
                  <tr key={m.discord_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-slate-500 text-sm font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar url={m.avatar_url} name={m.name} />
                        <span className="text-white text-sm font-medium">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-200 text-sm font-mono">{m.attended}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-sm font-mono">{m.total}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-sm font-bold font-mono ${m.pct >= 75 ? "text-green-400" : m.pct >= 50 ? "text-yellow-400" : m.pct >= 25 ? "text-orange-400" : "text-red-400"}`}>
                        {m.pct}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 w-40">
                      <PctBar pct={m.pct} />
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No attendance data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "matrix" && (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  {/* Sticky event column header */}
                  <th
                    className="sticky left-0 z-10 bg-slate-950 border-b border-r border-slate-800"
                    style={{ minWidth: 160, height: 120, verticalAlign: 'bottom', padding: '0 8px 6px' }}
                  >
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Event</span>
                  </th>
                  {/* Slanted member name headers */}
                  {[...memberStats].sort((a, b) => b.pct - a.pct).map(m => (
                    <th
                      key={m.discord_id}
                      className="border-b border-slate-800 p-0"
                      style={{ width: 28, minWidth: 28, height: 120, verticalAlign: 'bottom', position: 'relative' }}
                      title={`${m.name} — ${m.pct}%`}
                    >
                      <div style={{
                        position: 'absolute',
                        bottom: 6,
                        left: '50%',
                        transformOrigin: 'bottom left',
                        transform: 'rotate(-45deg)',
                        whiteSpace: 'nowrap',
                        fontSize: 11,
                        color: m.pct >= 75 ? '#4ade80' : m.pct >= 50 ? '#facc15' : m.pct >= 25 ? '#fb923c' : '#f87171',
                        lineHeight: 1,
                      }}>
                        {m.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedEvents.map(ev => {
                  const dateStr = new Date(`${ev.event_date}T${ev.event_time ?? '00:00'}`).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "2-digit",
                  });
                  return (
                    <tr key={ev.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="sticky left-0 z-10 bg-slate-950 px-3 py-1 border-r border-slate-800 whitespace-nowrap">
                        <div className="text-slate-200 text-xs font-medium truncate max-w-36" title={ev.title}>{ev.title}</div>
                        <div className="text-slate-500 text-[10px]">{dateStr}</div>
                      </td>
                      {[...memberStats].sort((a, b) => b.pct - a.pct).map(m => {
                        const val = m.byEvent[ev.id];
                        let bg = 'transparent';
                        let title = 'Not signed up';
                        if (val === null)  { bg = '#334155'; title = 'Signed up — not marked'; }
                        if (val === true)  { bg = '#22c55e'; title = 'Attended'; }
                        if (val === false) { bg = '#ef4444'; title = 'Did not attend'; }
                        return (
                          <td key={m.discord_id} className="p-0 border-r border-slate-800/20" style={{ width: 28 }}>
                            <div className="flex items-center justify-center" style={{ height: 28 }}>
                              {val !== undefined && (
                                <div
                                  className="rounded-sm"
                                  style={{ width: 14, height: 14, background: bg }}
                                  title={title}
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {closedEvents.length === 0 && (
                  <tr>
                    <td colSpan={memberStats.length + 1} className="px-3 py-8 text-center text-slate-500 text-sm">
                      No closed events with attendance data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-4 text-xs text-slate-400 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-sm bg-green-500" />
              Attended
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-sm bg-red-500" />
              Did not attend
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-sm bg-slate-600" />
              Signed up — not yet marked
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-sm border border-slate-700" />
              Not signed up
            </div>
            <span className="text-slate-600">· Name colour shows attendance rate</span>
          </div>
        </>
      )}
    </div>
  );
}
