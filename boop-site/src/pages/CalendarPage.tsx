import React, { useEffect, useState } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";
import { TIMEZONES } from "../lib/timezones";

type EventItem = {
  id: string;
  date: string;          // "YYYY-MM-DD"
  title: string;
  description?: string;
  event_time?: string;   // "HH:MM" in event_timezone, optional
  event_timezone?: string; // IANA tz of creator
  discord?: boolean;     // true = sourced from Discord scheduled events
  user_count?: number | null;
  url?: string;          // Discord event link
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function dateStr(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * Convert a wall-clock time in one IANA timezone to a UTC Date.
 * Works by probing the offset and adjusting.
 */
function toUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const probe = new Date(`${dateStr}T${timeStr}:00Z`);
  const inTz = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(probe);
  const [th, tm] = inTz.split(":").map(n => parseInt(n) % 24);
  const diffMs = ((h - th) * 60 + (m - tm)) * 60 * 1000;
  return new Date(probe.getTime() + diffMs);
}

/** Format a UTC Date in a given IANA timezone, e.g. "8:00 PM" */
function fmtTime(utc: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(utc);
}

/** Short timezone label, e.g. "ET" from "Eastern (ET, UTC-5/-4)" */
function tzShort(tz: string | undefined): string {
  if (!tz) return "";
  const entry = TIMEZONES.find(t => t.value === tz);
  const m = entry?.label.match(/\(([^,)]+)/);
  return m ? m[1] : tz;
}

/**
 * Returns the display time string for an event in the viewer's timezone.
 * If viewer has no timezone, falls back to the event's own timezone.
 */
function displayTime(ev: EventItem, viewerTz: string | null): { time: string; tz: string; converted: boolean } | null {
  if (!ev.event_time || !ev.event_timezone) return null;
  const fromTz = ev.event_timezone;
  const toTz   = viewerTz || fromTz;
  try {
    const utc = toUTC(ev.date, ev.event_time, fromTz);
    const time = fmtTime(utc, toTz);
    return { time, tz: tzShort(toTz), converted: toTz !== fromTz };
  } catch {
    return { time: ev.event_time, tz: tzShort(fromTz), converted: false };
  }
}

export default function CalendarPage() {
  const authUser  = useAuth();
  const isOfficer = isOfficerOrAdmin(authUser);
  const viewerTz  = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [events, setEvents] = useState<EventItem[]>([]);
  const now = new Date();
  const [cursor, setCursor]   = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [view, setView]       = useState<"calendar" | "list">("calendar");
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [editing, setEditing]   = useState<EventItem | null>(null);
  const [showPast, setShowPast]         = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [pastPage, setPastPage] = useState(0);
  const [showAllPast, setShowAllPast] = useState(false);
  const PAGE_SIZE = 10;

  // New event form
  const [newDate,  setNewDate]  = useState(now.toISOString().slice(0, 10));
  const [newTitle, setNewTitle] = useState("");
  const [newDesc,  setNewDesc]  = useState("");
  const [newTime,  setNewTime]  = useState("");
  const [newTz,    setNewTz]    = useState(authUser?.timezone ?? "");

  // Edit form state — populated when editing is set
  const [editDate,  setEditDate]  = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc,  setEditDesc]  = useState("");
  const [editTime,  setEditTime]  = useState("");
  const [editTz,    setEditTz]    = useState("");

  // Keep newTz in sync if user logs in mid-session
  useEffect(() => {
    if (authUser?.timezone && !newTz) setNewTz(authUser.timezone);
  }, [authUser?.timezone]);

  useEffect(() => {
    Promise.all([
      fetch("/api/calendar").then(r => r.json()).catch(() => []),
      fetch("/api/discord-events").then(r => r.json()).catch(() => []),
    ]).then(([cal, discord]) => {
      const calEvents: EventItem[] = (cal as any[]).map(e => ({
        id: e.id,
        date: String(e.event_date).slice(0, 10),
        title: e.title,
        description: e.description,
        event_time: e.event_time?.slice(0, 5) ?? undefined,
        event_timezone: e.event_timezone ?? undefined,
      }));
      const discordEvents: EventItem[] = discord as EventItem[];
      // Merge and sort; Discord events that share a date+title with a local event are deduplicated
      const combined = [...calEvents, ...discordEvents].sort((a, b) => a.date.localeCompare(b.date));
      setEvents(combined);
    });
  }, []);

  async function addEvent() {
    if (!newTitle.trim()) return;
    const token = localStorage.getItem("boop_session");
    const body: Record<string, string | undefined> = {
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      event_date: newDate,
    };
    if (newTime) {
      body.event_time     = newTime;
      body.event_timezone = newTz || undefined;
    }
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const ev = await res.json();
    setEvents(prev => [...prev, {
      id: ev.id,
      date: String(ev.event_date).slice(0, 10),
      title: ev.title,
      description: ev.description,
      event_time: ev.event_time?.slice(0, 5) ?? undefined,
      event_timezone: ev.event_timezone ?? undefined,
    }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewTitle(""); setNewDesc(""); setNewTime("");
    setShowAdd(false);
  }

  async function deleteEvent(id: string) {
    const token = localStorage.getItem("boop_session");
    await fetch(`/api/calendar/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setEvents(prev => prev.filter(e => e.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function openEdit(ev: EventItem) {
    setEditDate(ev.date);
    setEditTitle(ev.title);
    setEditDesc(ev.description ?? "");
    setEditTime(ev.event_time ?? "");
    setEditTz(ev.event_timezone ?? "");
    setEditing(ev);
    setSelected(null);
  }

  async function saveEdit() {
    if (!editing || !editTitle.trim()) return;
    const token = localStorage.getItem("boop_session");
    const body: Record<string, string | undefined> = {
      title: editTitle.trim(),
      description: editDesc.trim() || undefined,
      event_date: editDate,
    };
    if (editTime) {
      body.event_time     = editTime;
      body.event_timezone = editTz || undefined;
    }
    const res = await fetch(`/api/calendar/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const ev = await res.json();
    const updated: EventItem = {
      id: ev.id,
      date: String(ev.event_date).slice(0, 10),
      title: ev.title,
      description: ev.description,
      event_time: ev.event_time?.slice(0, 5) ?? undefined,
      event_timezone: ev.event_timezone ?? undefined,
    };
    setEvents(prev => prev.map(e => e.id === updated.id ? updated : e).sort((a, b) => a.date.localeCompare(b.date)));
    setEditing(null);
  }

  function prevMonth() {
    setCursor(c => { const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  }
  function nextMonth() {
    setCursor(c => { const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  }

  const { year, month } = cursor;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate: Record<string, EventItem[]> = {};
  for (const ev of events) (eventsByDate[ev.date] ??= []).push(ev);

  const todayStr    = now.toISOString().slice(0, 10);
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors";

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h2 className="text-4xl font-black tracking-tight text-white">Guild Calendar</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button onClick={() => setView("calendar")}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${view === "calendar" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}>
                📅 Calendar
              </button>
              <button onClick={() => setView("list")}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${view === "list" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}>
                📋 List
              </button>
            </div>
            {isOfficer && (
              <button onClick={() => setShowAdd(true)}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
                + Add Event
              </button>
            )}
          </div>
        </div>

        {/* ── CALENDAR VIEW ── */}
        {view === "calendar" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-xl">‹</button>
              <h3 className="text-xl font-bold text-white">{MONTHS[month]} {year}</h3>
              <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-xl">›</button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-600 uppercase tracking-widest py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />;
                const ds = dateStr(year, month, day);
                const dayEvents = eventsByDate[ds] ?? [];
                const isToday   = ds === todayStr;
                return (
                  <div key={ds}
                    className={`min-h-[80px] p-2 rounded-xl border transition-colors ${
                      isToday ? "border-violet-500/50 bg-violet-950/30" : "border-slate-800/50 bg-slate-900/30 hover:bg-slate-900/60"
                    }`}
                  >
                    <span className={`text-xs font-bold ${isToday ? "text-violet-400" : "text-slate-500"}`}>{day}</span>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {dayEvents.slice(0, 2).map(ev => {
                        const dt = displayTime(ev, viewerTz);
                        return (
                          <button key={ev.id} onClick={() => setSelected(ev)}
                            className={`text-left text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white truncate w-full transition-colors ${ev.discord ? "bg-indigo-600/70 hover:bg-indigo-500" : "bg-violet-600/70 hover:bg-violet-500"}`}
                          >
                            {dt && <span className="opacity-75 mr-1">{dt.time}</span>}{ev.title}
                          </button>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <button onClick={() => setSelected(dayEvents[2])}
                          className="text-[9px] text-slate-500 hover:text-slate-300 text-left pl-1 transition-colors">
                          +{dayEvents.length - 2} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── LIST VIEW ── */}
        {view === "list" && (() => {
          const upcoming = sortedEvents.filter(ev => ev.date >= todayStr);
          const past     = sortedEvents.filter(ev => ev.date < todayStr);

          function EventRow({ ev }: { ev: EventItem }) {
            const d = new Date(ev.date + "T12:00:00Z");
            const isPast = ev.date < todayStr;
            const dt = displayTime(ev, viewerTz);
            return (
              <div className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                isPast
                  ? "border-slate-800/40 bg-slate-900/20 opacity-50"
                  : ev.discord
                    ? "border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/30"
                    : "border-slate-800 bg-slate-900/50 hover:bg-slate-900"
              }`}>
                <div className="shrink-0 w-14 text-center rounded-lg bg-slate-800 py-2 px-1">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${ev.discord ? "text-indigo-400" : "text-violet-400"}`}>
                    {d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                  </p>
                  <p className="text-2xl font-black text-white leading-none">
                    {d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {d.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" })}
                  </p>
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white">{ev.title}</p>
                    {ev.discord && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wide">
                        Discord
                      </span>
                    )}
                    {ev.discord && ev.user_count != null && ev.user_count > 0 && (
                      <span className="text-[10px] text-slate-500">{ev.user_count} interested</span>
                    )}
                  </div>
                  {dt && (
                    <p className={`text-xs mt-0.5 font-semibold ${ev.discord ? "text-indigo-300" : "text-violet-300"}`}>
                      🕐 {dt.time} {dt.tz}
                      {dt.converted && ev.event_timezone && (
                        <span className="text-slate-600 font-normal ml-1.5">
                          (originally {fmtTime(toUTC(ev.date, ev.event_time!, ev.event_timezone), ev.event_timezone)} {tzShort(ev.event_timezone)})
                        </span>
                      )}
                    </p>
                  )}
                  {!dt && <p className="text-xs text-slate-600 mt-0.5">All day</p>}
                  {ev.description && (
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed">{ev.description}</p>
                  )}
                  {ev.discord && ev.url && (
                    <a href={ev.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1 inline-block">
                      View on Discord →
                    </a>
                  )}
                </div>

                {isOfficer && !ev.discord && (
                  <div className="shrink-0 flex items-center gap-1 mt-1">
                    <button onClick={() => openEdit(ev)}
                      className="text-slate-600 hover:text-slate-300 transition-colors px-1 text-xs" title="Edit">✎</button>
                    <button onClick={() => deleteEvent(ev.id)}
                      className="text-slate-700 hover:text-red-400 transition-colors px-1 text-xs" title="Delete">✕</button>
                  </div>
                )}
              </div>
            );
          }

          if (sortedEvents.length === 0) return (
            <div className="text-center py-24 text-slate-600">
              <p className="text-4xl mb-3">📅</p>
              <p className="font-semibold">No events yet</p>
              <p className="text-sm mt-1">Hit "+ Add Event" to get started.</p>
            </div>
          );

          const totalPages = Math.ceil(upcoming.length / PAGE_SIZE);
          const visibleUpcoming = showAllUpcoming
            ? upcoming
            : upcoming.slice(upcomingPage * PAGE_SIZE, (upcomingPage + 1) * PAGE_SIZE);

          return (
            <div className="flex flex-col gap-2">
              {upcoming.length === 0 && (
                <p className="text-center text-slate-600 text-sm py-6">No upcoming events.</p>
              )}

              {visibleUpcoming.map(ev => <EventRow key={ev.id} ev={ev} />)}

              {/* Pagination controls for upcoming */}
              {!showAllUpcoming && totalPages > 1 && (
                <div className="flex items-center justify-between mt-2 px-1">
                  <button
                    onClick={() => setUpcomingPage(p => Math.max(0, p - 1))}
                    disabled={upcomingPage === 0}
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {upcomingPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setUpcomingPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={upcomingPage >= totalPages - 1}
                    className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* Show all / collapse toggle */}
              {upcoming.length > PAGE_SIZE && (
                <button
                  onClick={() => { setShowAllUpcoming(a => !a); setUpcomingPage(0); }}
                  className="text-xs text-slate-600 hover:text-slate-400 transition-colors mx-auto mt-1"
                >
                  {showAllUpcoming ? `▲ Paginate (${PAGE_SIZE}/page)` : `▼ Show all ${upcoming.length} upcoming`}
                </button>
              )}

              {past.length > 0 && (() => {
                const reversedPast = [...past].reverse();
                const pastTotalPages = Math.ceil(reversedPast.length / PAGE_SIZE);
                const visiblePast = showAllPast
                  ? reversedPast
                  : reversedPast.slice(pastPage * PAGE_SIZE, (pastPage + 1) * PAGE_SIZE);

                return (
                  <>
                    <button
                      onClick={() => setShowPast(p => !p)}
                      className="text-xs text-slate-600 hover:text-slate-400 transition-colors mt-2 mx-auto"
                    >
                      {showPast ? "▲ Hide" : "▼ Show"} {past.length} past event{past.length !== 1 ? "s" : ""}
                    </button>

                    {showPast && (
                      <>
                        {visiblePast.map(ev => <EventRow key={ev.id} ev={ev} />)}

                        {!showAllPast && pastTotalPages > 1 && (
                          <div className="flex items-center justify-between mt-2 px-1">
                            <button
                              onClick={() => setPastPage(p => Math.max(0, p - 1))}
                              disabled={pastPage === 0}
                              className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              ← Prev
                            </button>
                            <span className="text-xs text-slate-500">
                              Page {pastPage + 1} of {pastTotalPages}
                            </span>
                            <button
                              onClick={() => setPastPage(p => Math.min(pastTotalPages - 1, p + 1))}
                              disabled={pastPage >= pastTotalPages - 1}
                              className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              Next →
                            </button>
                          </div>
                        )}

                        {reversedPast.length > PAGE_SIZE && (
                          <button
                            onClick={() => { setShowAllPast(a => !a); setPastPage(0); }}
                            className="text-xs text-slate-600 hover:text-slate-400 transition-colors mx-auto mt-1"
                          >
                            {showAllPast ? `▲ Paginate (${PAGE_SIZE}/page)` : `▼ Show all ${reversedPast.length} past`}
                          </button>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {/* ── EVENT DETAIL MODAL ── */}
      {selected && (() => {
        const dt = displayTime(selected, viewerTz);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-violet-400 font-bold uppercase tracking-widest mb-0.5">{selected.date}</p>
                  {dt ? (
                    <p className="text-sm font-semibold text-violet-300 mb-1">
                      🕐 {dt.time} {dt.tz}
                      {dt.converted && selected.event_timezone && (
                        <span className="text-slate-500 font-normal ml-1.5 text-xs">
                          · {fmtTime(toUTC(selected.date, selected.event_time!, selected.event_timezone), selected.event_timezone)} {tzShort(selected.event_timezone)} originally
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600 mb-1">All day</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-black text-white">{selected.title}</h3>
                    {selected.discord && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wide">
                        Discord
                      </span>
                    )}
                  </div>
                  {selected.discord && selected.user_count != null && selected.user_count > 0 && (
                    <p className="text-xs text-slate-500 mt-0.5">{selected.user_count} interested</p>
                  )}
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white transition-colors text-xl leading-none ml-4">✕</button>
              </div>

              {selected.description
                ? <p className="text-slate-300 text-sm leading-relaxed">{selected.description}</p>
                : <p className="text-slate-600 text-sm italic">No description provided.</p>
              }

              {selected.discord && selected.url && (
                <a href={selected.url} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                  View on Discord →
                </a>
              )}

              {isOfficer && !selected.discord && (
                <div className="mt-5 flex items-center gap-4">
                  <button onClick={() => openEdit(selected)}
                    className="text-xs text-slate-400 hover:text-white transition-colors">
                    Edit event
                  </button>
                  <button onClick={() => deleteEvent(selected.id)}
                    className="text-xs text-red-500/70 hover:text-red-400 transition-colors">
                    Delete this event
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── EDIT EVENT MODAL ── */}
      {isOfficer && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white mb-5">Edit Event</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Date</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inp} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                    Time <span className="normal-case text-slate-600 font-normal">(optional)</span>
                  </label>
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Timezone</label>
                  <select value={editTz} onChange={e => setEditTz(e.target.value)} disabled={!editTime} className={`${inp} disabled:opacity-30`}>
                    <option value="">— select —</option>
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {editTime && !editTz && (
                <p className="text-xs text-amber-400/80 -mt-2">Select a timezone so members can see the correct time.</p>
              )}

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Title</label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveEdit()}
                  placeholder="Event name" className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                  Description <span className="normal-case text-slate-600 font-normal">(optional)</span>
                </label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  placeholder="Details, links, notes..." rows={3}
                  className={`${inp} resize-none`} />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={saveEdit} disabled={!editTitle.trim()}
                className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors">
                Save Changes
              </button>
              <button onClick={() => setEditing(null)}
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD EVENT MODAL ── */}
      {isOfficer && showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white mb-5">New Event</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Date</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={inp} />
              </div>

              {/* Time row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                    Time <span className="normal-case text-slate-600 font-normal">(optional)</span>
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className={inp}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Timezone</label>
                  <select
                    value={newTz}
                    onChange={e => setNewTz(e.target.value)}
                    disabled={!newTime}
                    className={`${inp} disabled:opacity-30`}
                  >
                    <option value="">— select —</option>
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {newTime && !newTz && (
                <p className="text-xs text-amber-400/80 -mt-2">Select a timezone so members can see the correct time.</p>
              )}

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Title</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addEvent()}
                  placeholder="Event name" className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                  Description <span className="normal-case text-slate-600 font-normal">(optional)</span>
                </label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Details, links, notes..." rows={3}
                  className={`${inp} resize-none`} />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={addEvent} disabled={!newTitle.trim()}
                className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors">
                Add Event
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
