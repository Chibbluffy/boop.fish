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
  attended: boolean;
  avatar_url: string | null;
  username: string | null;
  role_name: string | null;
  bdo_class: string | null;
};

type CellData = {
  attended: boolean;
  role_name: string | null;
  bdo_class: string | null;
};

type MemberStats = {
  discord_id: string;
  name: string;
  attended: number;
  total: number;
  pct: number;
  byEvent: Record<string, CellData>;
};

type SortKey = "pct" | "name" | "attended";
type SortDir = "asc" | "desc";
type Tip = { x: number; y: number; content: React.ReactNode } | null;

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

function pctColor(pct: number) {
  return pct >= 75 ? "#4ade80" : pct >= 50 ? "#facc15" : pct >= 25 ? "#fb923c" : "#f87171";
}

function fmtEventDate(dateStr: string, timeStr: string | null) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T${timeStr ?? "00:00"}`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtEventTime(dateStr: string, timeStr: string | null) {
  if (!timeStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T${timeStr}`);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Attendance() {
  const user = useAuth();
  const [events, setEvents]   = useState<AttendanceEvent[]>([]);
  const [signups, setSignups] = useState<AttendanceSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [memberSearch, setMemberSearch] = useState("");
  const [eventSearch, setEventSearch]   = useState("");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [minEvents, setMinEvents]       = useState(0);
  const [sortKey, setSortKey]           = useState<SortKey>("pct");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");

  const [tip, setTip] = useState<Tip>(null);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    fetch("/api/attendance", { headers: authH() })
      .then(r => r.json())
      .then(d => { setEvents(d.events ?? []); setSignups(d.signups ?? []); })
      .catch(() => setError("Failed to load attendance data"))
      .finally(() => setLoading(false));
  }, [user]);

  const closedEvents = useMemo(() => events.filter(e => e.status === "closed"), [events]);

  const memberStats = useMemo<MemberStats[]>(() => {
    const map = new Map<string, MemberStats>();
    const closedIds = new Set(closedEvents.map(e => e.id));
    for (const s of signups) {
      if (!closedIds.has(s.event_id)) continue;
      if (!map.has(s.discord_id)) {
        map.set(s.discord_id, { discord_id: s.discord_id, name: s.username ?? s.discord_name, attended: 0, total: 0, pct: 0, byEvent: {} });
      }
      const m = map.get(s.discord_id)!;
      m.total++;
      if (s.attended) m.attended++;
      m.byEvent[s.event_id] = { attended: s.attended, role_name: s.role_name, bdo_class: s.bdo_class };
    }
    for (const m of map.values()) m.pct = m.total > 0 ? Math.round((m.attended / m.total) * 100) : 0;
    return Array.from(map.values());
  }, [closedEvents, signups]);

  const eventStats = useMemo(() => {
    const map = new Map<string, { attended: number; total: number }>();
    for (const s of signups) {
      if (!map.has(s.event_id)) map.set(s.event_id, { attended: 0, total: 0 });
      const e = map.get(s.event_id)!;
      e.total++;
      if (s.attended) e.attended++;
    }
    return map;
  }, [signups]);

  const filteredEvents = useMemo(() => closedEvents.filter(ev => {
    const dateOnly = String(ev.event_date).slice(0, 10);
    if (eventSearch && !ev.title.toLowerCase().includes(eventSearch.toLowerCase())) return false;
    if (dateFrom && dateOnly < dateFrom) return false;
    if (dateTo   && dateOnly > dateTo)   return false;
    return true;
  }), [closedEvents, eventSearch, dateFrom, dateTo]);

  const filteredMembers = useMemo(() => memberStats
    .filter(m => {
      if (minEvents > 0 && m.total < minEvents) return false;
      if (memberSearch && !m.name.toLowerCase().includes(memberSearch.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const diff =
        sortKey === "name"     ? a.name.localeCompare(b.name) :
        sortKey === "attended" ? a.attended - b.attended :
                                 a.pct - b.pct;
      return sortDir === "desc" ? -diff : diff;
    }),
  [memberStats, memberSearch, minEvents, sortKey, sortDir]);

  function tipProps(content: React.ReactNode) {
    return {
      onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
      onMouseMove:  (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null),
      onMouseLeave: () => setTip(null),
    };
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const hasFilters = memberSearch || eventSearch || dateFrom || dateTo || minEvents > 0;

  if (!user || user.role === "pending") {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">You need to be logged in to view attendance.</div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading attendance…</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center min-h-[60vh] text-red-400">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6" onMouseLeave={() => setTip(null)}>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Attendance</h1>
        <p className="text-slate-400 text-sm mt-1">
          {filteredEvents.length}{filteredEvents.length !== closedEvents.length && ` of ${closedEvents.length}`} events
          {" · "}
          {filteredMembers.length}{filteredMembers.length !== memberStats.length && ` of ${memberStats.length}`} members
        </p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Member</label>
          <input
            value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
            placeholder="Search name…"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Min events</label>
          <input
            type="number" min={0} value={minEvents}
            onChange={e => setMinEvents(parseInt(e.target.value) || 0)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500 w-20"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Sort members by</label>
          <div className="flex gap-1">
            {(["pct", "name", "attended"] as SortKey[]).map(k => (
              <button
                key={k}
                onClick={() => toggleSort(k)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sortKey === k ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {k === "pct" ? "Rate" : k === "attended" ? "Attended" : "Name"}
                {sortKey === k && <span className="ml-1 opacity-70">{sortDir === "desc" ? "↓" : "↑"}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden sm:block w-px h-8 bg-slate-700 self-end" />

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Event</label>
          <input
            value={eventSearch} onChange={e => setEventSearch(e.target.value)}
            placeholder="Search title…"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">From</label>
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">To</label>
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => { setMemberSearch(""); setEventSearch(""); setDateFrom(""); setDateTo(""); setMinEvents(0); }}
            className="self-end px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="border-collapse">
          <thead>
            {/* Name row */}
            <tr>
              <th
                className="sticky left-0 z-10 bg-slate-950 border-b border-r border-slate-800"
                style={{ minWidth: 160, height: 130, verticalAlign: "bottom", padding: "0 10px 28px" }}
              >
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Event</span>
              </th>
              {filteredMembers.map(m => (
                <th
                  key={m.discord_id}
                  className="border-b border-slate-800 p-0 cursor-default"
                  style={{ width: 28, minWidth: 28, height: 130, verticalAlign: "bottom", position: "relative" }}
                  {...tipProps(
                    <div>
                      <p className="font-bold text-white text-sm">{m.name}</p>
                      <p className="text-slate-300 text-xs mt-1">
                        Attended{" "}
                        <span className="font-bold" style={{ color: pctColor(m.pct) }}>{m.attended}</span>
                        {" "}of{" "}
                        <span className="font-bold text-white">{m.total}</span> events
                      </p>
                      <p className="font-bold text-lg mt-0.5" style={{ color: pctColor(m.pct) }}>{m.pct}%</p>
                    </div>
                  )}
                >
                  <div style={{
                    position: "absolute",
                    bottom: 28,
                    left: "50%",
                    transformOrigin: "bottom left",
                    transform: "rotate(-45deg)",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                    color: pctColor(m.pct),
                    lineHeight: 1,
                  }}>
                    {m.name}
                  </div>
                </th>
              ))}
            </tr>

            {/* Rate row */}
            <tr className="border-b border-slate-800">
              <th className="sticky left-0 z-10 bg-slate-950 border-r border-slate-800 px-3 py-1.5 text-left">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Rate</span>
              </th>
              {filteredMembers.map(m => (
                <th
                  key={m.discord_id}
                  className="p-0 border-r border-slate-800/30 cursor-default"
                  style={{ width: 28 }}
                  {...tipProps(
                    <div>
                      <p className="font-bold text-white text-sm">{m.name}</p>
                      <p className="font-bold text-xl mt-0.5" style={{ color: pctColor(m.pct) }}>{m.pct}%</p>
                      <div className="text-slate-400 text-xs mt-1 space-y-0.5">
                        <p><span className="text-green-400 font-semibold">{m.attended}</span> attended</p>
                        <p><span className="text-red-400 font-semibold">{m.total - m.attended}</span> missed</p>
                        <p><span className="text-white font-semibold">{m.total}</span> total signed up</p>
                      </div>
                    </div>
                  )}
                >
                  <div className="flex items-center justify-center py-1.5" style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: pctColor(m.pct),
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {m.pct}%
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredEvents.map(ev => {
              const dateOnly = String(ev.event_date).slice(0, 10);
              const dateLabel = fmtEventDate(ev.event_date, ev.event_time);
              const timeLabel = fmtEventTime(ev.event_date, ev.event_time);
              const stats = eventStats.get(ev.id);
              const evPct = stats && stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : null;

              return (
                <tr key={ev.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                  <td
                    className="sticky left-0 z-10 bg-slate-950 px-3 py-1.5 border-r border-slate-800 whitespace-nowrap cursor-default"
                    {...tipProps(
                      <div>
                        <p className="font-bold text-white text-sm">{ev.title}</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {dateLabel}{timeLabel && <> · {timeLabel}</>}
                          {ev.event_timezone && <> · {ev.event_timezone}</>}
                        </p>
                        {stats && (
                          <div className="mt-2 text-xs space-y-0.5">
                            <p>
                              <span className="text-green-400 font-semibold">{stats.attended}</span>
                              <span className="text-slate-400"> attended</span>
                            </p>
                            <p>
                              <span className="text-red-400 font-semibold">{stats.total - stats.attended}</span>
                              <span className="text-slate-400"> absent</span>
                            </p>
                            <p>
                              <span className="text-white font-semibold">{stats.total}</span>
                              <span className="text-slate-400"> signed up</span>
                            </p>
                            {evPct !== null && (
                              <p className="pt-0.5 font-bold" style={{ color: pctColor(evPct) }}>
                                {evPct}% attendance rate
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  >
                    <div className="text-slate-200 text-xs font-medium truncate max-w-[140px]" title={ev.title}>{ev.title}</div>
                    <div className="text-slate-500 text-[10px]">{new Date(`${dateOnly}T00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}</div>
                  </td>

                  {filteredMembers.map(m => {
                    const cell = m.byEvent[ev.id];
                    const bg = cell
                      ? cell.attended ? "#22c55e" : "#ef4444"
                      : "transparent";

                    const cellTip = cell ? (
                      <div>
                        <p className="font-bold text-white text-sm">{m.name}</p>
                        <p className="text-slate-400 text-xs truncate max-w-48">{ev.title}</p>
                        <p className="mt-1.5 font-semibold text-xs" style={{ color: cell.attended ? "#4ade80" : "#f87171" }}>
                          {cell.attended ? "✓ Attended" : "✕ Absent"}
                        </p>
                        {(cell.role_name || cell.bdo_class) && (
                          <div className="mt-1 text-xs text-slate-400 space-y-0.5">
                            {cell.role_name && <p>Role: <span className="text-slate-200 font-medium">{cell.role_name}</span></p>}
                            {cell.bdo_class && <p>Class: <span className="text-slate-200 font-medium">{cell.bdo_class}</span></p>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-white text-sm">{m.name}</p>
                        <p className="text-slate-400 text-xs truncate max-w-48">{ev.title}</p>
                        <p className="text-slate-500 text-xs mt-1.5">Did not sign up</p>
                      </div>
                    );

                    return (
                      <td
                        key={m.discord_id}
                        className="p-0 border-r border-slate-800/20 cursor-default"
                        style={{ width: 28 }}
                        {...tipProps(cellTip)}
                      >
                        <div className="flex items-center justify-center" style={{ height: 28 }}>
                          {cell && (
                            <div className="rounded-sm transition-opacity" style={{ width: 14, height: 14, background: bg }} />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={filteredMembers.length + 1} className="px-4 py-10 text-center text-slate-500 text-sm">
                  {closedEvents.length === 0
                    ? "No closed events yet — attendance is tracked after events are closed."
                    : "No events match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 text-xs text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-green-500" /> Attended
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-red-500" /> Absent
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm border border-slate-700" /> Did not sign up
        </div>
        <span className="text-slate-700">· Name and rate colours reflect attendance · Hover anything for details</span>
      </div>

      {/* Floating tooltip */}
      {tip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: Math.min(tip.x + 14, window.innerWidth - 220),
            top: tip.y + 14,
          }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-3.5 py-3 text-xs min-w-[120px] max-w-[210px]">
            {tip.content}
          </div>
        </div>
      )}
    </div>
  );
}
