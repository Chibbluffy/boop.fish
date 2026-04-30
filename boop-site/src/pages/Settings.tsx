import React, { useEffect, useState } from "react";
import { useAuth, isOfficerOrAdmin, AuthUser } from "../lib/auth";
import ShrineSection from "./ShrineSection";
import GuildDirectory from "./GuildDirectory";
import PayoutTracker from "./PayoutTracker";
import { TIMEZONES } from "../lib/timezones";

type SectionId = "members" | "roster" | "announcements" | "wall" | "shrine" | "directory" | "payout" | "class-emojis";

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

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

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
    fetch("/api/members", { headers: authH() })
      .then(r => r.json())
      .then(d => { setMembers(d); setLoading(false); })
      .catch(() => { setError("Failed to load members."); setLoading(false); });
  }, []);

  async function changeRole(id: string, role: string) {
    setUpdating(id);
    const res = await fetch(`/api/members/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
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
    const res = await fetch(`/api/members/${id}/ribbits/reset`, { method: "POST", headers: authH() });
    if (res.ok) setMembers(prev => prev.map(m => m.id === id ? { ...m, ribbit_count: 0 } : m));
    setResetting(null);
  }

  async function resetAllRibbits() {
    if (!confirm("Reset ALL members' ribbit counts to 0?")) return;
    setResettingAll(true);
    const res = await fetch("/api/members/ribbits/reset-all", { method: "POST", headers: authH() });
    if (res.ok) setMembers(prev => prev.map(m => ({ ...m, ribbit_count: 0 })));
    setResettingAll(false);
  }

  async function deleteAccount(id: string, username: string) {
    if (!confirm(`Delete account "${username}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/members/${id}`, { method: "DELETE", headers: authH() });
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
    fetch("/api/announcements").then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, pinned }),
    });
    if (res.ok) { const row = await res.json(); setItems(prev => [{ ...row, author: null }, ...prev]); setTitle(""); setBody(""); setPinned(false); }
    setSaving(false);
  }

  async function remove(id: string) {
    await fetch(`/api/announcements/${id}`, { method: "DELETE", headers: authH() });
    setItems(prev => prev.filter(a => a.id !== id));
    if (editId === id) setEditId(null);
  }

  function startEdit(a: Announcement) { setEditId(a.id); setEditTitle(a.title); setEditBody(a.body ?? ""); setEditPinned(a.pinned); }

  async function saveEdit() {
    if (!editId || !editTitle.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/announcements/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
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
    fetch("/api/wall").then(r => r.json()).then(d => { setItems(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function remove(id: string) {
    await fetch(`/api/wall/${id}`, { method: "DELETE", headers: authH() });
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
    fetch("/api/roster", { headers: authH() })
      .then(r => r.json())
      .then(d => { setMembers(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function patchField(id: string, field: string, value: string | null) {
    setSavingField(`${id}:${field}`);
    const res = await fetch(`/api/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
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
    const res = await fetch(`/api/roster/${noteModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authH() },
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

const BDO_CLASSES = [
  "Warrior","Sorceress","Ranger","Berserker","Tamer","Musa","Maehwa",
  "Valkyrie","Kunoichi","Ninja","Wizard","Witch","Dark Knight","Striker",
  "Mystic","Lahn","Archer","Shai","Guardian","Hashashin","Nova","Sage",
  "Corsair","Drakania","Woosa","Maegu","Scholar","Dosa","Deadeye","Legionary","Spiritborn",
];

type DiscordEmoji = { id: string; name: string; animated: boolean };

function emojiUrl(e: DiscordEmoji) {
  return `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "webp"}?size=32`;
}
function emojiStr(e: DiscordEmoji) {
  return `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
}

function ClassEmojisSection() {
  const [emojis, setEmojis]           = useState<Record<string, string>>({});
  const [guildEmojis, setGuildEmojis] = useState<DiscordEmoji[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [search, setSearch]           = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/class-emojis", { headers: authH() }).then(r => r.json()),
      fetch("/api/discord/emojis", { headers: authH() }).then(r => r.json()),
    ]).then(([saved, guild]) => {
      setEmojis(saved);
      setGuildEmojis(
        (Array.isArray(guild) ? guild : [])
          .filter((e: any) => e.id && e.name)
          .sort((a: DiscordEmoji, b: DiscordEmoji) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveAll() {
    setSaving(true);
    const res = await fetch("/api/class-emojis", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authH() },
      body: JSON.stringify(emojis),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    setSaving(false);
  }

  function assign(cls: string, emojiId: string) {
    if (!emojiId) {
      setEmojis(prev => { const n = { ...prev }; delete n[cls]; return n; });
      return;
    }
    const e = guildEmojis.find(e => e.id === emojiId);
    if (e) setEmojis(prev => ({ ...prev, [cls]: emojiStr(e) }));
  }

  // Find which emoji is currently assigned to a class
  function assignedId(cls: string): string {
    const val = emojis[cls] ?? "";
    const m = val.match(/:(\d+)>/);
    return m ? m[1] : "";
  }

  const filtered = search.trim()
    ? guildEmojis.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : guildEmojis;

  const sel = "w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors";

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black text-white">Class Emojis</h2>
          <p className="text-slate-500 text-sm mt-0.5">Map BDO classes to Discord custom emojis for event embeds.</p>
        </div>
        <button onClick={saveAll} disabled={saving}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${saved ? "bg-green-600/20 text-green-400 border border-green-500/30" : "bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white"}`}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save All"}
        </button>
      </div>

      {guildEmojis.length > 8 && (
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter emojis by name…"
          className="mb-4 w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500"
        />
      )}

      {loading ? <p className="text-slate-500 text-center py-12">Loading…</p> : (
        <div className="grid grid-cols-2 gap-3">
          {BDO_CLASSES.map(cls => {
            const curId = assignedId(cls);
            const curEmoji = guildEmojis.find(e => e.id === curId);
            return (
              <div key={cls} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 w-32 shrink-0">{cls}</span>
                {/* Preview */}
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  {curEmoji ? (
                    <img src={emojiUrl(curEmoji)} alt={curEmoji.name} className="w-7 h-7 object-contain rounded" />
                  ) : (
                    <span className="text-slate-700 text-lg">—</span>
                  )}
                </div>
                {guildEmojis.length > 0 ? (
                  <select value={curId} onChange={e => assign(cls, e.target.value)} className={sel}>
                    <option value="">— none —</option>
                    {filtered.map(e => (
                      <option key={e.id} value={e.id}>{e.animated ? "[GIF] " : ""}{e.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={emojis[cls] ?? ""}
                    onChange={e => setEmojis(prev => ({ ...prev, [cls]: e.target.value }))}
                    placeholder="<:name:id>"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {guildEmojis.length === 0 && !loading && (
        <p className="text-slate-600 text-xs mt-3">
          No custom emojis found in the server. Check that <code>DISCORD_GUILD_ID</code> and <code>DISCORD_BOT_TOKEN</code> are set.
        </p>
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

const VALID_SECTIONS: SectionId[] = ["members", "roster", "announcements", "wall", "shrine", "directory", "payout", "class-emojis"];

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
            {group.items.map(item => (
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
      </div>
    </div>
  );
}
