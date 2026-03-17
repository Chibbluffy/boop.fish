import React, { useEffect, useState } from "react";

type WallEntry = {
  id: string;
  title: string;
  description: string | null;
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
  const [entries, setEntries] = useState<WallEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/wall")
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-black text-white leading-snug mb-2">
                    {entry.title}
                  </h3>

                  {/* Description */}
                  {entry.description && (
                    <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                      {entry.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
