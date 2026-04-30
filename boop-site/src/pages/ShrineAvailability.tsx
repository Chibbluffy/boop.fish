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
  let hour = parseInt(parts.find(p => p.type === "hour")!.value, 10) % 24;
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
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  return `${h}${i < 12 ? "am" : "pm"}`;
});

// ── Component ─────────────────────────────────────────────────────────────────
export default function ShrineAvailability() {
  const user = useAuth();

  const tz = useMemo(
    () => user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [user?.timezone],
  );
  const { utcToLocal, localToUtc } = useMemo(() => buildMaps(tz), [tz]);

  const [mySlots, setMySlots]       = useState<Set<number>>(new Set());
  const [otherCounts, setOtherCounts] = useState<Record<number, number>>({});
  const [otherNames, setOtherNames]  = useState<Record<number, string[]>>({});
  const [saving, setSaving]         = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef      = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" });

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || user.role === "pending") return;
    apiFetch("/api/shrine/availability")
      .then(r => r.json())
      .then(({ mine, counts, names }: { mine: number[]; counts: Record<number, number>; names: Record<number, string[]> }) => {
        setMySlots(new Set(mine));
        setOtherCounts(counts);
        setOtherNames(names);
      })
      .catch(() => {});
  }, [user?.id]);

  // ── Auto-save ────────────────────────────────────────────────────────────────
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

  // ── Local grid ───────────────────────────────────────────────────────────────
  // localGrid[day * 24 + hour] = { mine, count, names }
  const localGrid = useMemo(() => {
    const grid = Array.from({ length: 168 }, () => ({
      mine: false, count: 0, names: [] as string[],
    }));
    for (const utcSlot of mySlots) {
      const loc = utcToLocal[utcSlot];
      if (loc) grid[loc.day * 24 + loc.hour].mine = true;
    }
    for (const [slotStr, count] of Object.entries(otherCounts)) {
      const loc = utcToLocal[parseInt(slotStr, 10)];
      if (loc) {
        const cell = grid[loc.day * 24 + loc.hour];
        cell.count = count;
        cell.names = otherNames[parseInt(slotStr, 10)] ?? [];
      }
    }
    return grid;
  }, [mySlots, otherCounts, otherNames, utcToLocal]);

  // ── Drag / toggle ─────────────────────────────────────────────────────────
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

  // Touch drag — use elementFromPoint since touchmove fires on originating element
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
    if (d !== null && d !== undefined && h !== null && h !== undefined)
      toggleCell(parseInt(d, 10), parseInt(h, 10), dragRef.current.mode);
  }

  function onTouchEnd() { dragRef.current.active = false; }

  // ── Cell styling ─────────────────────────────────────────────────────────
  function cellBg(mine: boolean, count: number): string {
    if (mine && count > 0) return "bg-violet-500 ring-1 ring-inset ring-teal-400/50";
    if (mine)    return "bg-violet-700 hover:bg-violet-600";
    if (count >= 5) return "bg-teal-500/80";
    if (count === 4) return "bg-teal-500/65";
    if (count === 3) return "bg-teal-500/50";
    if (count === 2) return "bg-teal-500/35";
    if (count === 1) return "bg-teal-500/20";
    return "bg-slate-800/60 hover:bg-slate-700/50";
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-10">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h1 className="text-2xl font-black text-white">Black Shrine Availabilities</h1>
            {saving && (
              <span className="text-xs text-slate-500 animate-pulse">Saving…</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Click or drag to mark when you're free each week.
            {user.timezone
              ? <> Times shown in your timezone: <span className="text-slate-400">{user.timezone}</span>.</>
              : " Times shown in your browser's local timezone."}
          </p>
        </div>

        {/* Timezone warning */}
        {!user.timezone && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 leading-relaxed">
            No timezone set — overlaps with other members may not align correctly.
            Set your timezone under your profile in the nav.
          </div>
        )}

        {/* Legend + hint */}
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-5 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-violet-700 inline-block" />
              Your availability
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-teal-500/50 inline-block" />
              Others available (brighter = more)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-violet-500 ring-1 ring-inset ring-teal-400/50 inline-block" />
              Overlap
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Hover a teal cell to see who's available · Changes save automatically
          </p>
        </div>

        {/* Grid */}
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
                <div key={d} className="text-center text-[11px] font-bold text-slate-400 pb-1 tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Hour rows */}
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="grid gap-x-0.5 mb-0.5"
                style={{ gridTemplateColumns: "3rem repeat(7, 1fr)" }}
              >
                <div className="flex items-center justify-end pr-2 text-[10px] text-slate-600 leading-none">
                  {HOUR_LABELS[hour]}
                </div>
                {[0, 1, 2, 3, 4, 5, 6].map(day => {
                  const { mine, count, names } = localGrid[day * 24 + hour];
                  return (
                    <div
                      key={day}
                      data-day={day}
                      data-hour={hour}
                      title={names.length > 0 ? `${names.join(", ")}` : undefined}
                      className={`h-7 rounded-sm cursor-pointer transition-colors ${cellBg(mine, count)}`}
                      onMouseDown={e => onCellMouseDown(day, hour, e)}
                      onMouseEnter={() => onCellMouseEnter(day, hour)}
                      onTouchStart={e => onTouchStart(day, hour, e)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>


      </div>
    </div>
  );
}
