import React, { useState, useRef } from "react";
import { useAuth } from "../lib/auth";

export default function SubmitWall() {
  const user = useAuth();
  const [title, setTitle]   = useState("");
  const [desc, setDesc]     = useState("");
  const [image, setImage]   = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Access gate — must be logged in and not pending
  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-white font-bold text-lg">Members only</p>
          <p className="text-slate-500 mt-2 text-sm">
            {!user ? "Sign in to submit to the Wall of Shame." : "Your account is pending approval."}
          </p>
          {!user && <a href="#/auth" className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors">Sign in</a>}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-5xl mb-4">🔥</p>
          <p className="text-white font-black text-2xl mb-2">Posted!</p>
          <p className="text-slate-400 text-sm mb-6">Your entry has been added to the Wall of Shame.</p>
          <div className="flex gap-3 justify-center">
            <a href="#/wall" className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors">
              View Wall of Shame
            </a>
            <button onClick={() => { setDone(false); setTitle(""); setDesc(""); pickImage(null); }}
              className="px-5 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-bold text-sm transition-colors">
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  function pickImage(file: File | null) {
    setImage(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const token = localStorage.getItem("boop_session");
    const form = new FormData();
    form.set("title", title.trim());
    if (desc.trim()) form.set("description", desc.trim());
    if (image) form.set("image", image);
    const res = await fetch("/api/wall", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
    }
    setSaving(false);
  }

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-red-500/60 transition-colors";

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <p className="text-5xl mb-3">🔥</p>
          <h2 className="text-3xl font-black text-white tracking-tight">Wall of Shame</h2>
          <p className="text-slate-500 text-sm mt-2">Submit your entry. Make it dramatic.</p>
        </div>

        <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
              Headline <span className="text-red-400">*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && submit()}
              placeholder="The bold claim that started it all..."
              className={inp}
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
              The Full Story <span className="text-slate-600 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Context, evidence, receipts..."
              rows={4}
              className={`${inp} resize-none`}
            />
          </div>

          {/* Image */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
              Evidence <span className="text-slate-600 normal-case font-normal">(optional image)</span>
            </label>
            {preview ? (
              <div className="relative w-full rounded-xl overflow-hidden border border-slate-700">
                <img src={preview} alt="" className="w-full max-h-56 object-cover" />
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

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-sm transition-colors"
          >
            {saving ? "Submitting…" : "🔥 Submit to Wall of Shame"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Submissions are public. Officers may remove posts at their discretion.
        </p>
      </div>
    </div>
  );
}
