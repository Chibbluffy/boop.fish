import React, { useEffect, useState, useRef } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";

type WallEntry = {
  id: string;
  title: string;
  description: string | null;
  image_path: string | null;
  author: string | null;
  created_at: string;
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Cycle through dramatic troll flavors for each card
const CARD_ACCENTS = [
  { border: "border-red-500/30", glow: "bg-red-500/5", badge: "bg-red-500/20 text-red-400 border-red-500/30", icon: "🔥" },
  { border: "border-amber-500/30", glow: "bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: "💀" },
  { border: "border-violet-500/30", glow: "bg-violet-500/5", badge: "bg-violet-500/20 text-violet-400 border-violet-500/30", icon: "👀" },
  { border: "border-pink-500/30", glow: "bg-pink-500/5", badge: "bg-pink-500/20 text-pink-400 border-pink-500/30", icon: "🐟" },
  { border: "border-cyan-500/30", glow: "bg-cyan-500/5", badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: "🤡" },
];

export default function WallOfShame() {
  const user = useAuth();
  const isOfficer = isOfficerOrAdmin(user);
  const canPost = user && user.role !== "pending";

  const [entries, setEntries] = useState<WallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Add entry form state
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/wall")
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function pickImage(file: File | null) {
    setNewImage(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function closeAdd() {
    setShowAdd(false);
    setNewTitle("");
    setNewDesc("");
    pickImage(null);
  }

  async function addEntry() {
    if (!newTitle.trim() || submitting) return;
    setSubmitting(true);
    const token = localStorage.getItem("boop_session");
    const form = new FormData();
    form.set("title", newTitle.trim());
    if (newDesc.trim()) form.set("description", newDesc.trim());
    if (newImage) form.set("image", newImage);
    const res = await fetch("/api/wall", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries(prev => [{ ...entry, author: user?.username ?? null }, ...prev]);
      closeAdd();
    }
    setSubmitting(false);
  }

  async function deleteEntry(id: string) {
    const token = localStorage.getItem("boop_session");
    await fetch(`/api/wall/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest mb-4">
            ⚠️ Official Guild Bulletin
          </div>
          <h2 className="text-5xl font-black tracking-tight text-white mb-2">
            Wall of <span className="text-red-400">Shame</span>
          </h2>
          <p className="text-slate-500 text-sm">
            Curated dispatches from the boop officers. Accuracy not guaranteed. Dignity not included.
          </p>
          {canPost && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-5 px-5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-sm font-bold transition-colors"
            >
              + Post Entry
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-center text-slate-600 py-20">Loading...</p>
        ) : entries.length === 0 ? (
          <div className="text-center py-24 text-slate-600">
            <p className="text-5xl mb-4">📭</p>
            <p className="font-semibold text-slate-500">Nothing to report.</p>
            <p className="text-sm mt-1">For now, everyone is safe. Don't get comfortable.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((entry, i) => {
              const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
              return (
                <div
                  key={entry.id}
                  className={`relative rounded-2xl border ${accent.border} ${accent.glow} bg-slate-900/60 p-5 overflow-hidden`}
                >
                  {/* Subtle corner watermark */}
                  <span className="absolute top-3 right-4 text-3xl opacity-10 select-none pointer-events-none">
                    {accent.icon}
                  </span>

                  {/* Badge + meta row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${accent.badge}`}>
                      {accent.icon} Official Statement
                    </span>
                    <span className="text-xs text-slate-600">
                      {entry.author && <>{entry.author} · </>}{timeAgo(entry.created_at)}
                    </span>
                    {isOfficer && (
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        title="Delete"
                        className="ml-auto text-slate-700 hover:text-red-400 transition-colors text-sm leading-none"
                      >✕</button>
                    )}
                  </div>

                  {/* Content row — shifts left when image present */}
                  <div className="flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-white leading-snug mb-2">
                        {entry.title}
                      </h3>
                      {entry.description && (
                        <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                          {entry.description}
                        </p>
                      )}
                    </div>

                    {entry.image_path && (
                      <button
                        onClick={() => setLightbox(entry.image_path!)}
                        className="shrink-0 w-28 h-28 sm:w-36 sm:h-36 rounded-xl overflow-hidden border border-slate-700/60 hover:border-slate-500 transition-colors"
                      >
                        <img
                          src={entry.image_path}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors"
          >✕</button>
        </div>
      )}

      {/* ── Add Entry Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeAdd}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-white mb-5">New Wall Entry</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Title</label>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="The crime committed"
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-red-500/60 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                  Details <span className="normal-case text-slate-600 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Witness testimony, context, receipts..."
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-red-500/60 transition-colors resize-none"
                />
              </div>

              {/* Image picker */}
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                  Evidence <span className="normal-case text-slate-600 font-normal">(optional image)</span>
                </label>
                {preview ? (
                  <div className="relative w-full rounded-xl overflow-hidden border border-slate-700">
                    <img src={preview} alt="" className="w-full max-h-48 object-cover" />
                    <button
                      onClick={() => pickImage(null)}
                      className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-slate-900/80 text-white hover:bg-red-600/80 transition-colors text-xs"
                    >✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 rounded-xl border border-dashed border-slate-700 hover:border-red-500/40 text-slate-500 hover:text-slate-300 text-sm transition-colors"
                  >
                    Click to attach image
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => pickImage(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={addEntry}
                disabled={!newTitle.trim() || submitting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
              >
                {submitting ? "Posting..." : "Post Entry"}
              </button>
              <button
                onClick={closeAdd}
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
