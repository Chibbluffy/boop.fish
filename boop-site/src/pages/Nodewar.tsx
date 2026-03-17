import React, { useEffect, useRef, useState } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";

type NodewarEntry = {
  id: string;
  title: string | null;
  node_name: string | null;
  event_date: string;
  result: "win" | "loss" | "draw" | null;
  notes: string | null;
  images: string[];
};

const RESULT_STYLE: Record<string, string> = {
  win:  "bg-green-500/20 text-green-400 border border-green-500/30",
  loss: "bg-red-500/20 text-red-400 border border-red-500/30",
  draw: "bg-slate-700/50 text-slate-400 border border-slate-700",
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

export default function Nodewar() {
  const user = useAuth();
  const isOfficer = isOfficerOrAdmin(user);

  const [entries, setEntries] = useState<NodewarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form state
  const [upDate, setUpDate] = useState(new Date().toISOString().slice(0, 10));
  const [upTitle, setUpTitle] = useState("");
  const [upNode, setUpNode] = useState("");
  const [upResult, setUpResult] = useState("");
  const [upNotes, setUpNotes] = useState("");
  const [upFiles, setUpFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = localStorage.getItem("boop_session");

  useEffect(() => {
    if (!user || user.role === "pending") return;
    fetch("/api/nodewar", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  // Auto-select most recent entry
  useEffect(() => {
    if (entries.length && !selectedId) setSelectedId(entries[0].id);
  }, [entries]);

  async function upload() {
    if (!upFiles?.length) return;
    setUploading(true);
    const form = new FormData();
    form.append("event_date", upDate);
    if (upTitle) form.append("title", upTitle);
    if (upNode)  form.append("node_name", upNode);
    if (upResult) form.append("result", upResult);
    if (upNotes) form.append("notes", upNotes);
    for (const f of Array.from(upFiles)) form.append("images", f);

    const res = await fetch("/api/nodewar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      // Reload entries
      const data = await fetch("/api/nodewar", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setEntries(data);
      setShowUpload(false);
      setUpTitle(""); setUpNode(""); setUpResult(""); setUpNotes(""); setUpFiles(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    setUploading(false);
  }

  // ── Access gate ──────────────────────────────────────────────────────────────
  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">⚔️</p>
          <p className="text-white font-bold text-lg">Members only</p>
          <p className="text-slate-500 mt-2 text-sm">
            {!user ? "Sign in to view nodewar stats." : "Your account is pending approval."}
          </p>
        </div>
      </div>
    );
  }

  const recentEntries = entries.filter(e => e.event_date >= THIRTY_DAYS_AGO);
  const olderEntries  = entries.filter(e => e.event_date < THIRTY_DAYS_AGO);
  const visibleEntries = showAll ? entries : recentEntries;
  const selected = entries.find(e => e.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-4xl font-black tracking-tight text-white">Nodewar</h2>
            <p className="text-slate-400 mt-1">Guild nodewar history and screenshots.</p>
          </div>
          {isOfficer && (
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              + Upload Stats
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-slate-500 text-center py-20">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-slate-600 text-center py-20">No nodewar entries yet.</p>
        ) : (
          <div className="flex gap-6">

            {/* ── Date sidebar ── */}
            <div className="w-52 shrink-0 flex flex-col gap-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-2 mb-1">
                {showAll ? "All dates" : "Last 30 days"}
              </p>

              {visibleEntries.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    selectedId === e.id
                      ? "bg-slate-800 border-slate-600 text-white"
                      : "border-transparent text-slate-400 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  <p className="text-xs font-bold">{fmt(e.event_date)}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {e.result && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${RESULT_STYLE[e.result]}`}>
                        {e.result}
                      </span>
                    )}
                    {e.images.length > 0 && (
                      <span className="text-[10px] text-slate-600">{e.images.length} img</span>
                    )}
                  </div>
                </button>
              ))}

              {/* Show all / collapse */}
              {olderEntries.length > 0 && (
                <button
                  onClick={() => setShowAll(s => !s)}
                  className="mt-1 text-xs text-violet-400 hover:text-violet-300 transition-colors px-3 py-2 text-left"
                >
                  {showAll ? "↑ Show recent only" : `↓ Show all (${olderEntries.length} older)`}
                </button>
              )}
            </div>

            {/* ── Entry detail ── */}
            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  {/* Entry header */}
                  <div className="mb-4 flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-white">
                        {selected.title ?? fmt(selected.event_date)}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {selected.node_name && (
                          <span className="text-sm text-slate-400">{selected.node_name}</span>
                        )}
                        {selected.result && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${RESULT_STYLE[selected.result]}`}>
                            {selected.result.toUpperCase()}
                          </span>
                        )}
                        <span className="text-xs text-slate-600">{fmt(selected.event_date)}</span>
                      </div>
                      {selected.notes && (
                        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{selected.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Images */}
                  {selected.images.length === 0 ? (
                    <p className="text-slate-600 text-sm italic">No images uploaded for this entry.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {selected.images.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => setLightbox(src)}
                          className="aspect-video rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition-colors group"
                        >
                          <img
                            src={src}
                            alt={`nodewar-${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-600 text-sm">Select a date on the left.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="nodewar full" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 transition-colors">✕</button>
        </div>
      )}

      {/* ── Upload modal ── */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white mb-5">Upload Nodewar Stats</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Date</label>
                <input type="date" value={upDate} onChange={e => setUpDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Node name</label>
                  <input value={upNode} onChange={e => setUpNode(e.target.value)} placeholder="e.g. Heidel"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Result</label>
                  <select value={upResult} onChange={e => setUpResult(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors">
                    <option value="">—</option>
                    <option value="win">Win</option>
                    <option value="loss">Loss</option>
                    <option value="draw">Draw</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Title <span className="normal-case text-slate-600 font-normal">(optional)</span></label>
                <input value={upTitle} onChange={e => setUpTitle(e.target.value)} placeholder="e.g. Week 3 Siege"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors" />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Notes <span className="normal-case text-slate-600 font-normal">(optional)</span></label>
                <textarea value={upNotes} onChange={e => setUpNotes(e.target.value)} rows={2} placeholder="Recap, strategy notes..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Screenshots</label>
                <input ref={fileRef} type="file" multiple accept="image/*" onChange={e => setUpFiles(e.target.files)}
                  className="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200 file:text-xs file:font-semibold hover:file:bg-slate-600 cursor-pointer" />
                {upFiles && upFiles.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">{upFiles.length} file{upFiles.length > 1 ? "s" : ""} selected</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={upload}
                disabled={!upFiles?.length || uploading}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
              <button onClick={() => setShowUpload(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
