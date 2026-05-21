import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth, apiFetch, isOfficerOrAdmin } from "../lib/auth";
import { BDO_CLASSES } from "../lib/bdo-classes";
import { TIMEZONES } from "../lib/timezones";

// ── Types ─────────────────────────────────────────────────────────────────────
type SignupStatus = "accepted" | "bench" | "tentative" | "absent" | "declined";

type ClassMode = "bdo" | "custom" | "none";

interface EventRole {
  id: string;
  name: string;
  emoji: string | null;
  soft_cap: number | null;
  display_order: number;
  class_mode: ClassMode;
  choices: string[];  // class names from class_emojis (used when class_mode = 'custom')
}

interface EventSignup {
  id: string;
  discord_id: string;
  discord_name: string;
  role_id: string | null;
  role_name: string | null;
  bdo_class: string | null;
  signup_order: number;
  status: SignupStatus;
  attended: boolean | null;
  attended_role: string | null;
  attended_class: string | null;
  gear_ap:  number | null;
  gear_aap: number | null;
  gear_dp:  number | null;
}

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  event_timezone: string | null;
  total_cap: number | null;
  ping_role_ids: string[];
  enable_ping: boolean;
  enable_reminder_ping: boolean;
  reminder_minutes: number[];
  status: "draft" | "active" | "closed";
  channel_id: string | null;
  message_id: string | null;
  created_by_name: string | null;
  accepted_count: number;
  bench_count: number;
  tentative_count: number;
  absent_count: number;
  declined_count: number;
}

interface EventDetail extends EventItem {
  roles: EventRole[];
  signups: EventSignup[];
}

interface RoleFormEntry {
  name: string;
  emoji: string;
  soft_cap: string;
  class_mode: ClassMode;
  choices: string[];  // class names selected for this role (class_mode = 'custom')
}

interface EventTemplate {
  id: string;
  name: string;
  description: string | null;
  total_cap: number | null;
  ping_role_ids: string[];
  enable_ping: boolean;
  enable_reminder_ping: boolean;
  reminder_minutes: number[];
  channel_id: string | null;
  event_time: string | null;
  event_timezone: string | null;
  roles: Array<{ name: string; emoji: string | null; soft_cap: number | null }>;
}

interface Channel { id: string; name: string; }
interface GuildEmoji { id: string; name: string; animated: boolean; }
interface DiscordRole { id: string; name: string; color: number; }

function emojiUrl(e: GuildEmoji) {
  return `/api/discord/emoji-image/${e.id}${e.animated ? "?animated=1" : ""}`;
}
function emojiStr(e: GuildEmoji) {
  return `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
}

function EmojiSelect({ value, emojis, onChange }: {
  value: string;
  emojis: GuildEmoji[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const curId   = value.match(/:(\d+)>/)?.[1] ?? "";
  const cur     = emojis.find(e => e.id === curId);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? emojis.filter(e => e.name.toLowerCase().includes(q)) : emojis;
  }, [emojis, search]);

  // Fallback to text input when no guild emojis are loaded
  if (emojis.length === 0) {
    return (
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="<:name:id>"
        className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:border-violet-500" />
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Trigger */}
      <button
        type="button"
        title={cur ? cur.name : "Pick emoji"}
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm border transition-colors
          ${open ? "bg-slate-700 border-violet-500" : "bg-slate-800/60 border-slate-700 hover:border-slate-500"}`}
      >
        {cur
          ? <img src={emojiUrl(cur)} alt={cur.name} className="w-5 h-5 object-contain" />
          : <span className="text-slate-500 text-xs px-0.5">emoji</span>
        }
        <span className="text-slate-500 text-[10px]">▾</span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-violet-500"
            />
            {cur && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                className="text-[10px] px-2 py-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
            {filtered.map(e => (
              <button
                key={e.id}
                type="button"
                title={e.name}
                onClick={() => { onChange(emojiStr(e)); setOpen(false); setSearch(""); }}
                className={`p-1 rounded-lg transition-colors ${
                  e.id === curId
                    ? "bg-violet-700/50 ring-1 ring-violet-500"
                    : "hover:bg-slate-700"
                }`}
              >
                <img src={emojiUrl(e)} alt={e.name} className="w-6 h-6 object-contain" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-8 text-[11px] text-slate-500 text-center py-4">No emojis found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Class picker (multi-select from class_emojis + BDO list) ─────────────────
function ClassPicker({ selected, classEmojiMap, guildEmojis, onChange }: {
  selected: string[];
  classEmojiMap: Record<string, string>;
  guildEmojis: GuildEmoji[];
  onChange: (names: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  // Full selectable list: all BDO classes + any custom entries in class_emojis
  const allClasses = useMemo(() => {
    const bdoSet = new Set(BDO_CLASSES as unknown as string[]);
    const custom = Object.keys(classEmojiMap).filter(n => !bdoSet.has(n)).sort();
    return [...(BDO_CLASSES as unknown as string[]), ...custom];
  }, [classEmojiMap]);

  const filtered = search.trim()
    ? allClasses.filter(n => n.toLowerCase().includes(search.trim().toLowerCase()))
    : allClasses;

  function emojiForName(name: string): GuildEmoji | null {
    const val = classEmojiMap[name];
    if (!val) return null;
    const id = val.match(/:(\d+)>/)?.[1];
    return id ? (guildEmojis.find(e => e.id === id) ?? null) : null;
  }

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter(n => n !== name) : [...selected, name]);
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search classes…"
          className="bg-slate-800/60 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs w-48 focus:outline-none focus:border-violet-500"
        />
        {selected.length > 0 && (
          <span className="text-[10px] text-violet-400 font-semibold">{selected.length} selected</span>
        )}
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-7 gap-1 max-h-48 overflow-y-auto pr-0.5">
        {filtered.map(name => {
          const sel   = selected.includes(name);
          const emoji = emojiForName(name);
          return (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => toggle(name)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[10px] leading-tight transition-colors border ${
                sel
                  ? "bg-violet-600/30 border-violet-500 text-white"
                  : "bg-slate-800/50 border-transparent hover:border-slate-600 text-slate-400 hover:text-slate-200"
              }`}
            >
              {emoji
                ? <img src={emojiUrl(emoji)} alt={name} className="w-6 h-6 object-contain" />
                : <span className="w-6 h-6 flex items-center justify-center text-slate-600 text-base">?</span>
              }
              <span className="truncate w-full text-center">{name}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-7 text-[11px] text-slate-500 text-center py-3">No classes found</p>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  // Slice to YYYY-MM-DD in case the DB returns a full ISO timestamp
  return new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const STATUS_BADGE: Record<string, string> = {
  draft:  "bg-slate-700/60 text-slate-400 border border-slate-600",
  active: "bg-violet-500/20 text-violet-300 border border-violet-500/40",
  closed: "bg-slate-800/60 text-slate-500 border border-slate-700",
};

const inp = "bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 w-full";

function blankRole(): RoleFormEntry {
  return { name: "", emoji: "", soft_cap: "", class_mode: "bdo", choices: [] };
}

// ── Blank form ────────────────────────────────────────────────────────────────
function blankForm() {
  return {
    title: "", description: "", event_date: "", event_time: "",
    event_timezone: "America/New_York",
    total_cap: "", channel_id: "",
    enable_ping: true, ping_role_ids: [] as string[],
    enable_reminder_ping: true,
    reminder_minutes: [60, 30] as number[],
    roles: [] as RoleFormEntry[],
  };
}

// ── Event Form ────────────────────────────────────────────────────────────────
function EventForm({
  initial, templates, channels, guildEmojis, discordRoles, classEmojiMap, onSave, onPublish, onCancel,
}: {
  initial?: EventDetail | EventItem;
  templates: EventTemplate[];
  channels: Channel[];
  guildEmojis: GuildEmoji[];
  discordRoles: DiscordRole[];
  classEmojiMap: Record<string, string>;
  onSave: (data: ReturnType<typeof blankForm>, publish: boolean) => Promise<void>;
  onPublish?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => {
    if (initial) {
      const existingRoles = "roles" in initial && Array.isArray(initial.roles)
        ? initial.roles.map(r => ({
            name: r.name,
            emoji: r.emoji ?? "",
            soft_cap: r.soft_cap ? String(r.soft_cap) : "",
            class_mode: (r.class_mode ?? "bdo") as ClassMode,
            choices: Array.isArray(r.choices) ? r.choices.map((c: any) => typeof c === "string" ? c : (c.label ?? "")).filter(Boolean) : [],
          }))
        : [] as RoleFormEntry[];
      return {
        title: initial.title, description: initial.description ?? "",
        event_date: String(initial.event_date).slice(0, 10),
        event_time: String(initial.event_time).slice(0, 5),
        event_timezone: initial.event_timezone ?? "America/New_York",
        total_cap: initial.total_cap != null ? String(initial.total_cap) : "", channel_id: initial.channel_id ?? "",
        enable_ping: (initial as EventItem).enable_ping ?? true,
        ping_role_ids: (initial as EventItem).ping_role_ids ?? [],
        enable_reminder_ping: (initial as EventItem).enable_reminder_ping ?? true,
        reminder_minutes: (initial as EventItem).reminder_minutes ?? [60, 30],
        roles: existingRoles,
      };
    }
    return blankForm();
  });
  const [saving, setSaving] = useState(false);

  const canSave    = !!form.title.trim() && !!form.event_date && !!form.event_time;
  const canPublish = canSave && !!form.channel_id;

  function loadTemplate(id: string) {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setForm(f => ({
      ...f,
      title: t.name,
      description: t.description ?? f.description,
      total_cap: t.total_cap != null ? String(t.total_cap) : "",
      channel_id: t.channel_id ?? f.channel_id,
      event_time: t.event_time ?? f.event_time,
      event_timezone: t.event_timezone ?? f.event_timezone,
      enable_ping: t.enable_ping ?? true,
      ping_role_ids: t.ping_role_ids ?? [],
      enable_reminder_ping: t.enable_reminder_ping ?? true,
      reminder_minutes: t.reminder_minutes ?? [60, 30],
      roles: t.roles.map(r => ({
        name: r.name, emoji: r.emoji ?? "", soft_cap: r.soft_cap ? String(r.soft_cap) : "",
        class_mode: (r.class_mode ?? "bdo") as ClassMode,
        choices: Array.isArray(r.choices) ? r.choices.map((c: any) => typeof c === "string" ? c : (c.label ?? "")).filter(Boolean) : [],
      })),
    }));
  }

  function addRole() {
    setForm(f => ({ ...f, roles: [...f.roles, blankRole()] }));
  }
  function removeRole(i: number) {
    setForm(f => ({ ...f, roles: f.roles.filter((_, j) => j !== i) }));
  }
  function updateRole(i: number, key: "name" | "emoji" | "soft_cap" | "class_mode", val: string) {
    setForm(f => ({ ...f, roles: f.roles.map((r, j) => j === i ? { ...r, [key]: val } : r) }));
  }
  function setRoleChoices(ri: number, choices: string[]) {
    setForm(f => ({ ...f, roles: f.roles.map((r, j) => j === ri ? { ...r, choices } : r) }));
  }

  async function submit(publish: boolean) {
    setSaving(true);
    await onSave(form, publish);
    setSaving(false);
  }

  return (
    <div className="max-w-2xl">
      {/* Template loader */}
      {templates.length > 0 && (
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Load Template</label>
          <select className={inp} defaultValue="" onChange={e => { loadTemplate(e.target.value); e.target.value = ""; }}>
            <option value="">— pick a template to pre-fill —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</label>
          <input className={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Node War — 25 Cap" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Description <span className="text-slate-600 normal-case font-normal">(optional)</span></label>
          <textarea className={`${inp} resize-none`} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="SIGN THE FRICK UP BOOPERS" />
        </div>

        {/* Date + Time + Timezone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Date</label>
            <input type="date" className={inp} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Time</label>
            <input type="time" className={inp} value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Timezone</label>
          <select className={inp} value={form.event_timezone} onChange={e => setForm(f => ({ ...f, event_timezone: e.target.value }))}>
            {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </div>

        {/* Cap + Channel */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Cap <span className="normal-case font-normal text-slate-600">(optional)</span></label>
            <input type="number" min="1" placeholder="uncapped" className={inp} value={form.total_cap} onChange={e => setForm(f => ({ ...f, total_cap: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Discord Channel</label>
            {channels.length > 0 ? (
              <select className={inp} value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))}>
                <option value="">— select channel —</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            ) : (
              <input className={inp} value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} placeholder="Channel ID" />
            )}
          </div>
        </div>

        {/* Ping settings */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox" id="ep-enable-ping"
              checked={form.enable_ping}
              onChange={e => setForm(f => ({ ...f, enable_ping: e.target.checked }))}
              className="accent-violet-500"
            />
            <label htmlFor="ep-enable-ping" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
              Ping roles when posted
            </label>
          </div>
          {form.enable_ping && (
            <div className="flex flex-wrap gap-1.5">
              {discordRoles.map(r => {
                const sel = form.ping_role_ids.includes(r.id);
                return (
                  <button key={r.id} type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      ping_role_ids: sel
                        ? f.ping_role_ids.filter(id => id !== r.id)
                        : [...f.ping_role_ids, r.id],
                    }))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      sel ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    @{r.name}
                  </button>
                );
              })}
              {discordRoles.length === 0 && <p className="text-xs text-slate-600">No roles found.</p>}
            </div>
          )}
        </div>

        {/* Reminder ping settings */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox" id="ep-enable-reminder-ping"
              checked={form.enable_reminder_ping}
              onChange={e => setForm(f => ({ ...f, enable_reminder_ping: e.target.checked }))}
              className="accent-violet-500"
            />
            <label htmlFor="ep-enable-reminder-ping" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
              Send reminder pings
            </label>
          </div>
          {form.enable_reminder_ping && (
            <div className="space-y-2 pl-1">
              <div className="flex flex-wrap gap-1.5">
                {[...form.reminder_minutes].sort((a, b) => b - a).map(rm => {
                  const h = Math.floor(rm / 60), m = rm % 60;
                  const lbl = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                  return (
                    <span key={rm} className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 rounded-lg text-xs text-slate-300">
                      {lbl}
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, reminder_minutes: f.reminder_minutes.filter(v => v !== rm) }))}
                        className="text-slate-500 hover:text-red-400 transition-colors leading-none ml-0.5">×</button>
                    </span>
                  );
                })}
                {form.reminder_minutes.length === 0 && (
                  <span className="text-xs text-slate-600 italic">No reminders set</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[5, 15, 30, 60, 120].filter(v => !form.reminder_minutes.includes(v)).map(v => {
                  const h = Math.floor(v / 60), m = v % 60;
                  const lbl = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                  return (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, reminder_minutes: [...f.reminder_minutes, v] }))}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-colors">
                      +{lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Roles */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Roles</label>
            <button onClick={addRole} className="text-xs text-violet-400 hover:text-violet-300 font-semibold">+ Add role</button>
          </div>
          {form.roles.length === 0 && (
            <p className="text-xs text-slate-600 italic">No roles added — members can sign up without a role.</p>
          )}
          <div className="flex flex-col gap-2">
            {form.roles.map((r, i) => (
              <div key={i} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                {/* Role header row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <input className={`${inp} flex-1 min-w-32`} placeholder="Role name (e.g. Offense)" value={r.name} onChange={e => updateRole(i, "name", e.target.value)} />
                  <EmojiSelect value={r.emoji} emojis={guildEmojis} onChange={v => updateRole(i, "emoji", v)} />
                  <input type="number" min="0" className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-20 focus:outline-none focus:border-violet-500" placeholder="Cap" value={r.soft_cap} onChange={e => updateRole(i, "soft_cap", e.target.value)} />
                  {/* Class mode selector */}
                  <select
                    value={r.class_mode}
                    onChange={e => updateRole(i, "class_mode", e.target.value)}
                    className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-violet-500"
                    title="What to ask members to pick when signing up"
                  >
                    <option value="bdo">BDO Classes</option>
                    <option value="custom">Custom choices</option>
                    <option value="none">No selection</option>
                  </select>
                  <button onClick={() => removeRole(i)} className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1 ml-auto">✕</button>
                </div>
                {/* Class picker for custom selection mode */}
                {r.class_mode === "custom" && (
                  <div className="mt-3 pl-3 border-l-2 border-slate-700">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">
                      Available classes <span className="normal-case font-normal">(click to toggle — shown to members when signing up)</span>
                    </p>
                    <ClassPicker
                      selected={r.choices}
                      classEmojiMap={classEmojiMap}
                      guildEmojis={guildEmojis}
                      onChange={choices => setRoleChoices(i, choices)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 flex-wrap">
        <button
          onClick={() => submit(false)}
          disabled={saving || !canSave}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Draft
        </button>
        <button
          onClick={() => submit(true)}
          disabled={saving || !canPublish}
          title={!canPublish ? "Title, date, time, and a Discord channel are required to publish" : undefined}
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {initial?.status === "active" ? "Save & Keep Active" : "Publish to Discord"}
        </button>
        {initial?.status === "active" && onPublish && (
          <button onClick={onPublish} disabled={saving} className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            Re-post Embed
          </button>
        )}
        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-slate-400 hover:text-white text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Renders a string containing Discord emoji syntax like <a:name:id> or <:name:id> as images
function EmojiText({ text }: { text: string }) {
  const regex = /<(a?):([^:>]+):(\d+)>/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(<span key={cursor}>{text.slice(cursor, match.index)}</span>);
    }
    const [, anim, name, id] = match;
    const src = `/api/discord/emoji-image/${id}${anim === "a" ? "?animated=1" : ""}`;
    nodes.push(<img key={match.index} src={src} alt={name} title={name} className="inline w-5 h-5 align-middle" />);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(<span key={cursor}>{text.slice(cursor)}</span>);
  }

  return <>{nodes}</>;
}

// ── Event Detail ──────────────────────────────────────────────────────────────
function EventDetail({
  event, isOfficer, onBack, onRefresh,
}: {
  event: EventDetail;
  isOfficer: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [working, setWorking] = useState<string | null>(null);
  // Use a ref for the drag ID so onDragStart doesn't trigger a re-render (which breaks the drag ghost)
  const draggingRef             = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver]     = useState<string | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", role_id: "", role_name: "", bdo_class: "", status: "accepted" as SignupStatus });
  const [addWorking, setAddWorking] = useState(false);

  const accepted  = event.signups.filter(s => s.status === "accepted");
  const bench     = event.signups.filter(s => s.status === "bench");
  const tentative = event.signups.filter(s => s.status === "tentative");
  const declined  = event.signups.filter(s => s.status === "declined");
  const absent    = event.signups.filter(s => s.status === "absent");

  async function moveSignup(signupId: string, role_id: string | null, role_name: string | null, status: SignupStatus) {
    setWorking(signupId);
    await apiFetch(`/api/events/${event.id}/signups/${signupId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id, role_name, status }),
    }).catch(() => {});
    onRefresh();
    setWorking(null);
  }

  async function removeSignup(id: string) {
    if (!confirm("Remove this signup?")) return;
    setWorking(id);
    await apiFetch(`/api/events/${event.id}/signups/${id}`, { method: "DELETE" }).catch(() => {});
    onRefresh();
    setWorking(null);
  }

  async function addPlayer() {
    if (!addForm.name.trim()) return;
    setAddWorking(true);
    await apiFetch(`/api/events/${event.id}/signups/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addForm.name.trim(),
        role_id: addForm.role_id || null,
        role_name: addForm.role_name || null,
        bdo_class: addForm.bdo_class || null,
        status: addForm.status,
      }),
    }).catch(() => {});
    setAddForm({ name: "", role_id: "", role_name: "", bdo_class: "", status: "accepted" });
    setShowAddPlayer(false);
    setAddWorking(false);
    onRefresh();
  }

  async function toggleStatus(newStatus: "active" | "closed") {
    await apiFetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
    onRefresh();
  }

  function handleDragStart(id: string) {
    draggingRef.current = id;
    // Defer the state update so the drag ghost renders before the re-render
    setTimeout(() => setIsDragging(true), 0);
  }

  function handleDragEnd() {
    draggingRef.current = null;
    setIsDragging(false);
    setDragOver(null);
  }

  function handleDrop(role_id: string | null, role_name: string | null, status: SignupStatus) {
    const id = draggingRef.current;
    draggingRef.current = null;
    setIsDragging(false);
    setDragOver(null);
    if (!id) return;
    const s = event.signups.find(x => x.id === id);
    if (!s) return;
    if (s.status === status && s.role_id === role_id) return;
    moveSignup(id, role_id, role_name, status);
  }

  function bucketDropProps(bucketKey: string, role_id: string | null, role_name: string | null, status: SignupStatus, preserveRole = false) {
    if (!isOfficer) return {};
    return {
      onDragOver:  (e: React.DragEvent) => { e.preventDefault(); setDragOver(bucketKey); },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (preserveRole) {
          const id = draggingRef.current;
          const s = id ? event.signups.find(x => x.id === id) : null;
          handleDrop(s?.role_id ?? null, s?.role_name ?? null, status);
        } else {
          handleDrop(role_id, role_name, status);
        }
      },
    };
  }

  function SignupRow({ s }: { s: EventSignup }) {
    const busy        = working === s.id;
    const thisRowDrag = draggingRef.current === s.id && isDragging;
    const hasGear     = s.gear_ap != null || s.gear_aap != null || s.gear_dp != null;
    return (
      <div
        draggable={isOfficer}
        onDragStart={() => handleDragStart(s.id)}
        onDragEnd={handleDragEnd}
        className={`flex items-start gap-1.5 py-1.5 px-2 rounded-lg group
          ${busy || thisRowDrag ? "opacity-40" : ""}
          ${isOfficer ? "cursor-grab hover:bg-slate-800/40" : ""}`}
      >
        {isOfficer && <span className="text-slate-700 text-[10px] mt-0.5 shrink-0 pointer-events-none select-none">⠿</span>}
        <span className="text-slate-600 text-[10px] w-4 text-right shrink-0 mt-0.5 select-none">{s.signup_order}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-xs truncate select-none leading-snug">{s.discord_name}</p>
          <div className="flex flex-wrap gap-x-1.5 items-center">
            {s.bdo_class && <span className="text-[10px] text-slate-400 select-none">{s.bdo_class}</span>}
            {hasGear && <span className="text-[10px] text-teal-600 tabular-nums select-none">{s.gear_ap ?? "—"}/{s.gear_aap ?? "—"}/{s.gear_dp ?? "—"}</span>}
          </div>
        </div>
        {isOfficer && (
          <button
            draggable={false}
            onClick={e => { e.stopPropagation(); removeSignup(s.id); }}
            className="shrink-0 text-[10px] text-red-500/40 hover:text-red-400 transition-colors mt-0.5 opacity-0 group-hover:opacity-100"
          >✕</button>
        )}
      </div>
    );
  }

  // Group accepted signups by role
  const grouped = event.roles.map(role => ({
    role,
    signups: accepted.filter(s => s.role_id === role.id),
  }));
  const noRole = accepted.filter(s => !s.role_id || !event.roles.find(r => r.id === s.role_id));

  function BucketHeader({ emoji, name, count, cap }: { emoji?: string | null; name: string; count: number; cap?: number | null }) {
    return (
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
        {emoji && <EmojiText text={emoji} />}
        {name}
        <span className="font-normal text-slate-600">
          ({count}{cap ? `/${cap}` : ""})
        </span>
      </p>
    );
  }

  return (
    <div>
      {/* Back + header */}
      <button onClick={onBack} className="text-slate-500 hover:text-white text-sm mb-4 transition-colors">← Back to signups</button>
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="text-xl font-black text-white">{event.title}</h2>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[event.status]}`}>
              {event.status}
            </span>
          </div>
          <p className="text-slate-300 text-sm">{fmtDate(event.event_date)} · {fmtTime(event.event_time)}</p>
          {event.description && <p className="text-slate-400 text-sm mt-1">{event.description}</p>}
          <p className="text-slate-400 text-sm mt-1">
            {event.accepted_count}{event.total_cap != null ? `/${event.total_cap}` : ""} accepted
            {event.bench_count > 0 && <> · {event.bench_count} bench</>}
            {event.tentative_count > 0 && <> · {event.tentative_count} tentative</>}
            {event.declined_count > 0 && <> · {event.declined_count} declined</>}
            {event.absent_count > 0 && <> · {event.absent_count} absent</>}
          </p>
        </div>
        {isOfficer && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setShowAddPlayer(v => !v); setAddForm({ name: "", role_id: "", role_name: "", bdo_class: "", status: "accepted" }); }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold">
              + Add Player
            </button>
            {event.status === "active" && (
              <button onClick={() => toggleStatus("closed")} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold">
                Close Signups
              </button>
            )}
            {event.status === "closed" && (
              <button onClick={() => toggleStatus("active")} className="px-3 py-1.5 rounded-lg bg-violet-800 hover:bg-violet-700 text-white text-xs font-semibold">
                Reopen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Player form */}
      {isOfficer && showAddPlayer && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-4 mb-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Add Player (Mercenary / Write-in)</p>
          <div className="flex flex-wrap gap-2">
            <input
              className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 flex-1 min-w-36"
              placeholder="Name (required)"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addPlayer()}
            />
            <select
              className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
              value={addForm.role_id}
              onChange={e => {
                const r = event.roles.find(r => r.id === e.target.value);
                setAddForm(f => ({ ...f, role_id: e.target.value, role_name: r?.name ?? "" }));
              }}
            >
              <option value="">No role</option>
              {event.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select
              className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
              value={addForm.bdo_class}
              onChange={e => setAddForm(f => ({ ...f, bdo_class: e.target.value }))}
            >
              <option value="">Class (optional)</option>
              {BDO_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
              value={addForm.status}
              onChange={e => setAddForm(f => ({ ...f, status: e.target.value as SignupStatus }))}
            >
              <option value="accepted">Accepted</option>
              <option value="bench">Bench</option>
              <option value="tentative">Tentative</option>
              <option value="absent">Absent</option>
              <option value="declined">Declined</option>
            </select>
            <button
              onClick={addPlayer}
              disabled={!addForm.name.trim() || addWorking}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              {addWorking ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => setShowAddPlayer(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Signups */}
      <div className="flex flex-col gap-3">
          {/* Role buckets — responsive grid */}
          {(grouped.length > 0 || noRole.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {grouped.map(({ role, signups: rs }) => {
                const key  = `role:${role.id}`;
                const over = dragOver === key;
                return (
                  <div
                    key={role.id}
                    {...bucketDropProps(key, role.id, role.name, "accepted")}
                    className={`rounded-xl p-3 border transition-colors min-h-[80px] ${over
                      ? "bg-violet-900/30 border-violet-500"
                      : "bg-slate-900/40 border-slate-800"}`}
                  >
                    <BucketHeader emoji={role.emoji} name={role.name} count={rs.length} cap={role.soft_cap} />
                    {rs.length === 0
                      ? <p className={`text-[10px] italic ${over ? "text-violet-400" : "text-slate-700"}`}>
                          {over ? "Drop here" : "Empty"}
                        </p>
                      : rs.map(s => <SignupRow key={s.id} s={s} />)}
                  </div>
                );
              })}
              {noRole.length > 0 && (
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 min-h-[80px]">
                  <BucketHeader name="No role" count={noRole.length} />
                  {noRole.map(s => <SignupRow key={s.id} s={s} />)}
                </div>
              )}
            </div>
          )}

          {/* Bench — grouped by the role they wanted */}
          {(isOfficer || bench.length > 0) && (() => {
            const over = dragOver === "bench";
            const byRole = new Map<string, typeof bench>();
            for (const s of bench) {
              const k = s.role_name ?? "No Role";
              if (!byRole.has(k)) byRole.set(k, []);
              byRole.get(k)!.push(s);
            }
            return (
              <div
                {...bucketDropProps("bench", null, null, "bench", true)}
                className={`rounded-xl p-3 border transition-colors min-h-[60px] ${over ? "bg-slate-700/40 border-slate-500" : "bg-slate-900/40 border-slate-800"}`}
              >
                <BucketHeader name="Bench" count={bench.length} />
                {bench.length === 0
                  ? <p className={`text-[10px] italic ${over ? "text-slate-300" : "text-slate-700"}`}>{over ? "Drop here" : "Empty"}</p>
                  : Array.from(byRole.entries()).map(([roleName, members]) => (
                      <div key={roleName} className="mb-2 last:mb-0">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                          {roleName} ({members.length})
                        </div>
                        {members.map(s => <SignupRow key={s.id} s={s} />)}
                      </div>
                    ))
                }
              </div>
            );
          })()}

          {/* Tentative */}
          {(isOfficer || tentative.length > 0) && (() => {
            const over = dragOver === "tentative";
            return (
              <div
                {...bucketDropProps("tentative", null, null, "tentative")}
                className={`rounded-xl p-3 border transition-colors min-h-[60px] ${over ? "bg-slate-700/40 border-slate-500" : "bg-slate-900/40 border-slate-800"}`}
              >
                <BucketHeader name="Tentative" count={tentative.length} />
                {tentative.length === 0
                  ? <p className={`text-[10px] italic ${over ? "text-slate-300" : "text-slate-700"}`}>{over ? "Drop here" : "Empty"}</p>
                  : tentative.map(s => <SignupRow key={s.id} s={s} />)}
              </div>
            );
          })()}

          {/* Declined — self-reported, not counted in attendance rate */}
          {(isOfficer || declined.length > 0) && (() => {
            const over = dragOver === "declined";
            return (
              <div
                {...bucketDropProps("declined", null, null, "declined")}
                className={`rounded-xl p-3 border transition-colors min-h-[60px] ${over ? "bg-indigo-900/20 border-indigo-700/50" : "bg-slate-900/40 border-slate-800"}`}
              >
                <BucketHeader name="Declined" count={declined.length} />
                {declined.length === 0
                  ? <p className={`text-[10px] italic ${over ? "text-indigo-400" : "text-slate-700"}`}>{over ? "Drop here" : "Empty"}</p>
                  : declined.map(s => <SignupRow key={s.id} s={s} />)}
              </div>
            );
          })()}

          {/* Absent — grouped by the role they wanted, counts as not-attended */}
          {(isOfficer || absent.length > 0) && (() => {
            const over = dragOver === "absent";
            const byRole = new Map<string, typeof absent>();
            for (const s of absent) {
              const k = s.role_name ?? "No Role";
              if (!byRole.has(k)) byRole.set(k, []);
              byRole.get(k)!.push(s);
            }
            return (
              <div
                {...bucketDropProps("absent", null, null, "absent", true)}
                className={`rounded-xl p-3 border transition-colors min-h-[60px] ${over ? "bg-red-900/20 border-red-800/50" : "bg-slate-900/40 border-slate-800"}`}
              >
                <BucketHeader name="Absent" count={absent.length} />
                {absent.length === 0
                  ? <p className={`text-[10px] italic ${over ? "text-red-400" : "text-slate-700"}`}>{over ? "Drop here" : "Empty"}</p>
                  : Array.from(byRole.entries()).map(([roleName, members]) => (
                      <div key={roleName} className="mb-2 last:mb-0">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                          {roleName} ({members.length})
                        </div>
                        {members.map(s => <SignupRow key={s.id} s={s} />)}
                      </div>
                    ))
                }
              </div>
            );
          })()}

          {event.signups.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-12">No signups yet.</p>
          )}
        </div>

    </div>
  );
}

// ── Recurring Section ─────────────────────────────────────────────────────────
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type RecurringSeries = {
  id: string;
  title: string;
  description: string | null;
  weekdays: number[];
  event_time: string;
  event_timezone: string;
  total_cap: number | null;
  ping_role_ids: string[];
  enable_ping: boolean;
  enable_reminder_ping: boolean;
  reminder_minutes: number[];
  channel_id: string | null;
  advance_minutes: number;
  roles: Array<{ name: string; emoji: string | null; soft_cap: number | null }>;
  start_date: string;
  end_date: string | null;
  skip_dates: string[];
};

function fmtAnnounce(mins: number, eventTime: string): string {
  const [etH, etM] = eventTime.slice(0, 5).split(':').map(Number);
  const eventMins = (etH || 0) * 60 + (etM || 0);
  const totalMins = eventMins - mins; // minutes from midnight of event day (can be negative)
  if (totalMins >= 0) {
    // Same calendar day as the event
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m before`;
    if (m === 0) return `${h}h before`;
    return `${h}h ${m}m before`;
  }
  // Crosses midnight — show as "N day(s) before at HH:MM"
  const announceMins = ((totalMins % 1440) + 1440) % 1440;
  const daysBefore = Math.ceil(-totalMins / 1440);
  const aH = Math.floor(announceMins / 60);
  const aM = announceMins % 60;
  const suffix = aH >= 12 ? 'PM' : 'AM';
  const h12 = aH % 12 || 12;
  const timeStr = `${h12}:${String(aM).padStart(2, '0')} ${suffix}`;
  return `${daysBefore} day${daysBefore !== 1 ? 's' : ''} before at ${timeStr}`;
}

type RecurringRoleEntry = { name: string; soft_cap: string; emoji: string; class_mode: ClassMode; choices: string[] };

function RecurringSection({ channels, guildEmojis, discordRoles, classEmojiMap }: {
  channels: Channel[];
  guildEmojis: GuildEmoji[];
  discordRoles: DiscordRole[];
  classEmojiMap: Record<string, string>;
}) {
  const [series, setSeries]     = useState<RecurringSeries[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editId, setEditId]     = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [skipInput, setSkipInput] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    title: '', description: '', weekdays: [] as number[],
    event_time: '', event_timezone: 'America/New_York',
    total_cap: '', channel_id: '',
    announce_mode: 'days_before' as 'hours_before' | 'days_before',
    advance_h: '2', advance_m: '0',
    announce_days: '2', announce_time: '12:00',
    start_date: '', end_date: '',
    enable_ping: true, ping_role_ids: [] as string[],
    enable_reminder_ping: true,
    reminder_minutes: [60, 30] as number[],
    roles: [] as RecurringRoleEntry[],
    update_future: false,
  });

  useEffect(() => {
    apiFetch('/api/recurring')
      .then(r => r.json())
      .then(d => setSeries(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startNew() {
    setEditId('new');
    setForm({
      title: '', description: '', weekdays: [],
      event_time: '', event_timezone: 'America/New_York',
      total_cap: '', channel_id: '',
      announce_mode: 'days_before' as 'hours_before' | 'days_before',
      advance_h: '2', advance_m: '0',
      announce_days: '2', announce_time: '12:00',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '', cancelled_after: '',
      enable_ping: true, ping_role_ids: [] as string[],
      enable_reminder_ping: true,
      reminder_minutes: [60, 30] as number[],
      roles: [],
      update_future: false,
    });
  }

  function startEdit(s: RecurringSeries) {
    setEditId(s.id);
    const adv = s.advance_minutes;
    const eventTimeStr = String(s.event_time).slice(0, 5);
    const [etH, etM] = eventTimeStr.split(':').map(Number);
    const eventMins = (etH || 0) * 60 + (etM || 0);

    let announce_mode: 'hours_before' | 'days_before' = 'hours_before';
    let advance_h = String(Math.floor(adv / 60));
    let advance_m = String(adv % 60);
    let announce_days = '1';
    let announce_time = '12:00';

    const totalMins = eventMins - adv; // negative means crosses midnight
    if (totalMins < 0) {
      announce_mode = 'days_before';
      const announceMins = ((totalMins % 1440) + 1440) % 1440;
      const days = Math.max(1, Math.ceil(-totalMins / 1440));
      announce_days = String(days);
      const aH = Math.floor(announceMins / 60);
      const aM = announceMins % 60;
      announce_time = `${String(aH).padStart(2, '0')}:${String(aM).padStart(2, '0')}`;
    }

    setForm({
      title: s.title,
      description: s.description ?? '',
      weekdays: s.weekdays,
      event_time: eventTimeStr,
      event_timezone: s.event_timezone,
      total_cap: s.total_cap != null ? String(s.total_cap) : '',
      channel_id: s.channel_id ?? '',
      announce_mode, advance_h, advance_m, announce_days, announce_time,
      start_date: String(s.start_date).slice(0, 10),
      end_date: s.end_date ? String(s.end_date).slice(0, 10) : '',
      enable_ping: s.enable_ping ?? true,
      ping_role_ids: s.ping_role_ids ?? [],
      enable_reminder_ping: s.enable_reminder_ping ?? true,
      reminder_minutes: s.reminder_minutes ?? [60, 30],
      roles: s.roles.map(r => ({
        name: r.name, emoji: r.emoji ?? '', soft_cap: r.soft_cap != null ? String(r.soft_cap) : '',
        class_mode: (r.class_mode ?? 'bdo') as ClassMode,
        choices: Array.isArray(r.choices) ? r.choices.map((c: any) => typeof c === 'string' ? c : (c.label ?? '')).filter(Boolean) : [],
      })),
      update_future: false,
    });
  }

  function toggleWeekday(d: number) {
    setForm(f => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter(w => w !== d) : [...f.weekdays, d].sort((a, b) => a - b),
    }));
  }

  async function save() {
    if (!form.title.trim() || form.weekdays.length === 0 || !form.event_time || !form.start_date) return;
    setSaving(true);
    let advance_minutes: number;
    if (form.announce_mode === 'days_before') {
      const [etH, etM] = form.event_time.split(':').map(Number);
      const eventMins = (etH || 0) * 60 + (etM || 0);
      const [atH, atM] = form.announce_time.split(':').map(Number);
      const announceMins = (atH || 0) * 60 + (atM || 0);
      const days = parseInt(form.announce_days) || 1;
      advance_minutes = days * 1440 + eventMins - announceMins;
    } else {
      advance_minutes = (parseInt(form.advance_h) || 0) * 60 + (parseInt(form.advance_m) || 0);
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      weekdays: form.weekdays,
      event_time: form.event_time,
      event_timezone: form.event_timezone,
      total_cap: form.total_cap ? parseInt(form.total_cap) : null,
      enable_ping: form.enable_ping,
      ping_role_ids: form.ping_role_ids,
      enable_reminder_ping: form.enable_reminder_ping,
      reminder_minutes: form.reminder_minutes,
      channel_id: form.channel_id || null,
      advance_minutes,
      roles: form.roles.filter(r => r.name.trim()).map(r => ({
        name: r.name.trim(),
        emoji: r.emoji.trim() || null,
        soft_cap: r.soft_cap ? parseInt(r.soft_cap) : null,
        class_mode: r.class_mode,
        choices: r.class_mode === 'custom' ? r.choices : [],
      })),
      start_date: form.start_date,
      end_date: form.end_date || null,
      update_future_events: form.update_future,
    };
    const isNew = editId === 'new';
    const res = await apiFetch(isNew ? '/api/recurring' : `/api/recurring/${editId}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const row = await res.json();
      if (isNew) setSeries(prev => [row, ...prev]);
      else setSeries(prev => prev.map(s => s.id === editId ? row : s));
      setEditId(null);
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this recurring series? Already-created events will not be deleted.')) return;
    await apiFetch(`/api/recurring/${id}`, { method: 'DELETE' });
    setSeries(prev => prev.filter(s => s.id !== id));
    if (editId === id) setEditId(null);
  }

  async function addSkipDate(sid: string) {
    const d = skipInput[sid];
    if (!d) return;
    const res = await apiFetch(`/api/recurring/${sid}/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: d }),
    });
    if (res.ok) {
      setSeries(prev => prev.map(s => s.id === sid ? { ...s, skip_dates: [...s.skip_dates, d].sort() } : s));
      setSkipInput(prev => ({ ...prev, [sid]: '' }));
    }
  }

  async function removeSkipDate(sid: string, d: string) {
    await apiFetch(`/api/recurring/${sid}/skip/${d}`, { method: 'DELETE' });
    setSeries(prev => prev.map(s => s.id === sid ? { ...s, skip_dates: s.skip_dates.filter(x => x !== d) } : s));
  }

  const finp = "bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 w-full";

  const today = new Date().toISOString().slice(0, 10);
  function isActive(s: RecurringSeries) {
    return !s.end_date || s.end_date >= today;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-white">Recurring Events</h2>
          <p className="text-slate-400 text-sm mt-0.5">Auto-post signups on a repeating schedule.</p>
        </div>
        {editId === null && (
          <button onClick={startNew}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors">
            + New Series
          </button>
        )}
      </div>

      {editId !== null && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
          <h3 className="font-black text-slate-400 text-xs uppercase tracking-widest mb-4">
            {editId === 'new' ? 'New Recurring Series' : 'Edit Series'}
          </h3>
          <div className="flex flex-col gap-4">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Series title (e.g. Node War)" className={finp} />
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)" className={finp} />

            {/* Weekdays */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1.5">Repeats on</label>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button key={i} type="button" onClick={() => toggleWeekday(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                      ${form.weekdays.includes(i)
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time + Timezone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Event Time</label>
                <input type="time" value={form.event_time}
                  onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} className={finp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Timezone</label>
                <select value={form.event_timezone}
                  onChange={e => setForm(f => ({ ...f, event_timezone: e.target.value }))} className={finp}>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>

            {/* Start / End date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Starts On</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={finp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">
                  Ends On <span className="text-slate-600 normal-case font-normal">(optional)</span>
                </label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={finp} />
              </div>
            </div>

            {/* Cap + Channel */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Total Cap <span className="normal-case font-normal text-slate-700">(optional)</span></label>
                <input type="number" min="1" placeholder="uncapped" value={form.total_cap}
                  onChange={e => setForm(f => ({ ...f, total_cap: e.target.value }))} className={finp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Discord Channel</label>
                {channels.length > 0 ? (
                  <select value={form.channel_id}
                    onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} className={finp}>
                    <option value="">— select channel —</option>
                    {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  </select>
                ) : (
                  <input value={form.channel_id}
                    onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))}
                    placeholder="Channel ID" className={finp} />
                )}
              </div>
            </div>

            {/* ── Announce Signups ── */}
            <div className="border border-slate-700/60 rounded-xl p-4 flex flex-col gap-3 bg-slate-900/40">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Announce Signups</p>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, announce_mode: 'days_before' }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.announce_mode === 'days_before' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  Days before
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, announce_mode: 'hours_before' }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.announce_mode === 'hours_before' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  Hours / minutes before
                </button>
              </div>
              {form.announce_mode === 'days_before' ? (
                <div className="flex gap-2 items-center flex-wrap">
                  <select value={form.announce_days}
                    onChange={e => setForm(f => ({ ...f, announce_days: e.target.value }))}
                    className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
                    {[1,2,3,5,7,14].map(d => <option key={d} value={String(d)}>{d} day{d > 1 ? 's' : ''} before</option>)}
                  </select>
                  <span className="text-slate-500 text-sm shrink-0">at</span>
                  <input type="time" value={form.announce_time}
                    onChange={e => setForm(f => ({ ...f, announce_time: e.target.value }))}
                    className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500" />
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <input type="number" min="0" value={form.advance_h}
                    onChange={e => setForm(f => ({ ...f, advance_h: e.target.value }))}
                    className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-20 focus:outline-none focus:border-violet-500"
                    placeholder="0" />
                  <span className="text-slate-500 text-sm shrink-0">h</span>
                  <input type="number" min="0" max="59" value={form.advance_m}
                    onChange={e => setForm(f => ({ ...f, advance_m: e.target.value }))}
                    className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-20 focus:outline-none focus:border-violet-500"
                    placeholder="0" />
                  <span className="text-slate-500 text-sm shrink-0">min before</span>
                </div>
              )}
            </div>

            {/* Ping settings */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox" id="rec-enable-ping"
                  checked={form.enable_ping}
                  onChange={e => setForm(f => ({ ...f, enable_ping: e.target.checked }))}
                  className="accent-violet-500"
                />
                <label htmlFor="rec-enable-ping" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
                  Ping roles when posted
                </label>
              </div>
              {form.enable_ping && (
                <div className="flex flex-wrap gap-1.5">
                  {discordRoles.map(r => {
                    const sel = form.ping_role_ids.includes(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          ping_role_ids: sel
                            ? f.ping_role_ids.filter(id => id !== r.id)
                            : [...f.ping_role_ids, r.id],
                        }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          sel ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        @{r.name}
                      </button>
                    );
                  })}
                  {discordRoles.length === 0 && <p className="text-xs text-slate-600">No roles found.</p>}
                </div>
              )}
            </div>

            {/* Reminder ping settings */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox" id="rec-enable-reminder-ping"
                  checked={form.enable_reminder_ping}
                  onChange={e => setForm(f => ({ ...f, enable_reminder_ping: e.target.checked }))}
                  className="accent-violet-500"
                />
                <label htmlFor="rec-enable-reminder-ping" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
                  Send reminder pings
                </label>
              </div>
              {form.enable_reminder_ping && (
                <div className="space-y-2 pl-1">
                  <div className="flex flex-wrap gap-1.5">
                    {[...form.reminder_minutes].sort((a, b) => b - a).map(rm => {
                      const h = Math.floor(rm / 60), m = rm % 60;
                      const lbl = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                      return (
                        <span key={rm} className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 rounded-lg text-xs text-slate-300">
                          {lbl}
                          <button type="button"
                            onClick={() => setForm(f => ({ ...f, reminder_minutes: f.reminder_minutes.filter(v => v !== rm) }))}
                            className="text-slate-500 hover:text-red-400 transition-colors leading-none ml-0.5">×</button>
                        </span>
                      );
                    })}
                    {form.reminder_minutes.length === 0 && (
                      <span className="text-xs text-slate-600 italic">No reminders set</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 15, 30, 60, 120].filter(v => !form.reminder_minutes.includes(v)).map(v => {
                      const h = Math.floor(v / 60), m = v % 60;
                      const lbl = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                      return (
                        <button key={v} type="button"
                          onClick={() => setForm(f => ({ ...f, reminder_minutes: [...f.reminder_minutes, v] }))}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-colors">
                          +{lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Roles */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Roles</p>
              <div className="flex flex-col gap-2">
                {form.roles.map((r, i) => (
                  <div key={i} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input value={r.name}
                        onChange={e => setForm(f => ({ ...f, roles: f.roles.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))}
                        placeholder="Role name" className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm flex-1 min-w-28 focus:outline-none focus:border-violet-500" />
                      <EmojiSelect value={r.emoji} emojis={guildEmojis}
                        onChange={v => setForm(f => ({ ...f, roles: f.roles.map((x, j) => j === i ? { ...x, emoji: v } : x) }))} />
                      <input value={r.soft_cap}
                        onChange={e => setForm(f => ({ ...f, roles: f.roles.map((x, j) => j === i ? { ...x, soft_cap: e.target.value } : x) }))}
                        placeholder="Cap" type="number" min={0}
                        className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-20 focus:outline-none focus:border-violet-500" />
                      <select
                        value={r.class_mode}
                        onChange={e => setForm(f => ({ ...f, roles: f.roles.map((x, j) => j === i ? { ...x, class_mode: e.target.value as ClassMode } : x) }))}
                        className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-violet-500"
                      >
                        <option value="bdo">BDO Classes</option>
                        <option value="custom">Custom selection</option>
                        <option value="none">No selection</option>
                      </select>
                      <button onClick={() => setForm(f => ({ ...f, roles: f.roles.filter((_, j) => j !== i) }))}
                        className="shrink-0 text-slate-600 hover:text-red-400 transition-colors text-lg leading-none px-1 ml-auto">×</button>
                    </div>
                    {r.class_mode === 'custom' && (
                      <div className="mt-3 pl-3 border-l-2 border-slate-700">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">
                          Available classes <span className="normal-case font-normal">(click to toggle)</span>
                        </p>
                        <ClassPicker
                          selected={r.choices}
                          classEmojiMap={classEmojiMap}
                          guildEmojis={guildEmojis}
                          onChange={choices => setForm(f => ({ ...f, roles: f.roles.map((x, j) => j === i ? { ...x, choices } : x) }))}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={() => setForm(f => ({ ...f, roles: [...f.roles, blankRole()] }))}
                  className="self-start text-xs text-violet-400 hover:text-violet-300 transition-colors">+ Add role</button>
              </div>
            </div>

            {/* Update future events (edit only) */}
            {editId !== 'new' && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.update_future}
                  onChange={e => setForm(f => ({ ...f, update_future: e.target.checked }))}
                  className="w-4 h-4 rounded accent-violet-500" />
                <span className="text-sm text-slate-300">Also update already-posted future events</span>
              </label>
            )}

            <div className="flex gap-2">
              <button onClick={save}
                disabled={!form.title.trim() || form.weekdays.length === 0 || !form.event_time || !form.start_date || saving}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-bold text-sm transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-center py-12">Loading…</p>
      ) : series.length === 0 ? (
        <p className="text-slate-600 text-center py-12">No recurring series yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {series.map(s => (
            <div key={s.id} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-bold text-white">{s.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive(s)
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                        : 'bg-slate-700/60 text-slate-400 border border-slate-600'
                    }`}>
                      {isActive(s) ? 'active' : 'ended'}
                    </span>
                  </div>
                  {s.description && <p className="text-xs text-slate-400 mb-1.5">{s.description}</p>}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {s.weekdays.slice().sort((a, b) => a - b).map(d => (
                      <span key={d} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                        {WEEKDAY_LABELS[d]}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    <span>{String(s.event_time).slice(0, 5)} {s.event_timezone}</span>
                    <span>⏰ signups open {fmtAnnounce(s.advance_minutes, String(s.event_time))}</span>
                    <span>from {String(s.start_date).slice(0, 10)}{s.end_date ? ` → ${String(s.end_date).slice(0, 10)}` : ''}</span>
                  </div>
                  {s.skip_dates.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.skip_dates.map(d => (
                        <span key={d} className="text-[10px] px-2 py-0.5 bg-slate-800 text-amber-400 rounded border border-slate-700 flex items-center gap-1">
                          skip {d}
                          <button onClick={() => removeSkipDate(s.id, d)}
                            className="text-slate-600 hover:text-red-400 ml-0.5 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2 items-center">
                    <input
                      type="date"
                      value={skipInput[s.id] ?? ''}
                      onChange={e => setSkipInput(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="bg-slate-800/60 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => addSkipDate(s.id)}
                      disabled={!skipInput[s.id]}
                      className="text-xs px-2 py-1 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 transition-colors disabled:opacity-30"
                    >
                      Skip date
                    </button>
                  </div>
                </div>
                <div className="shrink-0 flex gap-1">
                  <button onClick={() => startEdit(s)}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => remove(s.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:text-red-400 hover:bg-slate-800 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Templates Section ─────────────────────────────────────────────────────────
type TplRoleEntry = { name: string; soft_cap: string; emoji: string; class_mode: ClassMode; choices: string[] };

function TemplatesSection({ templates, setTemplates, channels, guildEmojis, discordRoles, classEmojiMap }: {
  templates: EventTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<EventTemplate[]>>;
  channels: Channel[];
  guildEmojis: GuildEmoji[];
  discordRoles: DiscordRole[];
  classEmojiMap: Record<string, string>;
}) {
  const [loading, setLoading] = useState(true);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState({ name: "", description: "", event_time: "", event_timezone: "America/New_York", channel_id: "", enable_ping: true, ping_role_ids: [] as string[], enable_reminder_ping: true, reminder_minutes: [60, 30] as number[] });
  const [roles, setRoles]         = useState<TplRoleEntry[]>([]);
  const [saving, setSaving]       = useState(false);

  useEffect(() => { setLoading(false); }, [templates]);

  function startNew() {
    setEditId("new");
    setForm({ name: "", description: "", event_time: "", event_timezone: "America/New_York", channel_id: "", enable_ping: true, ping_role_ids: [], enable_reminder_ping: true, reminder_minutes: [60, 30] });
    setRoles([{ name: "Main", soft_cap: "", emoji: "", class_mode: "bdo", choices: [] }]);
  }

  function startEdit(t: EventTemplate) {
    setEditId(t.id);
    setForm({ name: t.name, description: t.description ?? "", event_time: t.event_time ?? "", event_timezone: t.event_timezone ?? "America/New_York", channel_id: t.channel_id ?? "", enable_ping: t.enable_ping ?? true, ping_role_ids: t.ping_role_ids ?? [], enable_reminder_ping: t.enable_reminder_ping ?? true, reminder_minutes: t.reminder_minutes ?? [60, 30] });
    const safe = Array.isArray(t.roles) ? t.roles : [];
    setRoles(safe.map(r => ({
      name: r.name, soft_cap: r.soft_cap != null ? String(r.soft_cap) : "", emoji: r.emoji ?? "",
      class_mode: (r.class_mode ?? "bdo") as ClassMode,
      choices: Array.isArray(r.choices) ? r.choices.map((c: any) => typeof c === "string" ? c : (c.label ?? "")).filter(Boolean) : [],
    })));
  }

  function addRole() { setRoles(prev => [...prev, { name: "", soft_cap: "", emoji: "", class_mode: "bdo" as ClassMode, choices: [] }]); }
  function removeRole(i: number) { setRoles(prev => prev.filter((_, idx) => idx !== i)); }
  function patchRole(i: number, field: string, val: string) {
    setRoles(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      event_time: form.event_time || null, event_timezone: form.event_timezone || null, channel_id: form.channel_id || null,
      enable_ping: form.enable_ping,
      ping_role_ids: form.ping_role_ids,
      enable_reminder_ping: form.enable_reminder_ping,
      reminder_minutes: form.reminder_minutes,
      roles: roles.filter(r => r.name.trim()).map(r => ({
        name: r.name.trim(), soft_cap: r.soft_cap ? parseInt(r.soft_cap) : null, emoji: r.emoji.trim() || null,
        class_mode: r.class_mode, choices: r.class_mode === "custom" ? r.choices : [],
      })),
    };
    const isNew = editId === "new";
    const res = await apiFetch(isNew ? "/api/event-templates" : `/api/event-templates/${editId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const row = await res.json();
      if (isNew) setTemplates(prev => [...prev, row]);
      else setTemplates(prev => prev.map(t => t.id === editId ? row : t));
      setEditId(null);
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this template?")) return;
    await apiFetch(`/api/event-templates/${id}`, { method: "DELETE" });
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (editId === id) setEditId(null);
  }

  const finp = "bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 w-full";
  const rinp = "bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-white">Event Templates</h2>
          <p className="text-slate-400 text-sm mt-0.5">Reusable role configs for quick event creation.</p>
        </div>
        {editId === null && (
          <button onClick={startNew} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors">
            + New Template
          </button>
        )}
      </div>

      {editId !== null && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
          <h3 className="font-black text-slate-400 text-xs uppercase tracking-widest mb-4">
            {editId === "new" ? "New Template" : "Edit Template"}
          </h3>
          <div className="flex flex-col gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name" className={finp} />
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" className={finp} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Default Time</label>
                <input type="time" value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} className={finp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Timezone</label>
                <select value={form.event_timezone} onChange={e => setForm(f => ({ ...f, event_timezone: e.target.value }))} className={finp}>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-1">Channel</label>
              {channels.length > 0 ? (
                <select value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} className={finp}>
                  <option value="">— select channel —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              ) : (
                <input value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} placeholder="Channel ID" className={finp} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox" id="tpl-enable-ping"
                  checked={form.enable_ping}
                  onChange={e => setForm(f => ({ ...f, enable_ping: e.target.checked }))}
                  className="accent-violet-500"
                />
                <label htmlFor="tpl-enable-ping" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
                  Ping roles when posted
                </label>
              </div>
              {form.enable_ping && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {discordRoles.map(r => {
                    const sel = form.ping_role_ids.includes(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          ping_role_ids: sel
                            ? f.ping_role_ids.filter(id => id !== r.id)
                            : [...f.ping_role_ids, r.id],
                        }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          sel ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        @{r.name}
                      </button>
                    );
                  })}
                  {discordRoles.length === 0 && <p className="text-xs text-slate-600">No roles found.</p>}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox" id="tpl-enable-reminder-ping"
                  checked={form.enable_reminder_ping}
                  onChange={e => setForm(f => ({ ...f, enable_reminder_ping: e.target.checked }))}
                  className="accent-violet-500"
                />
                <label htmlFor="tpl-enable-reminder-ping" className="text-xs font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
                  Send reminder pings
                </label>
              </div>
              {form.enable_reminder_ping && (
                <div className="space-y-2 pl-1">
                  <div className="flex flex-wrap gap-1.5">
                    {[...form.reminder_minutes].sort((a, b) => b - a).map(rm => {
                      const h = Math.floor(rm / 60), m = rm % 60;
                      const lbl = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                      return (
                        <span key={rm} className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 rounded-lg text-xs text-slate-300">
                          {lbl}
                          <button type="button"
                            onClick={() => setForm(f => ({ ...f, reminder_minutes: f.reminder_minutes.filter(v => v !== rm) }))}
                            className="text-slate-500 hover:text-red-400 transition-colors leading-none ml-0.5">×</button>
                        </span>
                      );
                    })}
                    {form.reminder_minutes.length === 0 && (
                      <span className="text-xs text-slate-600 italic">No reminders set</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 15, 30, 60, 120].filter(v => !form.reminder_minutes.includes(v)).map(v => {
                      const h = Math.floor(v / 60), m = v % 60;
                      const lbl = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                      return (
                        <button key={v} type="button"
                          onClick={() => setForm(f => ({ ...f, reminder_minutes: [...f.reminder_minutes, v] }))}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-colors">
                          +{lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Roles</p>
              <div className="flex flex-col gap-2">
                {roles.map((r, i) => (
                  <div key={i} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input value={r.name} onChange={e => patchRole(i, "name", e.target.value)} placeholder="Role name" className={`${rinp} flex-1 min-w-28`} />
                      <EmojiSelect value={r.emoji} emojis={guildEmojis} onChange={v => patchRole(i, "emoji", v)} />
                      <input value={r.soft_cap} onChange={e => patchRole(i, "soft_cap", e.target.value)} placeholder="Cap" type="number" min={0} className={`${rinp} w-20`} />
                      <select
                        value={r.class_mode}
                        onChange={e => patchRole(i, "class_mode", e.target.value)}
                        className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-violet-500"
                      >
                        <option value="bdo">BDO Classes</option>
                        <option value="custom">Custom selection</option>
                        <option value="none">No selection</option>
                      </select>
                      <button onClick={() => removeRole(i)} className="shrink-0 text-slate-600 hover:text-red-400 transition-colors text-lg leading-none px-1 ml-auto">×</button>
                    </div>
                    {r.class_mode === "custom" && (
                      <div className="mt-3 pl-3 border-l-2 border-slate-700">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">
                          Available classes <span className="normal-case font-normal">(click to toggle)</span>
                        </p>
                        <ClassPicker
                          selected={r.choices}
                          classEmojiMap={classEmojiMap}
                          guildEmojis={guildEmojis}
                          onChange={choices => setRoles(prev => prev.map((x, j) => j === i ? { ...x, choices } : x))}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={addRole} className="self-start text-xs text-violet-400 hover:text-violet-300 transition-colors">+ Add role</button>
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={save} disabled={!form.name.trim() || saving}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-bold text-sm transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <p className="text-slate-500 text-center py-12">Loading…</p> : templates.length === 0 ? (
        <p className="text-slate-600 text-center py-12">No templates yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map(t => (
            <div key={t.id} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{t.name}</p>
                  {t.description && <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(Array.isArray(t.roles) ? t.roles : []).map((r, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1">
                        {r.emoji && <EmojiText text={r.emoji} />}{r.name}{r.soft_cap != null ? ` (${r.soft_cap})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 flex gap-1">
                  <button onClick={() => startEdit(t)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">Edit</button>
                  <button onClick={() => remove(t.id)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:text-red-400 hover:bg-slate-800 transition-colors">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Events({ initialEventId }: { initialEventId?: string | null } = {}) {
  const user = useAuth();
  const isOfficer = !!user && isOfficerOrAdmin(user);

  const [mainTab, setMainTab]     = useState<"events" | "templates" | "recurring">("events");
  const [view, setView]           = useState<"list" | "form" | "detail">("list");
  const [events, setEvents]       = useState<EventItem[]>([]);
  const [detail, setDetail]       = useState<EventDetail | null>(null);
  const [editing, setEditing]     = useState<EventDetail | EventItem | null>(null);
  const [templates, setTemplates]   = useState<EventTemplate[]>([]);
  const [channels, setChannels]     = useState<Channel[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [discordRoles, setDiscordRoles] = useState<DiscordRole[]>([]);
  const [classEmojiMap, setClassEmojiMap] = useState<Record<string, string>>({});
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]       = useState<"upcoming" | "all" | "closed">("upcoming");

  const loadEvents = useCallback(async () => {
    const data = await apiFetch("/api/events").then(r => r.json()).catch(() => []);
    setEvents(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialEventId) loadDetail(initialEventId);
  }, [initialEventId]);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    loadEvents();
    if (isOfficer) {
      apiFetch("/api/event-templates").then(r => r.json()).then(setTemplates).catch(() => {});
      apiFetch("/api/discord/channels").then(r => r.json()).then(setChannels).catch(() => {});
      apiFetch("/api/discord/emojis").then(r => r.json()).then(d => {
        setGuildEmojis((Array.isArray(d) ? d : []).filter((e: any) => e.id && e.name).sort((a: GuildEmoji, b: GuildEmoji) => a.name.localeCompare(b.name)));
      }).catch(() => {});
      apiFetch("/api/discord/roles").then(r => r.json()).then(setDiscordRoles).catch(() => {});
      apiFetch("/api/class-emojis").then(r => r.json()).then(d => {
        if (d && typeof d === "object") setClassEmojiMap(d);
      }).catch(() => {});
    }
  }, [user, isOfficer, loadEvents]);

  async function loadDetail(id: string) {
    const data = await apiFetch(`/api/events/${id}`).then(r => r.json()).catch(() => null);
    if (data) { setDetail(data); setView("detail"); }
  }

  async function saveForm(form: ReturnType<typeof blankForm>, publish: boolean) {
    const body = {
      title: form.title, description: form.description || null,
      event_date: form.event_date, event_time: form.event_time,
      event_timezone: form.event_timezone || "UTC",
      total_cap: form.total_cap ? parseInt(form.total_cap) : null,
      enable_ping: form.enable_ping,
      ping_role_ids: form.ping_role_ids,
      enable_reminder_ping: form.enable_reminder_ping,
      reminder_minutes: form.reminder_minutes,
      channel_id: form.channel_id || null,
      // For edits, only change status when explicitly publishing; never downgrade an active event
      status: editing
        ? (publish && editing.status !== "active" ? "active" : editing.status)
        : (publish ? "active" : "draft"),
      roles: form.roles.filter(r => r.name.trim()).map((r, i) => ({
        name: r.name.trim(), emoji: r.emoji || null,
        soft_cap: r.soft_cap ? parseInt(r.soft_cap) : null, display_order: i,
        class_mode: r.class_mode,
        choices: r.class_mode === "custom" ? r.choices : [],
      })),
    };
    if (editing) {
      await apiFetch(`/api/events/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    } else {
      await apiFetch("/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    }
    await loadEvents();
    setView("list");
    setEditing(null);
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    await apiFetch(`/api/events/${id}`, { method: "DELETE" });
    await loadEvents();
  }

  async function startEdit(ev: EventItem) {
    const data = await apiFetch(`/api/events/${ev.id}`).then(r => r.json()).catch(() => null);
    setEditing(data ?? ev);
    setView("form");
  }

  const filtered = events.filter(e => {
    if (filter === "upcoming") return e.status !== "closed";
    if (filter === "closed")   return e.status === "closed";
    return true;
  });

  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-slate-300 mb-3">Members only.</p>
          <a href="#/auth" className="text-violet-400 text-sm hover:underline">Log in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">Signups</h1>
            <p className="text-slate-400 text-sm mt-0.5">Guild event signups</p>
          </div>
          {isOfficer && mainTab === "events" && view === "list" && (
            <button
              onClick={() => { setEditing(null); setView("form"); }}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black transition-colors"
            >
              + Create Event
            </button>
          )}
        </div>

        {/* ── Main tabs (officer only) ── */}
        {isOfficer && view === "list" && (
          <div className="flex gap-1 mb-6 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
            <button onClick={() => setMainTab("events")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mainTab === "events" ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"}`}>
              Events
            </button>
            <button onClick={() => setMainTab("templates")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mainTab === "templates" ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"}`}>
              Templates
            </button>
            <button onClick={() => setMainTab("recurring")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mainTab === "recurring" ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"}`}>
              Recurring
            </button>
          </div>
        )}

        {/* ── Templates tab ── */}
        {isOfficer && mainTab === "templates" && view === "list" && (
          <TemplatesSection templates={templates} setTemplates={setTemplates} channels={channels} guildEmojis={guildEmojis} discordRoles={discordRoles} classEmojiMap={classEmojiMap} />
        )}

        {/* ── Recurring tab ── */}
        {isOfficer && mainTab === "recurring" && view === "list" && (
          <RecurringSection channels={channels} guildEmojis={guildEmojis} discordRoles={discordRoles} classEmojiMap={classEmojiMap} />
        )}

        {/* ── Events tab ── */}
        {mainTab === "events" && (
          <>
            {/* ── List view ── */}
            {view === "list" && (
              <>
                {/* Filter tabs */}
                <div className="flex gap-1 mb-6 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
                  {(["upcoming", "all", "closed"] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${filter === f ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"}`}
                    >{f}</button>
                  ))}
                </div>

                {loading ? (
                  <p className="text-slate-500 text-sm text-center py-20">Loading…</p>
                ) : filtered.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-20">No signups found.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filtered.map(ev => (
                      <div key={ev.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap hover:border-slate-700 transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-black text-white text-base">{ev.title}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[ev.status]}`}>
                              {ev.status}
                            </span>
                          </div>
                          <p className="text-slate-300 text-sm">{fmtDate(ev.event_date)} · {fmtTime(ev.event_time)}</p>
                          <p className="text-slate-500 text-xs mt-1">
                            {ev.accepted_count}{ev.total_cap != null ? `/${ev.total_cap}` : ""} accepted
                            {ev.bench_count > 0 && <> · {ev.bench_count} bench</>}
                            {ev.tentative_count > 0 && <> · {ev.tentative_count} tentative</>}
                            {ev.declined_count > 0 && <> · {ev.declined_count} declined</>}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => loadDetail(ev.id)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors">
                            View
                          </button>
                          {isOfficer && (
                            <>
                              <button onClick={() => startEdit(ev)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors">
                                Edit
                              </button>
                              <button onClick={() => deleteEvent(ev.id)} className="px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/60 text-red-400 text-xs font-semibold transition-colors">
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Form view ── */}
            {view === "form" && (
              <>
                <button
                  onClick={() => { setView("list"); setEditing(null); }}
                  className="text-slate-500 hover:text-white text-sm mb-4 transition-colors"
                >← Back to signups</button>
                <h2 className="text-lg font-black text-white mb-6">{editing ? "Edit Event" : "Create Event"}</h2>
                <EventForm
                  initial={editing ?? undefined}
                  templates={templates}
                  channels={channels}
                  guildEmojis={guildEmojis}
                  discordRoles={discordRoles}
                  classEmojiMap={classEmojiMap}
                  onSave={saveForm}
                  onCancel={() => { setView("list"); setEditing(null); }}
                />
              </>
            )}

            {/* ── Detail view ── */}
            {view === "detail" && detail && (
              <EventDetail
                event={detail}
                isOfficer={isOfficer}
                onBack={() => { setView("list"); setDetail(null); }}
                onRefresh={() => loadDetail(detail.id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
