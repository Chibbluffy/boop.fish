import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, apiFetch, isOfficerOrAdmin } from "../lib/auth";
import { BDO_CLASSES } from "../lib/bdo-classes";
import { TIMEZONES } from "../lib/timezones";

// ── Types ─────────────────────────────────────────────────────────────────────
type SignupStatus = "accepted" | "bench" | "tentative" | "absent";

interface EventRole {
  id: string;
  name: string;
  emoji: string | null;
  soft_cap: number | null;
  display_order: number;
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
  total_cap: number;
  status: "draft" | "active" | "closed";
  channel_id: string | null;
  message_id: string | null;
  created_by_name: string | null;
  accepted_count: number;
  bench_count: number;
  tentative_count: number;
  absent_count: number;
}

interface EventDetail extends EventItem {
  roles: EventRole[];
  signups: EventSignup[];
}

interface RoleFormEntry {
  name: string;
  emoji: string;
  soft_cap: string;
}

interface EventTemplate {
  id: string;
  name: string;
  description: string | null;
  total_cap: number;
  channel_id: string | null;
  event_time: string | null;
  event_timezone: string | null;
  roles: Array<{ name: string; emoji: string | null; soft_cap: number | null }>;
}

interface Channel { id: string; name: string; }
interface GuildEmoji { id: string; name: string; animated: boolean; }

function emojiUrl(e: GuildEmoji) {
  return `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "webp"}?size=32`;
}
function emojiStr(e: GuildEmoji) {
  return `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
}

function EmojiSelect({ value, emojis, onChange, className }: {
  value: string;
  emojis: GuildEmoji[];
  onChange: (val: string) => void;
  className?: string;
}) {
  const curId = value.match(/:(\d+)>/)?.[1] ?? "";
  const cur   = emojis.find(e => e.id === curId);

  if (emojis.length === 0) {
    return (
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="<:name:id>"
        className={className ?? "bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-28 focus:outline-none focus:border-violet-500"} />
    );
  }

  return (
    <div className="flex items-center gap-1">
      {cur
        ? <img src={emojiUrl(cur)} alt={cur.name} className="w-6 h-6 object-contain shrink-0 rounded" />
        : <span className="w-6 h-6 flex items-center justify-center text-slate-700 shrink-0">—</span>
      }
      <select
        value={curId}
        onChange={e => {
          if (!e.target.value) { onChange(""); return; }
          const picked = emojis.find(em => em.id === e.target.value);
          if (picked) onChange(emojiStr(picked));
        }}
        className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-2 py-2 text-sm w-32 focus:outline-none focus:border-violet-500"
      >
        <option value="">— none —</option>
        {emojis.map(e => <option key={e.id} value={e.id}>{e.animated ? "[GIF] " : ""}{e.name}</option>)}
      </select>
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

// ── Blank form ────────────────────────────────────────────────────────────────
function blankForm() {
  return {
    title: "", description: "", event_date: "", event_time: "",
    event_timezone: "America/New_York",
    total_cap: "25", channel_id: "",
    roles: [] as RoleFormEntry[],
  };
}

// ── Event Form ────────────────────────────────────────────────────────────────
function EventForm({
  initial, templates, channels, guildEmojis, onSave, onPublish, onCancel,
}: {
  initial?: EventDetail | EventItem;
  templates: EventTemplate[];
  channels: Channel[];
  guildEmojis: GuildEmoji[];
  onSave: (data: ReturnType<typeof blankForm>, publish: boolean) => Promise<void>;
  onPublish?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(() => {
    if (initial) {
      const existingRoles = "roles" in initial && Array.isArray(initial.roles)
        ? initial.roles.map(r => ({ name: r.name, emoji: r.emoji ?? "", soft_cap: r.soft_cap ? String(r.soft_cap) : "" }))
        : [] as RoleFormEntry[];
      return {
        title: initial.title, description: initial.description ?? "",
        event_date: String(initial.event_date).slice(0, 10),
        event_time: String(initial.event_time).slice(0, 5),
        event_timezone: initial.event_timezone ?? "America/New_York",
        total_cap: String(initial.total_cap), channel_id: initial.channel_id ?? "",
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
      total_cap: String(t.total_cap),
      channel_id: t.channel_id ?? f.channel_id,
      event_time: t.event_time ?? f.event_time,
      event_timezone: t.event_timezone ?? f.event_timezone,
      roles: t.roles.map(r => ({ name: r.name, emoji: r.emoji ?? "", soft_cap: r.soft_cap ? String(r.soft_cap) : "" })),
    }));
  }

  function addRole() {
    setForm(f => ({ ...f, roles: [...f.roles, { name: "", emoji: "", soft_cap: "" }] }));
  }
  function removeRole(i: number) {
    setForm(f => ({ ...f, roles: f.roles.filter((_, j) => j !== i) }));
  }
  function updateRole(i: number, key: keyof RoleFormEntry, val: string) {
    setForm(f => ({ ...f, roles: f.roles.map((r, j) => j === i ? { ...r, [key]: val } : r) }));
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
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Cap</label>
            <input type="number" min="1" className={inp} value={form.total_cap} onChange={e => setForm(f => ({ ...f, total_cap: e.target.value }))} />
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
              <div key={i} className="flex items-center gap-2">
                <input className={`${inp} flex-1`} placeholder="Role name (e.g. Offense)" value={r.name} onChange={e => updateRole(i, "name", e.target.value)} />
                <EmojiSelect value={r.emoji} emojis={guildEmojis} onChange={v => updateRole(i, "emoji", v)} />
                <input type="number" min="0" className="bg-slate-800/60 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm w-20 focus:outline-none focus:border-violet-500" placeholder="Cap" value={r.soft_cap} onChange={e => updateRole(i, "soft_cap", e.target.value)} />
                <button onClick={() => removeRole(i)} className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1">✕</button>
              </div>
            ))}
          </div>
          {form.roles.length > 0 && <p className="text-xs text-slate-600 mt-1">Emoji · Soft cap (optional)</p>}
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
    const src = anim === "a"
      ? `https://cdn.discordapp.com/emojis/${id}.gif`
      : `https://cdn.discordapp.com/emojis/${id}.png?size=32`;
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
  const [tab, setTab]         = useState<"signups" | "attendance">("signups");
  const [working, setWorking] = useState<string | null>(null);
  // Use a ref for the drag ID so onDragStart doesn't trigger a re-render (which breaks the drag ghost)
  const draggingRef             = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver]     = useState<string | null>(null);

  const accepted  = event.signups.filter(s => s.status === "accepted");
  const bench     = event.signups.filter(s => s.status === "bench");
  const tentative = event.signups.filter(s => s.status === "tentative");
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

  async function markAttended(id: string, attended: boolean) {
    setWorking(id);
    await apiFetch(`/api/events/${event.id}/signups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attended }),
    }).catch(() => {});
    onRefresh();
    setWorking(null);
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

  function bucketDropProps(bucketKey: string, role_id: string | null, role_name: string | null, status: SignupStatus) {
    if (!isOfficer) return {};
    return {
      onDragOver:  (e: React.DragEvent) => { e.preventDefault(); setDragOver(bucketKey); },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(role_id, role_name, status); },
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
        className={`flex items-center gap-2 py-2 px-3 rounded-lg text-sm
          ${busy || thisRowDrag ? "opacity-40" : ""}
          ${isOfficer ? "cursor-grab" : ""}`}
      >
        {isOfficer && <span className="text-slate-700 text-xs shrink-0 pointer-events-none select-none">⠿</span>}
        <span className="text-slate-600 text-xs w-5 text-right shrink-0 select-none">{s.signup_order}</span>
        <span className="font-semibold text-white truncate flex-1 min-w-0 select-none">{s.discord_name}</span>
        {s.bdo_class && <span className="text-xs text-slate-400 shrink-0 select-none">{s.bdo_class}</span>}
        {hasGear && (
          <span className="text-[10px] text-teal-600 shrink-0 tabular-nums select-none whitespace-nowrap">
            {s.gear_ap ?? "—"}/{s.gear_aap ?? "—"}/{s.gear_dp ?? "—"}
          </span>
        )}
        {isOfficer && (
          <button
            draggable={false}
            onClick={e => { e.stopPropagation(); removeSignup(s.id); }}
            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-500 hover:bg-red-800/60 transition-colors"
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
      <button onClick={onBack} className="text-slate-500 hover:text-white text-sm mb-4 transition-colors">← Back to events</button>
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
            {event.accepted_count}/{event.total_cap} accepted
            {event.bench_count > 0 && <> · {event.bench_count} bench</>}
            {event.tentative_count > 0 && <> · {event.tentative_count} tentative</>}
            {event.absent_count > 0 && <> · {event.absent_count} absent</>}
          </p>
        </div>
        {isOfficer && (
          <div className="flex gap-2 flex-wrap">
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

      {/* Tabs */}
      {isOfficer && (
        <div className="flex gap-1 mb-6 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit">
          {(["signups", "attendance"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"}`}
            >{t}</button>
          ))}
        </div>
      )}

      {/* Signups tab */}
      {tab === "signups" && (
        <div className="flex flex-col gap-3">
          {/* Role buckets */}
          {grouped.map(({ role, signups: rs }) => {
            const key  = `role:${role.id}`;
            const over = dragOver === key;
            return (
              <div
                key={role.id}
                {...bucketDropProps(key, role.id, role.name, "accepted")}
                className={`rounded-2xl p-4 border transition-colors ${over
                  ? "bg-violet-900/30 border-violet-500"
                  : "bg-slate-900/40 border-slate-800"}`}
              >
                <BucketHeader emoji={role.emoji} name={role.name} count={rs.length} cap={role.soft_cap} />
                {rs.length === 0
                  ? <p className={`text-xs italic ${over ? "text-violet-400" : "text-slate-700"}`}>
                      {over ? "Drop here" : "No signups yet"}
                    </p>
                  : rs.map(s => <SignupRow key={s.id} s={s} />)}
              </div>
            );
          })}

          {/* No-role accepted */}
          {noRole.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <BucketHeader name="No role assigned" count={noRole.length} />
              {noRole.map(s => <SignupRow key={s.id} s={s} />)}
            </div>
          )}

          {/* Status buckets — always visible for officers so they're stable drop targets */}
          {[
            { key: "bench",     label: "Bench",     list: bench,     status: "bench"     as SignupStatus },
            { key: "tentative", label: "Tentative", list: tentative, status: "tentative" as SignupStatus },
            { key: "absent",    label: "Absent",    list: absent,    status: "absent"    as SignupStatus },
          ].map(({ key, label, list, status }) => {
            if (!isOfficer && list.length === 0) return null;
            const over = dragOver === key;
            return (
              <div
                key={key}
                {...bucketDropProps(key, null, null, status)}
                className={`rounded-2xl p-4 border transition-colors ${over
                  ? "bg-slate-700/40 border-slate-500"
                  : "bg-slate-900/40 border-slate-800"}`}
              >
                <BucketHeader name={label} count={list.length} />
                {list.length === 0
                  ? <p className={`text-xs italic ${over ? "text-slate-300" : "text-slate-700"}`}>
                      {over ? "Drop here" : "Empty"}
                    </p>
                  : list.map(s => <SignupRow key={s.id} s={s} />)}
              </div>
            );
          })}

          {event.signups.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-12">No signups yet.</p>
          )}
        </div>
      )}

      {/* Attendance tab */}
      {tab === "attendance" && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_1fr_7rem_6rem] gap-3 items-center px-4 py-2 border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <span>#</span><span>Name</span><span>Class</span><span>Role</span><span>Attended</span>
          </div>
          {event.signups.filter(s => s.status !== "absent").map(s => (
            <div key={s.id} className="grid grid-cols-[2rem_1fr_1fr_7rem_6rem] gap-3 items-center px-4 py-2.5 border-b border-slate-800/50 text-sm last:border-0">
              <span className="text-slate-600 text-xs">{s.signup_order}</span>
              <div className="min-w-0">
                <span className="font-semibold text-white truncate block">{s.discord_name}</span>
                {(s.gear_ap != null || s.gear_aap != null || s.gear_dp != null) && (
                  <span className="text-[10px] text-teal-600 tabular-nums">
                    {s.gear_ap ?? "—"}/{s.gear_aap ?? "—"}/{s.gear_dp ?? "—"}
                  </span>
                )}
              </div>
              <span className="text-slate-400 text-xs truncate">{s.attended_class ?? s.bdo_class ?? "—"}</span>
              <span className="text-slate-400 text-xs truncate">{s.attended_role ?? s.role_name ?? "—"}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => markAttended(s.id, true)}
                  className={`text-xs px-2 py-0.5 rounded font-semibold transition-colors ${s.attended === true ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-500 hover:text-white"}`}
                >✓</button>
                <button
                  onClick={() => markAttended(s.id, false)}
                  className={`text-xs px-2 py-0.5 rounded font-semibold transition-colors ${s.attended === false ? "bg-red-700 text-white" : "bg-slate-800 text-slate-500 hover:text-white"}`}
                >✕</button>
              </div>
            </div>
          ))}
          {event.signups.filter(s => s.status !== "absent").length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No signups to track.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Templates Section ─────────────────────────────────────────────────────────
type TplRoleEntry = { name: string; soft_cap: string; emoji: string };

function TemplatesSection({ templates, setTemplates, channels, guildEmojis }: {
  templates: EventTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<EventTemplate[]>>;
  channels: Channel[];
  guildEmojis: GuildEmoji[];
}) {
  const [loading, setLoading] = useState(true);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState({ name: "", description: "", event_time: "", event_timezone: "America/New_York", channel_id: "" });
  const [roles, setRoles]         = useState<TplRoleEntry[]>([]);
  const [saving, setSaving]       = useState(false);

  function token() { return localStorage.getItem("boop_session") ?? ""; }
  function authH() { return { Authorization: `Bearer ${token()}` }; }

  useEffect(() => { setLoading(false); }, [templates]);

  function startNew() {
    setEditId("new");
    setForm({ name: "", description: "", event_time: "", event_timezone: "America/New_York", channel_id: "" });
    setRoles([{ name: "Main", soft_cap: "", emoji: "" }]);
  }

  function startEdit(t: EventTemplate) {
    setEditId(t.id);
    setForm({ name: t.name, description: t.description ?? "", event_time: t.event_time ?? "", event_timezone: t.event_timezone ?? "America/New_York", channel_id: t.channel_id ?? "" });
    const safe = Array.isArray(t.roles) ? t.roles : [];
    setRoles(safe.map(r => ({ name: r.name, soft_cap: r.soft_cap != null ? String(r.soft_cap) : "", emoji: r.emoji ?? "" })));
  }

  function addRole() { setRoles(prev => [...prev, { name: "", soft_cap: "", emoji: "" }]); }
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
      roles: roles.filter(r => r.name.trim()).map(r => ({
        name: r.name.trim(), soft_cap: r.soft_cap ? parseInt(r.soft_cap) : null, emoji: r.emoji.trim() || null,
      })),
    };
    const isNew = editId === "new";
    const res = await fetch(isNew ? "/api/event-templates" : `/api/event-templates/${editId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
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
    await fetch(`/api/event-templates/${id}`, { method: "DELETE", headers: authH() });
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
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Roles</p>
              <div className="flex flex-col gap-2">
                {roles.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={r.name} onChange={e => patchRole(i, "name", e.target.value)} placeholder="Role name" className={`${rinp} flex-1 min-w-0`} />
                    <input value={r.soft_cap} onChange={e => patchRole(i, "soft_cap", e.target.value)} placeholder="Cap" type="number" min={0} className={`${rinp} w-20`} />
                    <EmojiSelect value={r.emoji} emojis={guildEmojis} onChange={v => patchRole(i, "emoji", v)} />
                    <button onClick={() => removeRole(i)} className="shrink-0 text-slate-600 hover:text-red-400 transition-colors text-lg leading-none px-1">×</button>
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
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {r.emoji && <span className="mr-1">{r.emoji}</span>}{r.name}{r.soft_cap != null ? ` (${r.soft_cap})` : ""}
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
export default function Events() {
  const user = useAuth();
  const isOfficer = !!user && isOfficerOrAdmin(user);

  const [mainTab, setMainTab]     = useState<"events" | "templates">("events");
  const [view, setView]           = useState<"list" | "form" | "detail">("list");
  const [events, setEvents]       = useState<EventItem[]>([]);
  const [detail, setDetail]       = useState<EventDetail | null>(null);
  const [editing, setEditing]     = useState<EventDetail | EventItem | null>(null);
  const [templates, setTemplates]   = useState<EventTemplate[]>([]);
  const [channels, setChannels]     = useState<Channel[]>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]       = useState<"upcoming" | "all" | "closed">("upcoming");

  const loadEvents = useCallback(async () => {
    const data = await apiFetch("/api/events").then(r => r.json()).catch(() => []);
    setEvents(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    loadEvents();
    if (isOfficer) {
      apiFetch("/api/event-templates").then(r => r.json()).then(setTemplates).catch(() => {});
      apiFetch("/api/discord/channels").then(r => r.json()).then(setChannels).catch(() => {});
      apiFetch("/api/discord/emojis").then(r => r.json()).then(d => {
        setGuildEmojis((Array.isArray(d) ? d : []).filter((e: any) => e.id && e.name).sort((a: GuildEmoji, b: GuildEmoji) => a.name.localeCompare(b.name)));
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
      total_cap: parseInt(form.total_cap) || 25,
      channel_id: form.channel_id || null,
      status: publish ? "active" : "draft",
      roles: form.roles.filter(r => r.name.trim()).map((r, i) => ({
        name: r.name.trim(), emoji: r.emoji || null,
        soft_cap: r.soft_cap ? parseInt(r.soft_cap) : null, display_order: i,
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
            <h1 className="text-2xl font-black text-white">Events</h1>
            <p className="text-slate-400 text-sm mt-0.5">Guild event signups and attendance</p>
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
          </div>
        )}

        {/* ── Templates tab ── */}
        {isOfficer && mainTab === "templates" && view === "list" && (
          <TemplatesSection templates={templates} setTemplates={setTemplates} channels={channels} guildEmojis={guildEmojis} />
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
                  <p className="text-slate-500 text-sm text-center py-20">No events found.</p>
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
                            {ev.accepted_count}/{ev.total_cap} accepted
                            {ev.bench_count > 0 && <> · {ev.bench_count} bench</>}
                            {ev.tentative_count > 0 && <> · {ev.tentative_count} tentative</>}
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
                >← Back to events</button>
                <h2 className="text-lg font-black text-white mb-6">{editing ? "Edit Event" : "Create Event"}</h2>
                <EventForm
                  initial={editing ?? undefined}
                  templates={templates}
                  channels={channels}
                  guildEmojis={guildEmojis}
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
