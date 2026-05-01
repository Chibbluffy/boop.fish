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

export default function Attendance() {
  const user = useAuth();
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [signups, setSignups] = useState<AttendanceSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const closedEvents = useMemo(() => events.filter(e => e.status === "closed"), [events]);
  const sortedMembers = useMemo(() => [...memberStats].sort((a, b) => b.pct - a.pct), [memberStats]);

  if (!user || user.role === "pending") {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">You need to be logged in to view attendance.</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">Loading attendance...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-[60vh] text-red-400">{error}</div>;
  }

  function pctColor(pct: number) {
    return pct >= 75 ? '#4ade80' : pct >= 50 ? '#facc15' : pct >= 25 ? '#fb923c' : '#f87171';
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Attendance</h1>
        <p className="text-slate-400 text-sm mt-1">
          {closedEvents.length} events · {memberStats.length} members tracked
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 bg-slate-950 border-b border-r border-slate-800"
                style={{ minWidth: 160, height: 120, verticalAlign: 'bottom', padding: '0 8px 6px' }}
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Event</span>
              </th>
              {sortedMembers.map(m => (
                <th
                  key={m.discord_id}
                  className="border-b border-slate-800 p-0"
                  style={{ width: 28, minWidth: 28, height: 120, verticalAlign: 'bottom', position: 'relative' }}
                  title={`${m.name} — ${m.pct}%`}
                >
                  <div style={{
                    position: 'absolute',
                    bottom: 22,
                    left: '50%',
                    transformOrigin: 'bottom left',
                    transform: 'rotate(-45deg)',
                    whiteSpace: 'nowrap',
                    fontSize: 11,
                    color: pctColor(m.pct),
                    lineHeight: 1,
                  }}>
                    {m.name}
                  </div>
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-800">
              <th className="sticky left-0 z-10 bg-slate-950 border-r border-slate-800 px-2 py-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Rate</span>
              </th>
              {sortedMembers.map(m => (
                <th key={m.discord_id} className="p-0 border-r border-slate-800/20" style={{ width: 28 }}>
                  <div
                    className="flex items-center justify-center py-1"
                    style={{ fontSize: 9, fontWeight: 700, color: pctColor(m.pct), fontVariantNumeric: 'tabular-nums' }}
                  >
                    {m.pct}%
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
                  {sortedMembers.map(m => {
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
                            <div className="rounded-sm" style={{ width: 14, height: 14, background: bg }} title={title} />
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
                <td colSpan={sortedMembers.length + 1} className="px-3 py-8 text-center text-slate-500 text-sm">
                  No closed events with attendance data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
          <div className="w-3.5 h-3.5 rounded-sm border border-slate-700" />
          Not signed up
        </div>
        <span className="text-slate-600">· Name colour shows attendance rate</span>
      </div>
    </div>
  );
}
