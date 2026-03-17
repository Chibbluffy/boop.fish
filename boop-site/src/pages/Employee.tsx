import React, { useEffect, useState } from "react";
import { useAuth, isOfficerOrAdmin } from "../lib/auth";

type Award = {
  id: string;
  award_type: "day" | "month";
  display_name: string;
  reason: string | null;
  award_date: string;
};

function AwardCard({ award, label, isOfficer }: { award: Award | null; label: string; isOfficer: boolean }) {
  return award ? (
    <div className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 p-8 overflow-hidden">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-amber-600/8 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">⭐</span>
        <span className="text-xs font-black uppercase tracking-widest text-amber-400/80">
          Employee of the {label}
        </span>
      </div>

      <h3 className="text-4xl font-black text-white leading-tight mb-4">{award.display_name}</h3>

      {award.reason && (
        <p className="text-slate-300 leading-relaxed mb-6 italic">"{award.reason}"</p>
      )}

      <p className="text-xs text-slate-600 uppercase tracking-widest font-semibold">
        Awarded {fmt(award.award_date)}
      </p>
    </div>
  ) : (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center flex flex-col items-center justify-center gap-2">
      <p className="text-3xl">⭐</p>
      <p className="text-slate-500 font-semibold text-sm">No employee of the {label.toLowerCase()} set.</p>
      {isOfficer && <p className="text-slate-600 text-xs">Use Update to recognize someone.</p>}
    </div>
  );
}

function fmt(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export default function Employee() {
  const user = useAuth();
  const isOfficer = isOfficerOrAdmin(user);
  const token = localStorage.getItem("boop_session");

  const [latestDay, setLatestDay] = useState<Award | null>(null);
  const [latestMonth, setLatestMonth] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"day" | "month">("month");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/awards")
      .then(r => r.json())
      .then((data: Award[]) => {
        setLatestDay(data.find(a => a.award_type === "day") ?? null);
        setLatestMonth(data.find(a => a.award_type === "month") ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);
    const res = await fetch("/api/awards", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        award_type: type,
        display_name: name.trim(),
        reason: reason.trim() || null,
        award_date: new Date().toISOString().slice(0, 10),
      }),
    });
    if (res.ok) {
      const award: Award = await res.json();
      if (award.award_type === "day") setLatestDay(award);
      else setLatestMonth(award);
      setShowEdit(false);
      setName("");
      setReason("");
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
    }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-4xl font-black tracking-tight text-white">Star Employee</h2>
            <p className="text-slate-400 mt-1">Guild recognition spotlight.</p>
          </div>
          {isOfficer && (
            <button
              onClick={() => { setShowEdit(true); setError(null); }}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              ✦ Update
            </button>
          )}
        </div>

        {/* Award card */}
        {loading ? (
          <p className="text-slate-600 text-center py-20">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AwardCard award={latestMonth} label="Month" isOfficer={isOfficer} />
            <AwardCard award={latestDay}   label="Day"   isOfficer={isOfficer} />
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white mb-5">Set Star Employee</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Type</label>
                <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                  {(["month", "day"] as const).map(t => (
                    <button key={t} onClick={() => setType(t)}
                      className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors capitalize ${type === t ? "bg-slate-600 text-white" : "text-slate-500 hover:text-white"}`}>
                      Of the {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Guild member's name"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest font-semibold block mb-1.5">
                  Reason <span className="normal-case text-slate-600 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Why they deserve it..."
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={save}
                disabled={saving || !name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black text-sm transition-colors"
              >
                {saving ? "Saving..." : "⭐ Award"}
              </button>
              <button onClick={() => setShowEdit(false)}
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
