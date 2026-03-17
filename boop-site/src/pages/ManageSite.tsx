import React, { useEffect, useState } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  author: string | null;
  created_at: string;
};

type WallEntry = {
  id: string;
  title: string;
  description: string | null;
  author: string | null;
  created_at: string;
};

type Tab = "announcements" | "wall";

function token() {
  return localStorage.getItem("boop_session") ?? "";
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}` };
}

// ── Announcements Tab ─────────────────────────────────────────────────────────

function AnnouncementsTab() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // New form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, pinned }),
    });
    if (res.ok) {
      const row = await res.json();
      setItems(prev => [{ ...row, author: null }, ...prev]);
      setTitle(""); setBody(""); setPinned(false);
    }
    setSaving(false);
  }

  async function remove(id: string) {
    await fetch(`/api/announcements/${id}`, { method: "DELETE", headers: authHeaders() });
    setItems(prev => prev.filter(a => a.id !== id));
    if (editId === id) setEditId(null);
  }

  function startEdit(a: Announcement) {
    setEditId(a.id);
    setEditTitle(a.title);
    setEditBody(a.body ?? "");
    setEditPinned(a.pinned);
  }

  async function saveEdit() {
    if (!editId || !editTitle.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/announcements/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() || null, pinned: editPinned }),
    });
    if (res.ok) {
      const row = await res.json();
      setItems(prev => prev.map(a => a.id === editId ? { ...a, ...row } : a));
      setEditId(null);
    }
    setEditSaving(false);
  }

  const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors";

  return (
    <div className="flex flex-col gap-6">
      {/* Add form */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <h3 className="font-black text-white mb-4">New Announcement</h3>
        <div className="flex flex-col gap-3">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            className={inputCls}
          />
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Body (optional)"
            rows={3}
            className={`${inputCls} resize-none`}
          />
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={e => setPinned(e.target.checked)}
              className="accent-violet-500 w-4 h-4"
            />
            Pin to top
          </label>
          <button
            onClick={add}
            disabled={!title.trim() || saving}
            className="self-start px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
          >
            {saving ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-slate-600 text-center py-8">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-600 text-center py-8">No announcements yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(a => (
            <div key={a.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              {editId === a.id ? (
                <div className="flex flex-col gap-3">
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={inputCls} />
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                    <input type="checkbox" checked={editPinned} onChange={e => setEditPinned(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                    Pin to top
                  </label>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={!editTitle.trim() || editSaving}
                      className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm font-bold transition-colors">
                      {editSaving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {a.pinned && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                          Pinned
                        </span>
                      )}
                      <p className="font-bold text-white truncate">{a.title}</p>
                    </div>
                    {a.body && <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">{a.body}</p>}
                    <p className="text-xs text-slate-600 mt-1">
                      {a.author && <>{a.author} · </>}{new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <button onClick={() => startEdit(a)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => remove(a.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-red-400 hover:bg-slate-800 transition-colors">
                      Delete
                    </button>
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

// ── Wall of Shame Tab ─────────────────────────────────────────────────────────

function WallTab() {
  const [items, setItems] = useState<WallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/wall")
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/wall", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
    });
    if (res.ok) {
      const row = await res.json();
      setItems(prev => [{ ...row, author: null }, ...prev]);
      setTitle(""); setDescription("");
    }
    setSaving(false);
  }

  async function remove(id: string) {
    await fetch(`/api/wall/${id}`, { method: "DELETE", headers: authHeaders() });
    setItems(prev => prev.filter(w => w.id !== id));
  }

  const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors";

  return (
    <div className="flex flex-col gap-6">
      {/* Add form */}
      <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-5">
        <h3 className="font-black text-white mb-1">New Wall Post</h3>
        <p className="text-xs text-slate-600 mb-4">Post a dramatic troll message for the guild to behold.</p>
        <div className="flex flex-col gap-3">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Headline (make it count)"
            className={inputCls}
          />
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="The full story... (optional)"
            rows={3}
            className={`${inputCls} resize-none`}
          />
          <button
            onClick={add}
            disabled={!title.trim() || saving}
            className="self-start px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
          >
            {saving ? "Posting..." : "🔥 Post to Wall"}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-slate-600 text-center py-8">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-600 text-center py-8">No posts yet. Someone must've been on their best behavior.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(w => (
            <div key={w.id} className="flex items-start gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white">{w.title}</p>
                {w.description && <p className="text-sm text-slate-400 mt-1 leading-relaxed line-clamp-2">{w.description}</p>}
                <p className="text-xs text-slate-600 mt-1">
                  {w.author && <>{w.author} · </>}{new Date(w.created_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => remove(w.id)}
                className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-red-400 hover:bg-slate-800 transition-colors">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManageSite() {
  const user = useAuth();
  const [tab, setTab] = useState<Tab>("announcements");

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
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h2 className="text-4xl font-black tracking-tight text-white">Manage Site</h2>
          <p className="text-slate-500 mt-1 text-sm">Control what the guild sees on the homepage and wall.</p>
        </div>

        {/* Tab bar */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit gap-1">
          <button
            onClick={() => setTab("announcements")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "announcements" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}
          >
            📢 Announcements
          </button>
          <button
            onClick={() => setTab("wall")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "wall" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}
          >
            🔥 Wall of Shame
          </button>
        </div>

        {tab === "announcements" && <AnnouncementsTab />}
        {tab === "wall" && <WallTab />}
      </div>
    </div>
  );
}
