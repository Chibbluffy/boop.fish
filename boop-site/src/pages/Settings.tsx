import React, { useEffect, useState } from "react";
import { useAuth, isOfficerOrAdmin, AuthUser } from "../lib/auth";
import ShrineSection from "./ShrineSection";

type SectionId = "members" | "announcements" | "wall" | "shrine";

const SIDEBAR = [
  {
    group: "Roster",
    items: [
      { id: "members" as SectionId, label: "Members", icon: "👥", desc: "Roles & ribbits" },
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
      { id: "shrine" as SectionId, label: "Black Shrine", icon: "⛩️", desc: "Team builder" },
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
  pending: "bg-slate-800/80 text-slate-500 border border-slate-700/50",
};

// ── Members section ───────────────────────────────────────────────────────────

type Member = {
  id: string; username: string; email: string | null;
  role: "pending" | "member" | "officer" | "admin";
  character_name: string | null; ribbit_count: number; created_at: string;
};

function MembersSection({ me }: { me: AuthUser }) {
  const [members, setMembers]       = useState<Member[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updating, setUpdating]     = useState<string | null>(null);
  const [resetting, setResetting]   = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
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

  const counts = members.reduce((a, m) => { a[m.role] = (a[m.role] ?? 0) + 1; return a; }, {} as Record<string, number>);

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
          <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-widest">
            <span className="w-8" />
            <span>Username</span>
            <span>Character</span>
            <span>Joined</span>
            <span title="Ribbit count">🐸</span>
            <span>Role</span>
          </div>

          {members.map((m, i) => {
            const isMe = m.id === me.id;
            const canEdit = !isMe && (me.role === "admin" || ["pending", "member"].includes(m.role));
            return (
              <div key={m.id}
                className={`grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-slate-800/30 transition-colors ${
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
                  <p className="font-semibold text-white truncate">
                    {m.username}{isMe && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                  </p>
                  {m.email && <p className="text-xs text-slate-600 truncate">{m.email}</p>}
                </div>

                <p className="text-sm text-slate-400 truncate">{m.character_name ?? "—"}</p>

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
                      <option value="member">member</option>
                      <option value="officer">officer</option>
                      {me.role === "admin" && <option value="admin">admin</option>}
                    </select>
                  ) : (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${ROLE_STYLE[m.role]}`}>
                      {m.role}
                    </span>
                  )}
                </div>
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

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const user = useAuth();
  const [section, setSection] = useState<SectionId>("members");

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
                onClick={() => setSection(item.id)}
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
        {section === "announcements" && <AnnouncementsSection />}
        {section === "wall"          && <WallSection />}
        {section === "shrine"        && <ShrineSection />}
      </div>
    </div>
  );
}
