import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, apiFetch } from "../lib/auth";

// ── Timezone helpers ──────────────────────────────────────────────────────────
// Anchor: 2024-01-01T00:00:00Z is a Monday → slot 0 = Mon 00:00 UTC
const ANCHOR_MS = Date.UTC(2024, 0, 1);

function utcSlotToDate(slot: number): Date {
  return new Date(ANCHOR_MS + slot * 3_600_000);
}

function utcSlotToLocal(slot: number, tz: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(utcSlotToDate(slot));
  const wdStr = parts.find(p => p.type === "weekday")!.value;
  const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let day = WDAYS.indexOf(wdStr) - 1; // Mon=0 … Sat=5, Sun → -1 → 6
  if (day < 0) day = 6;
  const hour = parseInt(parts.find(p => p.type === "hour")!.value, 10) % 24;
  return { day, hour };
}

function buildMaps(tz: string) {
  const utcToLocal: Array<{ day: number; hour: number }> = [];
  const localToUtc: Record<string, number> = {};
  for (let s = 0; s < 168; s++) {
    const loc = utcSlotToLocal(s, tz);
    utcToLocal[s] = loc;
    const k = `${loc.day}-${loc.hour}`;
    if (!(k in localToUtc)) localToUtc[k] = s;
  }
  return { utcToLocal, localToUtc };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DAY_LABELS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  return `${h}${i < 12 ? "am" : "pm"}`;
});

type Member = { id: string; display_name: string; slots: Set<number> };

// ── Grid component (shared between tabs) ──────────────────────────────────────
function AvailGrid({
  rows,
  onMouseDown,
  onMouseEnter,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  interactive = false,
  singleMember = false,
}: {
  rows: Array<{ mine: boolean; count: number; names: string[] }>;
  onMouseDown?: (day: number, hour: number, e: React.MouseEvent) => void;
  onMouseEnter?: (day: number, hour: number) => void;
  onTouchStart?: (day: number, hour: number, e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
  interactive?: boolean;
  singleMember?: boolean;
}) {
  function cellBg(mine: boolean, count: number): string {
    if (singleMember) {
      return count > 0 ? "bg-teal-400" : "bg-slate-800/60";
    }
    if (mine && count > 0) return "bg-violet-500 ring-1 ring-inset ring-teal-400/50";
    if (mine)       return `bg-violet-700${interactive ? " hover:bg-violet-600" : ""}`;
    if (count >= 5) return "bg-teal-500/80";
    if (count === 4) return "bg-teal-500/65";
    if (count === 3) return "bg-teal-500/50";
    if (count === 2) return "bg-teal-500/35";
    if (count === 1) return "bg-teal-500/20";
    return `bg-slate-800/60${interactive ? " hover:bg-slate-700/50" : ""}`;
  }

  return (
    <div
      className="select-none overflow-x-auto"
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div style={{ minWidth: 420 }}>
        {/* Day header */}
        <div className="grid gap-x-0.5 mb-1" style={{ gridTemplateColumns: "3rem repeat(7, 1fr)" }}>
          <div />
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-[11px] font-bold text-slate-200 pb-1 tracking-wide">{d}</div>
          ))}
        </div>
        {/* Hour rows */}
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="grid gap-x-0.5 mb-0.5" style={{ gridTemplateColumns: "3rem repeat(7, 1fr)" }}>
            <div className="flex items-center justify-end pr-2 text-[10px] text-slate-400 leading-none">
              {HOUR_LABELS[hour]}
            </div>
            {[0, 1, 2, 3, 4, 5, 6].map(day => {
              const { mine, count, names } = rows[day * 24 + hour];
              const tooltip = names.length > 0 ? names.join(", ") : undefined;
              return (
                <div
                  key={day}
                  data-day={day}
                  data-hour={hour}
                  title={tooltip}
                  className={`h-7 rounded-sm transition-colors ${interactive ? "cursor-pointer" : ""} ${cellBg(mine, count)}`}
                  onMouseDown={onMouseDown ? e => onMouseDown(day, hour, e) : undefined}
                  onMouseEnter={onMouseEnter ? () => onMouseEnter(day, hour) : undefined}
                  onTouchStart={onTouchStart ? e => onTouchStart(day, hour, e) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ShrineAvailability() {
  const user = useAuth();

  const tz = useMemo(
    () => user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [user?.timezone],
  );
  const { utcToLocal, localToUtc } = useMemo(() => buildMaps(tz), [tz]);

  const [mySlots, setMySlots]   = useState<Set<number>>(new Set());
  const [members, setMembers]   = useState<Member[]>([]);
  const [enabled, setEnabled]   = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);
  const [tab, setTab]           = useState<"schedule" | "member">("schedule");
  const [selectedId, setSelectedId] = useState<string>("");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef      = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" });

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || user.role === "pending") return;
    apiFetch("/api/shrine/availability")
      .then(r => r.json())
      .then(({ mine, members: raw }: { mine: number[]; members: { id: string; display_name: string; slots: number[] }[] }) => {
        setMySlots(new Set(mine));
        const parsed: Member[] = raw.map(m => ({ ...m, slots: new Set(m.slots) }));
        setMembers(parsed);
        setEnabled(new Set(parsed.map(m => m.id)));
      })
      .catch(() => {});
  }, [user?.id]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((slots: Set<number>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      await apiFetch("/api/shrine/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: [...slots] }),
      }).catch(() => {});
      setSaving(false);
    }, 600);
  }, []);

  // ── Grid data for "My Schedule" tab ────────────────────────────────────────
  const scheduleGrid = useMemo(() => {
    const grid = Array.from({ length: 168 }, () => ({ mine: false, count: 0, names: [] as string[] }));
    for (const utcSlot of mySlots) {
      const loc = utcToLocal[utcSlot];
      if (loc) grid[loc.day * 24 + loc.hour].mine = true;
    }
    for (const member of members) {
      if (!enabled.has(member.id)) continue;
      for (const utcSlot of member.slots) {
        const loc = utcToLocal[utcSlot];
        if (!loc) continue;
        const cell = grid[loc.day * 24 + loc.hour];
        cell.count++;
        cell.names.push(member.display_name);
      }
    }
    return grid;
  }, [mySlots, members, enabled, utcToLocal]);

  // ── Grid data for "Member View" tab ────────────────────────────────────────
  // Shows selected member's slots (teal) overlaid with your own slots (violet)
  const memberGrid = useMemo(() => {
    const member = members.find(m => m.id === selectedId);
    const grid = Array.from({ length: 168 }, () => ({ mine: false, count: 0, names: [] as string[] }));
    if (!member) return grid;
    for (const utcSlot of member.slots) {
      const loc = utcToLocal[utcSlot];
      if (loc) {
        const cell = grid[loc.day * 24 + loc.hour];
        cell.count = 1;
        cell.names = [member.display_name];
      }
    }
    return grid;
  }, [selectedId, members, utcToLocal]);

  // ── Drag interaction ────────────────────────────────────────────────────────
  function toggleCell(day: number, hour: number, mode: "add" | "remove") {
    const utcSlot = localToUtc[`${day}-${hour}`];
    if (utcSlot === undefined) return;
    setMySlots(prev => {
      const next = new Set(prev);
      mode === "add" ? next.add(utcSlot) : next.delete(utcSlot);
      scheduleSave(next);
      return next;
    });
  }

  function onCellMouseDown(day: number, hour: number, e: React.MouseEvent) {
    e.preventDefault();
    const utcSlot = localToUtc[`${day}-${hour}`];
    const isSelected = utcSlot !== undefined && mySlots.has(utcSlot);
    dragRef.current = { active: true, mode: isSelected ? "remove" : "add" };
    toggleCell(day, hour, dragRef.current.mode);
  }

  function onCellMouseEnter(day: number, hour: number) {
    if (!dragRef.current.active) return;
    toggleCell(day, hour, dragRef.current.mode);
  }

  useEffect(() => {
    const onUp = () => { dragRef.current.active = false; };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  function onTouchStart(day: number, hour: number, e: React.TouchEvent) {
    e.preventDefault();
    const utcSlot = localToUtc[`${day}-${hour}`];
    const isSelected = utcSlot !== undefined && mySlots.has(utcSlot);
    dragRef.current = { active: true, mode: isSelected ? "remove" : "add" };
    toggleCell(day, hour, dragRef.current.mode);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragRef.current.active) return;
    e.preventDefault();
    const { clientX, clientY } = e.touches[0];
    const el = document.elementFromPoint(clientX, clientY);
    const d = el?.getAttribute("data-day");
    const h = el?.getAttribute("data-hour");
    if (d != null && h != null) toggleCell(parseInt(d, 10), parseInt(h, 10), dragRef.current.mode);
  }

  function onTouchEnd() { dragRef.current.active = false; }

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-slate-400 mb-3">Members only.</p>
          <a href="#/auth" className="text-violet-400 text-sm hover:underline">Log in</a>
        </div>
      </div>
    );
  }

  const selectedMember = members.find(m => m.id === selectedId);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-10">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h1 className="text-2xl font-black text-white">Black Shrine Availabilities</h1>
            {saving && <span className="text-xs text-slate-400 animate-pulse">Saving…</span>}
          </div>
          <p className="text-sm text-slate-300">
            Mark when you're free each week.
            {user.timezone
              ? <> Times shown in <span className="text-slate-200">{user.timezone}</span>.</>
              : " Times shown in your browser's local timezone."}
          </p>
        </div>

        {/* Timezone warning */}
        {!user.timezone && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 leading-relaxed">
            No timezone set — overlaps with other members may not align correctly.
            Set your timezone in your profile.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
          {(["schedule", "member"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === t ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {t === "schedule" ? "My Schedule" : "Member View"}
            </button>
          ))}
        </div>

        {/* ── My Schedule tab ──────────────────────────────────────────────────── */}
        {tab === "schedule" && (
          <>
            {/* Legend */}
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
              <div className="flex flex-col gap-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-violet-700 shrink-0 inline-block" />
                  <span>Your available time — click or drag to toggle</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Gradient scale: 1→5 members */}
                  <span className="flex gap-px shrink-0">
                    {[20, 35, 50, 65, 80].map(o => (
                      <span key={o} className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: `rgb(20 184 166 / ${o}%)` }} />
                    ))}
                  </span>
                  <span>1 → 5+ other members available at this time (hover to see who)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-violet-500 ring-1 ring-inset ring-teal-400/50 shrink-0 inline-block" />
                  <span>You and at least one other member are both free here</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 self-end">Changes save automatically</p>
            </div>

            <AvailGrid
              rows={scheduleGrid}
              interactive
              onMouseDown={onCellMouseDown}
              onMouseEnter={onCellMouseEnter}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />

            {/* Member toggle list */}
            {members.length > 0 && (
              <div className="mt-10 pt-8 border-t border-slate-800/60">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-bold text-white">
                      Members with schedules
                      <span className="ml-2 text-xs font-normal text-slate-400">({members.length})</span>
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Toggle members to include or exclude them from the heatmap above
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <button
                      onClick={() => setEnabled(new Set(members.map(m => m.id)))}
                      className="text-slate-300 hover:text-white transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setEnabled(new Set())}
                      className="text-slate-300 hover:text-white transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {members.map(m => {
                    const on = enabled.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors select-none ${
                          on
                            ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
                            : "border-slate-700 bg-slate-900/40 text-slate-400 line-through"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={e => setEnabled(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(m.id) : next.delete(m.id);
                            return next;
                          })}
                        />
                        {on && <span className="text-teal-500 text-[10px]">✓</span>}
                        {m.display_name}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Member View tab ──────────────────────────────────────────────────── */}
        {tab === "member" && (
          <>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-widest mb-2">
                Select a member
              </label>
              {members.length === 0 ? (
                <p className="text-slate-300 text-sm">No other members have set their availability yet.</p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 w-full max-w-xs"
                >
                  <option value="">— choose a member —</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              )}
            </div>

            {selectedMember && (
              <>
                <div className="mb-5 flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-3 h-3 rounded-sm bg-teal-500/60 shrink-0 inline-block" />
                  <span>{selectedMember.display_name}'s available times — shown in your timezone</span>
                </div>
                <AvailGrid rows={memberGrid} singleMember />
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
