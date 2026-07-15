import React, { useEffect, useState, useRef, useMemo } from "react";
import { useAuth, isOfficerOrAdmin, AuthUser, apiFetch } from "../lib/auth";
import ShrineSection from "./ShrineSection";
import GuildDirectory from "./GuildDirectory";
import PayoutTracker from "./PayoutTracker";
import { TIMEZONES } from "../lib/timezones";

type SectionId = "members" | "roster" | "announcements" | "wall" | "shrine" | "directory" | "payout" | "class-emojis" | "lore";

const SIDEBAR = [
  {
    group: "Roster",
    items: [
      { id: "members"   as SectionId, label: "Members",        icon: "👥", desc: "Roles & ribbits" },
      { id: "roster"    as SectionId, label: "Roster",         icon: "📋", desc: "Guild roster" },
      { id: "directory" as SectionId, label: "Guild Directory",icon: "📖", desc: "Member profiles" },
    ],
  },
  {
    group: "Content",
    items: [
      { id: "announcements" as SectionId, label: "Announcements", icon: "📢", desc: "Homepage posts" },
      { id: "wall"          as SectionId, label: "Wall of Shame",  icon: "🔥", desc: "Troll board" },
    ],
  },
  {
    group: "Guild",
    items: [
      { id: "shrine" as SectionId, label: "Black Shrine",    icon: "⛩️", desc: "Team builder" },
      { id: "payout" as SectionId, label: "Payout Tracker",  icon: "💰", desc: "Tier management" },
      { id: "lore"   as SectionId, label: "BoopBot Lore",    icon: "🧠", desc: "Guild & personal memory", adminOnly: true },
    ],
  },
  {
    group: "Events",
    items: [
      { id: "class-emojis" as SectionId, label: "Class Emojis", icon: "🎭", desc: "Discord emoji mapping" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, string> = {
  admin:   "bg-red-500/20 text-red-400 border border-red-500/30",
  officer: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  member:  "bg-slate-700/50 text-slate-400 border border-slate-700",
  friend:  "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  pending: "bg-slate-800/80 text-slate-500 border border-slate-700/50",
};

// ── Members section ───────────────────────────────────────────────────────────

type Member = {
  id: string; username: string; email: string | null;
  role: "pending" | "friend" | "member" | "officer" | "admin";
  character_name: string | null; ribbit_count: number; created_at: string;
};

function MembersSection({ me }: { me: AuthUser }) {
  const [members, setMembers]       = useState<Member[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updating, setUpdating]     = useState<string | null>(null);
  const [resetting, setResetting]   = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/members")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMembers(d); setLoading(false); })
      .catch(() => { setError("Failed to load members."); setLoading(false); });
  }, []);

  async function changeRole(id: string, role: string) {
    setUpdating(id);
    const res = await apiFetch(`/api/members/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMembers(prev =>
        prev.map(m => m.id === id ? { ...m, role: updated.role } : m)
          .sort((a, b) => {
            const o: Record<string, number> = { admin: 0, officer: 1, member: 2, pending: 3 };
            return (o[a.role] - o[b.role]) || a.username.localeCompare(b.username);
          })
      );
    }
    setUpdating(null);
  }

  async function resetRibbits(id: string) {
    setResetting(id);
    const res = await apiFetch(`/api/members/${id}/ribbits/reset`, { method: "POST" });
    if (res.ok) setMembers(prev => prev.map(m => m.id === id ? { ...m, ribbit_count: 0 } : m));
    setResetting(null);
  }

  async function resetAllRibbits() {
    if (!confirm("Reset ALL members' ribbit counts to 0?")) return;
    setResettingAll(true);
    const res = await apiFetch("/api/members/ribbits/reset-all", { method: "POST" });
    if (res.ok) setMembers(prev => prev.map(m => ({ ...m, ribbit_count: 0 })));
    setResettingAll(false);
  }

  async function deleteAccount(id: string, username: string) {
    if (!confirm(`Delete account "${username}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await apiFetch(`/api/members/${id}`, { method: "DELETE" });
    if (res.ok) setMembers(prev => prev.filter(m => m.id !== id));
    setDeleting(null);
  }

  const counts = members.reduce((a, m) => { a[m.role] = (a[m.role] ?? 0) + 1; return a; }, {} as Record<string, number>);

  // Derive admin status from live server data so stale cached role doesn't hide controls
  const isAdmin = (members.find(m => m.id === me.id)?.role ?? me.role) === "admin";

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-white">Members</h2>
          <p className="text-slate-500 text-sm mt-0.5">Manage guild roster and roles.</p>
        </div>
        <button onClick={resetAllRibbits} disabled={resettingAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/30 disabled:opacity-40 transition-colors">
          🐸 {resettingAll ? "Resetting…" : "Reset all ribbits"}
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        {[
          { label: "Total",    value: members.length,                                color: "text-white" },
          { label: "Pending",  value: counts.pending ?? 0,                           color: "text-slate-400" },
          { label: "Members",  value: counts.member ?? 0,                            color: "text-slate-300" },
          { label: "Officers", value: (counts.officer ?? 0) + (counts.admin ?? 0),  color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 min-w-[72px] text-center">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-500 text-center py-16">Loading…</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className={`grid gap-4 px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-widest ${isAdmin ? "grid-cols-[2rem_1fr_1fr_8rem_4.5rem_7rem_4rem]" : "grid-cols-[2rem_1fr_1fr_8rem_4.5rem_7rem]"}`}>
            <span />
            <span>Username</span>
            <span>Family Name</span>
            <span>Joined</span>
            <span title="Ribbit count">🐸</span>
            <span>Role</span>
            {isAdmin && <span>Delete</span>}
          </div>

          {members.map((m, i) => {
            const isMe = m.id === me.id;
            const canEdit = !isMe && (isAdmin || ["pending", "friend", "member"].includes(m.role));
            return (
              <div key={m.id}
                className={`grid gap-4 items-center px-5 py-3.5 hover:bg-slate-800/30 transition-colors ${isAdmin ? "grid-cols-[2rem_1fr_1fr_8rem_4.5rem_7rem_4rem]" : "grid-cols-[2rem_1fr_1fr_8rem_4.5rem_7rem]"} ${
                  i < members.length - 1 ? "border-b border-slate-800/60" : ""
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  m.role === "admin" ? "bg-red-500/20 text-red-300" :
                  m.role === "officer" ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400"
                }`}>
                  {m.username[0].toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{m.username}</p>
                  {m.email && <p className="text-xs text-slate-600 truncate">{m.email}</p>}
                </div>

                <p className="text-sm text-slate-400 truncate">{(m as any).family_name ?? "—"}</p>

                <p className="text-xs text-slate-600 whitespace-nowrap">
                  {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>

                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold tabular-nums ${m.ribbit_count > 0 ? "text-green-400" : "text-slate-700"}`}>
                    {m.ribbit_count.toLocaleString()}
                  </span>
                  {!isMe && (
                    <button onClick={() => resetRibbits(m.id)} disabled={resetting === m.id || m.ribbit_count === 0}
                      title="Reset ribbits"
                      className="text-slate-700 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">
                      ↺
                    </button>
                  )}
                </div>

                <div className="shrink-0">
                  {canEdit ? (
                    <select value={m.role} disabled={updating === m.id} onChange={e => changeRole(m.id, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border bg-slate-950 cursor-pointer transition-opacity disabled:opacity-40 ${ROLE_STYLE[m.role]}`}>
                      <option value="pending">pending</option>
                      <option value="friend">friend</option>
                      <option value="member">member</option>
                      <option value="officer">officer</option>
                      {isAdmin && <option value="admin">admin</option>}
                    </select>
                  ) : (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${ROLE_STYLE[m.role]}`}>
                      {m.role}
                    </span>
                  )}
                </div>

                {isAdmin && (
                  <div className="shrink-0">
                    {!isMe ? (
                      <button
                        onClick={() => deleteAccount(m.id, m.username)}
                        disabled={deleting === m.id}
                        className="text-xs font-semibold text-red-500/60 hover:text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {deleting === m.id ? "..." : "Delete"}
                      </button>
                    ) : <span />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-600">
        <span className="text-amber-400 font-semibold">Officers</span> can promote members. <span className="text-red-400 font-semibold">Admins</span> can assign any role.
      </p>
    </div>
  );
}

// ── Announcements section ─────────────────────────────────────────────────────

type Announcement = { id: string; title: string; body: string | null; pinned: boolean; author: string | null; created_at: string; };

function AnnouncementsSection() {
  const [items, setItems]       = useState<Announcement[]>([]);
  const [loading, setLoading]   = useState(true);
  const [title, setTitle]       = useState("");
  const [body, setBody]         = useState("");
  const [pinned, setPinned]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody]   = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/announcements").then(r => r.ok ? r.json() : []).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await apiFetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, pinned }),
    });
    if (res.ok) { const row = await res.json(); setItems(prev => [{ ...row, author: null }, ...prev]); setTitle(""); setBody(""); setPinned(false); }
    setSaving(false);
  }

  async function remove(id: string) {
    await apiFetch(`/api/announcements/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(a => a.id !== id));
    if (editId === id) setEditId(null);
  }

  function startEdit(a: Announcement) { setEditId(a.id); setEditTitle(a.title); setEditBody(a.body ?? ""); setEditPinned(a.pinned); }

  async function saveEdit() {
    if (!editId || !editTitle.trim()) return;
    setEditSaving(true);
    const res = await apiFetch(`/api/announcements/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() || null, pinned: editPinned }),
    });
    if (res.ok) { const row = await res.json(); setItems(prev => prev.map(a => a.id === editId ? { ...a, ...row } : a)); setEditId(null); }
    setEditSaving(false);
  }

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors";

  return (
    <div>
      <h2 className="text-2xl font-black text-white mb-1">Announcements</h2>
      <p className="text-slate-500 text-sm mb-6">Shown on the homepage. Pinned posts appear first.</p>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
        <h3 className="font-black text-white mb-4 text-sm uppercase tracking-widest text-slate-400">New Post</h3>
        <div className="flex flex-col gap-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className={inp} />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Body (optional)" rows={3} className={`${inp} resize-none`} />
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-violet-500 w-4 h-4" />
            Pin to top
          </label>
          <button onClick={add} disabled={!title.trim() || saving}
            className="self-start px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-bold text-sm transition-colors">
            {saving ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {loading ? <p className="text-slate-600 text-center py-8">Loading…</p> : items.length === 0 ? (
        <p className="text-slate-600 text-center py-8">No announcements yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(a => (
            <div key={a.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              {editId === a.id ? (
                <div className="flex flex-col gap-3">
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={inp} />
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={3} className={`${inp} resize-none`} />
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                    <input type="checkbox" checked={editPinned} onChange={e => setEditPinned(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                    Pin to top
                  </label>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={!editTitle.trim() || editSaving}
                      className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm font-bold transition-colors">
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditId(null)} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {a.pinned && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest">Pinned</span>}
                      <p className="font-bold text-white truncate">{a.title}</p>
                    </div>
                    {a.body && <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">{a.body}</p>}
                    <p className="text-xs text-slate-600 mt-1">{a.author && <>{a.author} · </>}{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="shrink-0 flex gap-1">
                    <button onClick={() => startEdit(a)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">Edit</button>
                    <button onClick={() => remove(a.id)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:text-red-400 hover:bg-slate-800 transition-colors">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Wall of Shame section ─────────────────────────────────────────────────────

type WallEntry = { id: string; title: string; description: string | null; author: string | null; created_at: string; };

function WallSection() {
  const [items, setItems]     = useState<WallEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/wall").then(r => r.ok ? r.json() : []).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function remove(id: string) {
    await apiFetch(`/api/wall/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(w => w.id !== id));
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-white mb-1">Wall of Shame</h2>
          <p className="text-slate-500 text-sm">Members submit via <a href="#/submit-wall" className="text-violet-400 hover:text-violet-300">Misc → Submit to Wall of Shame</a>. Delete posts here.</p>
        </div>
      </div>

      {loading ? <p className="text-slate-600 text-center py-8">Loading…</p> : items.length === 0 ? (
        <p className="text-slate-600 text-center py-8">Nothing posted yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(w => (
            <div key={w.id} className="flex items-start gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white">{w.title}</p>
                {w.description && <p className="text-sm text-slate-400 mt-1 leading-relaxed line-clamp-2">{w.description}</p>}
                <p className="text-xs text-slate-600 mt-1">{w.author && <>{w.author} · </>}{new Date(w.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => remove(w.id)} className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:text-red-400 hover:bg-slate-800 transition-colors">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Roster section ────────────────────────────────────────────────────────────

const GUILD_RANKS = ["GM", "Advisor", "Staff", "Secretary", "Officer", "CN/QM", "Member"];
const PLAY_STATUSES = ["Active PvP", "Active PvE", "Semi-Active", "AFK", "Inactive"];

const STATUS_STYLE: Record<string, string> = {
  "Active PvP":  "bg-red-500/20 text-red-400 border-red-500/30",
  "Active PvE":  "bg-green-500/20 text-green-400 border-green-500/30",
  "Semi-Active": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "AFK":         "bg-slate-600/30 text-slate-400 border-slate-600/50",
  "Inactive":    "bg-slate-800/60 text-slate-600 border-slate-700/50",
};

const RANK_STYLE: Record<string, string> = {
  "GM":        "bg-red-500/20 text-red-300 border-red-500/30",
  "Advisor":   "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Staff":     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Secretary": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Officer":   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "CN/QM":     "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Member":    "bg-slate-700/40 text-slate-400 border-slate-700/60",
};

type RosterMember = {
  id: string;
  username: string;
  family_name: string | null;
  discord_name: string | null;
  guild_rank: string | null;
  play_status: string | null;
  timezone: string | null;
  roster_notes: string | null;
  role: string;
};

function tzLabel(value: string | null) {
  if (!value) return "—";
  return TIMEZONES.find(t => t.value === value)?.label.split(" — ")[0] ?? value;
}

function RosterSection() {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRank, setFilterRank]     = useState("");
  const [sortKey, setSortKey] = useState<keyof RosterMember>("username");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Inline field saving state
  const [savingField, setSavingField] = useState<string | null>(null); // "id:field"

  // Notes/details modal
  const [noteModal, setNoteModal] = useState<RosterMember | null>(null);
  const [mFamName,  setMFamName]  = useState("");
  const [mDiscord,  setMDiscord]  = useState("");
  const [mNotes,    setMNotes]    = useState("");
  const [mSaving,   setMSaving]   = useState(false);

  useEffect(() => {
    apiFetch("/api/roster")
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMembers(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function patchField(id: string, field: string, value: string | null) {
    setSavingField(`${id}:${field}`);
    const res = await apiFetch(`/api/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updated } : m));
    }
    setSavingField(null);
  }

  function openNoteModal(m: RosterMember) {
    setNoteModal(m);
    setMFamName(m.family_name ?? "");
    setMDiscord(m.discord_name ?? "");
    setMNotes(m.roster_notes ?? "");
  }

  async function saveNoteModal() {
    if (!noteModal) return;
    setMSaving(true);
    const res = await apiFetch(`/api/roster/${noteModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        family_name:  mFamName.trim()  || null,
        discord_name: mDiscord.trim()  || null,
        roster_notes: mNotes.trim()    || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMembers(prev => prev.map(m => m.id === noteModal.id ? { ...m, ...updated } : m));
      setNoteModal(null);
    }
    setMSaving(false);
  }

  function toggleSort(key: keyof RosterMember) {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(1); }
  }

  const filtered = members
    .filter(m => {
      const q = search.toLowerCase();
      if (q && !m.username.toLowerCase().includes(q) &&
               !(m.family_name?.toLowerCase().includes(q)) &&
               !(m.discord_name?.toLowerCase().includes(q))) return false;
      if (filterStatus && m.play_status !== filterStatus) return false;
      if (filterRank   && m.guild_rank  !== filterRank)   return false;
      return true;
    })
    .sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return av.localeCompare(bv) * sortDir;
    });

  const SortBtn = ({ k, label }: { k: keyof RosterMember; label: string }) => (
    <button onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 uppercase tracking-widest hover:text-white transition-colors ${sortKey === k ? "text-violet-400" : "text-slate-500"}`}>
      {label}
      <span className="text-[10px]">{sortKey === k ? (sortDir === 1 ? "↑" : "↓") : ""}</span>
    </button>
  );

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors text-sm";

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black text-white">Roster</h2>
          <p className="text-slate-500 text-sm mt-0.5">Guild roster — ranks, status, and notes.</p>
        </div>
        <span className="text-xs text-slate-600 mt-2">{filtered.length} / {members.length} members</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or Discord…"
          className="flex-1 min-w-[180px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-colors">
          <option value="">All statuses</option>
          {PLAY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterRank} onChange={e => setFilterRank(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-colors">
          <option value="">All ranks</option>
          {GUILD_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500 text-center py-16">Loading…</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_7rem_8rem_6rem_1fr_1.5rem] gap-3 px-4 py-2.5 border-b border-slate-800 text-[10px] font-semibold">
            <SortBtn k="username"    label="Username" />
            <SortBtn k="family_name" label="Fam Name" />
            <SortBtn k="discord_name"label="Discord" />
            <SortBtn k="guild_rank"  label="Rank" />
            <SortBtn k="play_status" label="Status" />
            <SortBtn k="timezone"    label="Timezone" />
            <span className="text-slate-500 uppercase tracking-widest">Notes</span>
            <span />
          </div>

          {/* Rows */}
          <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
            {filtered.length === 0 ? (
              <p className="text-slate-600 text-center py-12 text-sm">No members match your filters.</p>
            ) : filtered.map((m, i) => {
              const rankStyle   = RANK_STYLE[m.guild_rank   ?? ""] ?? RANK_STYLE["Member"];
              const statusStyle = STATUS_STYLE[m.play_status ?? ""] ?? STATUS_STYLE["Inactive"];
              const isSavingRank   = savingField === `${m.id}:guild_rank`;
              const isSavingStatus = savingField === `${m.id}:play_status`;
              return (
                <div key={m.id}
                  className={`grid grid-cols-[1fr_1fr_1fr_7rem_8rem_6rem_1fr_1.5rem] gap-3 items-center px-4 py-2.5 hover:bg-slate-800/30 transition-colors text-sm ${i < filtered.length - 1 ? "border-b border-slate-800/50" : ""}`}
                >
                  <p className="font-semibold text-white truncate">{m.username}</p>
                  <p className="text-slate-400 text-xs truncate">{m.family_name || <span className="text-slate-700">—</span>}</p>
                  <p className="text-slate-400 text-xs truncate">{m.discord_name || <span className="text-slate-700">—</span>}</p>

                  {/* Rank — inline dropdown */}
                  <select
                    value={m.guild_rank ?? "Member"}
                    disabled={isSavingRank}
                    onChange={e => patchField(m.id, "guild_rank", e.target.value)}
                    className={`text-[10px] font-bold px-1.5 py-1 rounded-full border bg-transparent cursor-pointer appearance-none text-center transition-opacity disabled:opacity-40 ${rankStyle}`}
                  >
                    {GUILD_RANKS.map(r => <option key={r} value={r} className="bg-slate-900 text-white">{r}</option>)}
                  </select>

                  {/* Status — inline dropdown */}
                  <select
                    value={m.play_status ?? "Active PvE"}
                    disabled={isSavingStatus}
                    onChange={e => patchField(m.id, "play_status", e.target.value)}
                    className={`text-[10px] font-bold px-1.5 py-1 rounded-full border bg-transparent cursor-pointer appearance-none text-center transition-opacity disabled:opacity-40 ${statusStyle}`}
                  >
                    {PLAY_STATUSES.map(s => <option key={s} value={s} className="bg-slate-900 text-white">{s}</option>)}
                  </select>

                  <p className="text-slate-500 text-xs truncate">{tzLabel(m.timezone)}</p>

                  {/* Notes — truncated, full text on hover */}
                  <p
                    title={m.roster_notes ?? undefined}
                    className="text-slate-500 text-xs truncate cursor-default"
                  >
                    {m.roster_notes || <span className="text-slate-700">—</span>}
                  </p>

                  {/* Pencil — opens notes/details modal */}
                  <button
                    onClick={() => openNoteModal(m)}
                    title="Edit details & notes"
                    className="text-slate-600 hover:text-violet-400 transition-colors text-sm leading-none"
                  >
                    ✎
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes / details modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black text-white mb-4">{noteModal.username}</h3>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block mb-1">Family Name</label>
                <input value={mFamName} onChange={e => setMFamName(e.target.value)} placeholder="BDO family name" className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block mb-1">Discord</label>
                <input value={mDiscord} onChange={e => setMDiscord(e.target.value)} placeholder="Discord username" className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block mb-1">Notes</label>
                <textarea value={mNotes} onChange={e => setMNotes(e.target.value)} rows={3}
                  placeholder="Officer notes, comments…"
                  className={`${inp} resize-none`} />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={saveNoteModal} disabled={mSaving}
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-bold text-sm transition-colors">
                {mSaving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setNoteModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ── Class Emojis section ──────────────────────────────────────────────────────

type DiscordEmoji = { id: string; name: string; animated: boolean };

function emojiUrl(e: DiscordEmoji) {
  return `/api/discord/emoji-image/${e.id}${e.animated ? "?animated=1" : ""}`;
}
function emojiStr(e: DiscordEmoji) {
  return `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
}

// Visual emoji grid picker — same design as in Events.tsx
function EmojiSelectSettings({ value, emojis, onChange }: {
  value: string;
  emojis: DiscordEmoji[];
  onChange: (val: string) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const curId   = value.match(/:(\d+)>/)?.[1] ?? "";
  const cur     = emojis.find(e => e.id === curId);
  const filtered = search.trim()
    ? emojis.filter(e => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : emojis;

  if (emojis.length === 0) {
    return <input value={value} onChange={e => onChange(e.target.value)} placeholder="<:name:id>"
      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-sm w-36 focus:outline-none focus:border-violet-500 font-mono" />;
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" title={cur ? cur.name : "Pick emoji"}
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm border transition-colors
          ${open ? "bg-slate-700 border-violet-500" : "bg-slate-800 border-slate-700 hover:border-slate-500"}`}
      >
        {cur
          ? <img src={emojiUrl(cur)} alt={cur.name} className="w-5 h-5 object-contain" />
          : <span className="text-slate-500 text-xs px-0.5">emoji</span>
        }
        <span className="text-slate-500 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-violet-500" />
            {cur && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                className="text-[10px] px-2 py-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors whitespace-nowrap">
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
            {filtered.map(e => (
              <button key={e.id} type="button" title={e.name}
                onClick={() => { onChange(emojiStr(e)); setOpen(false); setSearch(""); }}
                className={`p-1 rounded-lg transition-colors ${e.id === curId ? "bg-violet-700/50 ring-1 ring-violet-500" : "hover:bg-slate-700"}`}
              >
                <img src={emojiUrl(e)} alt={e.name} className="w-6 h-6 object-contain" />
              </button>
            ))}
            {filtered.length === 0 && <p className="col-span-8 text-[11px] text-slate-500 text-center py-4">No emojis found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

type BdoClassRow = { class_name: string; emoji_id: string | null; emoji_name: string | null; animated: boolean };

function ClassEmojisSection() {
  const [bdoClasses, setBdoClasses]     = useState<BdoClassRow[]>([]);
  const [emojis, setEmojis]             = useState<Record<string, string>>({});
  const [guildEmojis, setGuildEmojis]   = useState<DiscordEmoji[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [classSearch, setClassSearch]   = useState("");
  const [newBdoName, setNewBdoName]     = useState("");
  const [newCustName, setNewCustName]   = useState("");
  const [newCustEmoji, setNewCustEmoji] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/bdo-classes").then(r => r.ok ? r.json() : []),
      apiFetch("/api/class-emojis").then(r => r.ok ? r.json() : {}),
      apiFetch("/api/discord/emojis").then(r => r.ok ? r.json() : []),
    ]).then(([bdo, emojiMap, guild]) => {
      setBdoClasses(Array.isArray(bdo) ? bdo : []);
      setEmojis(emojiMap && typeof emojiMap === "object" ? emojiMap : {});
      setGuildEmojis(
        (Array.isArray(guild) ? guild : [])
          .filter((e: any) => e.id && e.name)
          .sort((a: DiscordEmoji, b: DiscordEmoji) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveEmojis() {
    setSaving(true);
    const res = await apiFetch("/api/class-emojis", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emojis),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    setSaving(false);
  }

  function setClassEmoji(cls: string, val: string) {
    setEmojis(prev => val ? { ...prev, [cls]: val } : (({ [cls]: _removed, ...rest }) => rest)(prev));
  }

  async function addBdoClass() {
    const name = newBdoName.trim();
    if (!name) return;
    const res = await apiFetch("/api/bdo-classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const row = await res.json();
      setBdoClasses(prev => [...prev, row].sort((a, b) => a.class_name.localeCompare(b.class_name)));
      setNewBdoName("");
    }
  }

  async function removeBdoClass(name: string) {
    if (!confirm(`Remove "${name}" from the BDO class list?`)) return;
    await apiFetch(`/api/bdo-classes/${encodeURIComponent(name)}`, { method: "DELETE" });
    setBdoClasses(prev => prev.filter(c => c.class_name !== name));
    setEmojis(prev => (({ [name]: _removed, ...rest }) => rest)(prev));
  }

  function addCustom() {
    const name = newCustName.trim();
    if (!name) return;
    setEmojis(prev => ({ ...prev, [name]: newCustEmoji }));
    setNewCustName(""); setNewCustEmoji("");
  }

  function removeCustom(cls: string) {
    setEmojis(prev => (({ [cls]: _removed, ...rest }) => rest)(prev));
  }

  const bdoNames      = useMemo(() => new Set(bdoClasses.map(c => c.class_name)), [bdoClasses]);
  const customEntries = useMemo(() => Object.keys(emojis).filter(k => !bdoNames.has(k)).sort(), [emojis, bdoNames]);
  const filteredBdo   = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    return q ? bdoClasses.filter(c => c.class_name.toLowerCase().includes(q)) : bdoClasses;
  }, [bdoClasses, classSearch]);

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black text-white">Class Emojis</h2>
          <p className="text-slate-500 text-sm mt-0.5">Assign Discord emojis to classes. Used on the wheel and in event signups.</p>
        </div>
        <button onClick={saveEmojis} disabled={saving}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${saved ? "bg-green-600/20 text-green-400 border border-green-500/30" : "bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white"}`}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Emojis"}
        </button>
      </div>

      {loading ? <p className="text-slate-500 text-center py-12">Loading…</p> : (
        <>
          {/* BDO Classes */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">BDO Classes</h3>
              <input value={classSearch} onChange={e => setClassSearch(e.target.value)}
                placeholder="Filter…"
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-32" />
              <span className="text-xs text-slate-600">{bdoClasses.length} classes</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {filteredBdo.map(cls => (
                <div key={cls.class_name} className="flex items-center gap-2 bg-slate-900/40 rounded-lg px-3 py-2">
                  <span className="text-sm text-slate-300 flex-1 min-w-0 truncate">{cls.class_name}</span>
                  <EmojiSelectSettings value={emojis[cls.class_name] ?? ""} emojis={guildEmojis} onChange={v => setClassEmoji(cls.class_name, v)} />
                  <button onClick={() => removeBdoClass(cls.class_name)} title="Remove from BDO list"
                    className="text-slate-700 hover:text-red-400 transition-colors text-xs px-1 shrink-0">✕</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-700/50 rounded-xl p-3">
              <input value={newBdoName} onChange={e => setNewBdoName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBdoClass()}
                placeholder="New class name (e.g. NewClass)"
                className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-500" />
              <button onClick={addBdoClass} disabled={!newBdoName.trim()}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-xs font-semibold transition-colors whitespace-nowrap">
                + Add BDO Class
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">Adding a class here updates the wheel and Discord event signups instantly — no code changes needed.</p>
          </div>

          {/* Custom Entries */}
          <div>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-1">Custom Entries</h3>
            <p className="text-xs text-slate-500 mb-3">Non-class options for event roles — boat types, specs, etc.</p>
            {customEntries.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {customEntries.map(cls => (
                  <div key={cls} className="flex items-center gap-2 bg-slate-900/40 rounded-lg px-3 py-2">
                    <span className="text-sm text-slate-300 flex-1 min-w-0 truncate">{cls}</span>
                    <EmojiSelectSettings value={emojis[cls] ?? ""} emojis={guildEmojis} onChange={v => setClassEmoji(cls, v)} />
                    <button onClick={() => removeCustom(cls)} className="text-slate-600 hover:text-red-400 transition-colors text-xs px-1 shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-700/50 rounded-xl p-3">
              <input value={newCustName} onChange={e => setNewCustName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustom()}
                placeholder="Entry name (e.g. Carrack)"
                className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-500" />
              <EmojiSelectSettings value={newCustEmoji} emojis={guildEmojis} onChange={setNewCustEmoji} />
              <button onClick={addCustom} disabled={!newCustName.trim()}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-xs font-semibold transition-colors whitespace-nowrap">
                + Add
              </button>
            </div>
          </div>
        </>
      )}

      {guildEmojis.length === 0 && !loading && (
        <p className="text-slate-600 text-xs mt-3">
          No custom emojis found in the server. Check that <code>DISCORD_GUILD_ID</code> and <code>DISCORD_BOT_TOKEN</code> are set.
        </p>
      )}
    </div>
  );
}

// ── BoopBot Lore section ───────────────────────────────────────────────────────

type BrainLoreEntry = { id: string; text: string };
type LoreMember = {
  id: string; username: string;
  discord_id: string | null; discord_username: string | null;
  family_name: string | null;
};

function LoreList({
  entries, loading, error, filter, setFilter, onAdd, newText, setNewText, adding,
  editingId, editText, setEditText, savingEdit, onStartEdit, onSaveEdit, onCancelEdit, onDelete, busyId,
  emptyLabel,
}: {
  entries: BrainLoreEntry[];
  loading: boolean;
  error: string | null;
  filter: string;
  setFilter: (v: string) => void;
  onAdd: () => void;
  newText: string;
  setNewText: (v: string) => void;
  adding: boolean;
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  savingEdit: boolean;
  onStartEdit: (entry: BrainLoreEntry) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  busyId: string | null;
  emptyLabel: string;
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? entries.filter(e => e.text.toLowerCase().includes(q)) : entries;
  }, [entries, filter]);

  if (loading) return <p className="text-slate-500 text-center py-8">Loading…</p>;
  if (error) return <p className="text-red-400 text-sm py-4">{error}</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filter…"
          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-40" />
        <span className="text-xs text-slate-600">{filtered.length} of {entries.length}</span>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {filtered.map(entry => (
          <div key={entry.id} className="bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
            {editingId === entry.id ? (
              <div className="flex flex-col gap-2">
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-500 resize-y" />
                <div className="flex gap-2 justify-end">
                  <button onClick={onCancelEdit} className="text-xs text-slate-400 hover:text-white px-2 py-1">Cancel</button>
                  <button onClick={onSaveEdit} disabled={savingEdit || !editText.trim()}
                    className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-xs font-semibold">
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="text-sm text-slate-300 flex-1 min-w-0 whitespace-pre-wrap">{entry.text}</p>
                <button onClick={() => onStartEdit(entry)} disabled={busyId === entry.id}
                  className="text-slate-600 hover:text-violet-400 transition-colors text-xs px-1 shrink-0">✎</button>
                <button onClick={() => onDelete(entry.id)} disabled={busyId === entry.id}
                  className="text-slate-600 hover:text-red-400 transition-colors text-xs px-1 shrink-0">✕</button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-slate-600 text-xs py-2">{emptyLabel}</p>}
      </div>

      <div className="flex items-start gap-2 bg-slate-900/40 border border-slate-700/50 rounded-xl p-3">
        <textarea value={newText} onChange={e => setNewText(e.target.value)} rows={2}
          placeholder="Add new lore…"
          className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-500 resize-y" />
        <button onClick={onAdd} disabled={adding || !newText.trim()}
          className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-xs font-semibold transition-colors whitespace-nowrap self-end">
          {adding ? "Adding…" : "+ Add"}
        </button>
      </div>
    </div>
  );
}

function LoreSection({ me }: { me: AuthUser }) {
  const isAdmin = me.role === "admin";
  const [tab, setTab] = useState<"guild" | "personal">("guild");

  // guild tab state
  const [guildLore, setGuildLore]       = useState<BrainLoreEntry[]>([]);
  const [guildLoading, setGuildLoading] = useState(true);
  const [guildError, setGuildError]     = useState<string | null>(null);
  const [guildFilter, setGuildFilter]   = useState("");
  const [newGuildText, setNewGuildText] = useState("");
  const [addingGuild, setAddingGuild]   = useState(false);

  // shared edit/delete state (one active edit at a time, across both tabs)
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editText, setEditText]     = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId]         = useState<string | null>(null);

  // personal tab state
  const [members, setMembers]                 = useState<LoreMember[]>([]);
  const [membersLoading, setMembersLoading]    = useState(true);
  const [memberFilter, setMemberFilter]        = useState("");
  const [selectedMember, setSelectedMember]    = useState<LoreMember | null>(null);
  const [personalLore, setPersonalLore]        = useState<BrainLoreEntry[]>([]);
  const [personalLoading, setPersonalLoading]  = useState(false);
  const [personalError, setPersonalError]      = useState<string | null>(null);
  const [personalFilter, setPersonalFilter]    = useState("");
  const [newPersonalText, setNewPersonalText]  = useState("");
  const [addingPersonal, setAddingPersonal]    = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    setGuildLoading(true);
    setGuildError(null);
    apiFetch("/api/brain-lore/guild")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setGuildLore)
      .catch(() => setGuildError("Could not reach BoopBot's brain — check that the AI server / WireGuard tunnel is up."))
      .finally(() => setGuildLoading(false));

    setMembersLoading(true);
    apiFetch("/api/members")
      .then(r => r.ok ? r.json() : [])
      .then((rows: LoreMember[]) => setMembers(rows.filter(m => m.discord_id)))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [isAdmin]);

  function loadPersonalLore(discordId: string) {
    setPersonalLoading(true);
    setPersonalError(null);
    apiFetch(`/api/brain-lore/user/${discordId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setPersonalLore)
      .catch(() => setPersonalError("Could not reach BoopBot's brain — check that the AI server / WireGuard tunnel is up."))
      .finally(() => setPersonalLoading(false));
  }

  function selectMember(m: LoreMember) {
    setSelectedMember(m);
    setPersonalLore([]);
    setPersonalError(null);
    if (m.discord_id) loadPersonalLore(m.discord_id);
  }

  async function addGuildLore() {
    const text = newGuildText.trim();
    if (!text) return;
    setAddingGuild(true);
    const res = await apiFetch("/api/brain-lore/guild", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const { id } = await res.json();
      setGuildLore(prev => [...prev, { id, text }]);
      setNewGuildText("");
    }
    setAddingGuild(false);
  }

  async function addPersonalLore() {
    const text = newPersonalText.trim();
    if (!text || !selectedMember?.discord_id) return;
    setAddingPersonal(true);
    const res = await apiFetch(`/api/brain-lore/user/${selectedMember.discord_id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const { id } = await res.json();
      setPersonalLore(prev => [...prev, { id, text }]);
      setNewPersonalText("");
    }
    setAddingPersonal(false);
  }

  function startEdit(entry: BrainLoreEntry) {
    setEditingId(entry.id);
    setEditText(entry.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit() {
    if (!editingId || !editText.trim()) return;
    const text = editText.trim();
    setSavingEdit(true);
    const res = await apiFetch(`/api/brain-lore/${editingId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const patch = (list: BrainLoreEntry[]) => list.map(e => e.id === editingId ? { ...e, text } : e);
      setGuildLore(patch);
      setPersonalLore(patch);
      cancelEdit();
    }
    setSavingEdit(false);
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this lore entry?")) return;
    setBusyId(id);
    const res = await apiFetch(`/api/brain-lore/${id}`, { method: "DELETE" });
    if (res.ok) {
      setGuildLore(prev => prev.filter(e => e.id !== id));
      setPersonalLore(prev => prev.filter(e => e.id !== id));
    }
    setBusyId(null);
  }

  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      m.username.toLowerCase().includes(q) ||
      (m.discord_username ?? "").toLowerCase().includes(q) ||
      (m.family_name ?? "").toLowerCase().includes(q)
    );
  }, [members, memberFilter]);

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-white font-bold text-lg">Admins only</p>
        <p className="text-slate-500 mt-2 text-sm">BoopBot lore management requires the admin role.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-black text-white">BoopBot Lore</h2>
        <p className="text-slate-500 text-sm mt-0.5">Long-term memory the bot draws on when chatting — guild-wide knowledge and per-member facts.</p>
      </div>

      <div className="flex gap-2 mb-5 border-b border-slate-800">
        <button onClick={() => setTab("guild")}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "guild" ? "border-violet-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
          Guild Lore
        </button>
        <button onClick={() => setTab("personal")}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "personal" ? "border-violet-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
          Personal Facts
        </button>
      </div>

      {tab === "guild" ? (
        <LoreList
          entries={guildLore} loading={guildLoading} error={guildError}
          filter={guildFilter} setFilter={setGuildFilter}
          onAdd={addGuildLore} newText={newGuildText} setNewText={setNewGuildText} adding={addingGuild}
          editingId={editingId} editText={editText} setEditText={setEditText} savingEdit={savingEdit}
          onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={cancelEdit} onDelete={deleteEntry} busyId={busyId}
          emptyLabel="No guild lore yet."
        />
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <input value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
              placeholder="Search members…"
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-48" />
            <span className="text-xs text-slate-600">{membersLoading ? "Loading…" : `${filteredMembers.length} members`}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-5 max-h-32 overflow-y-auto">
            {filteredMembers.map(m => (
              <button key={m.id} onClick={() => selectMember(m)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  selectedMember?.id === m.id ? "bg-violet-600 text-white" : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800"
                }`}>
                {m.discord_username ?? m.username}
              </button>
            ))}
          </div>

          {selectedMember ? (
            <LoreList
              entries={personalLore} loading={personalLoading} error={personalError}
              filter={personalFilter} setFilter={setPersonalFilter}
              onAdd={addPersonalLore} newText={newPersonalText} setNewText={setNewPersonalText} adding={addingPersonal}
              editingId={editingId} editText={editText} setEditText={setEditText} savingEdit={savingEdit}
              onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={cancelEdit} onDelete={deleteEntry} busyId={busyId}
              emptyLabel={`No personal facts for ${selectedMember.discord_username ?? selectedMember.username} yet.`}
            />
          ) : (
            <p className="text-slate-600 text-sm py-8 text-center">Select a member above to view/edit their personal facts.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

const VALID_SECTIONS: SectionId[] = ["members", "roster", "announcements", "wall", "shrine", "directory", "payout", "class-emojis", "lore"];

function getSectionFromHash(): SectionId {
  const sub = location.hash.replace(/^#\/?/, "").split("/")[1] ?? "";
  return VALID_SECTIONS.includes(sub as SectionId) ? (sub as SectionId) : "members";
}

export default function Settings() {
  const user = useAuth();
  const [section, setSection] = useState<SectionId>(getSectionFromHash);

  // Keep section in sync with back/forward navigation within #/manage/*
  useEffect(() => {
    const onHash = () => setSection(getSectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(id: SectionId) {
    history.replaceState(null, "", `#/manage/${id}`);
    setSection(id);
  }

  if (!user || !isOfficerOrAdmin(user)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-white font-bold text-lg">Officers only</p>
          <p className="text-slate-500 mt-2 text-sm">You need officer or admin permissions to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">

      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-slate-800/60 pt-8 pb-8 flex flex-col gap-6">
        <div className="px-4">
          <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-0.5">Settings</p>
        </div>

        {SIDEBAR.map(group => (
          <div key={group.group}>
            <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">
              {group.group}
            </p>
            {group.items
              .filter(item => !("adminOnly" in item && item.adminOnly) || user.role === "admin")
              .map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  section === item.id
                    ? "bg-slate-800/80 text-white border-r-2 border-violet-500"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold leading-none ${section === item.id ? "text-white" : ""}`}>{item.label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ── Content ── */}
      <div className="flex-1 min-w-0 px-8 py-8 max-w-4xl">
        {section === "members"       && <MembersSection me={user} />}
        {section === "roster"        && <RosterSection />}
        {section === "announcements" && <AnnouncementsSection />}
        {section === "wall"          && <WallSection />}
        {section === "shrine"        && <ShrineSection />}
        {section === "directory"     && <GuildDirectory />}
        {section === "payout"        && <PayoutTracker />}
        {section === "class-emojis"  && <ClassEmojisSection />}
        {section === "lore"          && <LoreSection me={user} />}
      </div>
    </div>
  );
}
