import React, { useEffect, useState } from "react";
import boopBanner from "../boop_banner.png";
import { useAuth } from "../lib/auth";

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  author: string | null;
  created_at: string;
};

export default function Home() {
  const user = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.json())
      .then(setAnnouncements)
      .catch(() => {});
  }, []);

  const pinned = announcements.filter(a => a.pinned);
  const all    = announcements;

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">

      {/* ── Pinned announcement banner ── */}
      {pinned.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/20">
          <div className="max-w-7xl mx-auto px-6 py-2.5 flex flex-col gap-1.5">
            {pinned.map(a => (
              <div key={a.id} className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                  📌 Pinned
                </span>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-amber-200">{a.title}</span>
                  {a.body && (
                    <span className="text-sm text-amber-200/60 ml-2">{a.body}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="relative min-h-[calc(100vh-3.5rem)] flex items-center">
        {/* Star field */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {STARS.map((s, i) => (
            <div key={i} className="absolute rounded-full bg-white"
              style={{ left: s.x, top: s.y, width: s.size, height: s.size, opacity: s.opacity }} />
          ))}
          <div className="absolute top-1/4 right-1/3 w-96 h-96 bg-amber-500/6 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 w-full flex flex-col lg:flex-row items-center gap-12 py-16">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest mb-6">
              ✦ Black Desert Online Guild
            </div>

            <h1 className="text-6xl lg:text-7xl font-black text-white leading-none tracking-tight mb-6">
              Welcome to<br />
              boop<span className="text-violet-400">.fish</span>
            </h1>

            <p className="text-slate-400 text-lg leading-relaxed max-w-md mb-8">
              A cozy corner of the internet for the boop guild.
              Tools, stats, and shenanigans — all in one place.
            </p>

            <div className="flex flex-wrap gap-3">
              {user ? (
                <a href="#/frogs"
                  className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-sm transition-all active:scale-95 shadow-lg shadow-violet-900/30">
                  Frogs →
                </a>
              ) : (
                <a href="#/auth"
                  className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-sm transition-all active:scale-95 shadow-lg shadow-violet-900/30">
                  Join the Guild →
                </a>
              )}
              <a href="#/wall"
                className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition-all active:scale-95">
                Wall of Shame
              </a>
            </div>
          </div>

          <div className="flex-1 flex justify-center lg:justify-end relative">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/15 blur-3xl rounded-full scale-75 translate-y-4" />
              <img src={boopBanner} alt="boop guild banner"
                className="relative w-full max-w-lg lg:max-w-xl rounded-2xl shadow-2xl shadow-black/60"
                style={{ imageRendering: "auto" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Announcements ── */}
      {all.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-20">
          <div className="border-t border-slate-800/60 pt-16">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-8 text-center">
              Guild Announcements
            </p>
            <div className="flex flex-col gap-3 max-w-2xl mx-auto">
              {all.map(a => (
                <div key={a.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    a.pinned ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {a.pinned && (
                      <span className="shrink-0 mt-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                        Pinned
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white">{a.title}</p>
                      {a.body && <p className="text-sm text-slate-400 mt-1 leading-relaxed whitespace-pre-line">{a.body}</p>}
                      <p className="text-xs text-slate-600 mt-2">
                        {a.author && <>{a.author} · </>}
                        {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const STARS = Array.from({ length: 80 }, (_, i) => {
  const rand = (seed: number) => ((Math.sin(seed) * 43758.5453) % 1 + 1) / 2;
  return {
    x: `${rand(i * 3 + 1) * 100}%`,
    y: `${rand(i * 3 + 2) * 100}%`,
    size: `${rand(i * 3 + 3) * 2 + 1}px`,
    opacity: rand(i * 3 + 4) * 0.5 + 0.1,
  };
});
