import React, { useState } from "react";

const TEAM_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];

const TEAM_PALETTE = [
  { start: "#3b82f6", end: "#06b6d4" },
  { start: "#8b5cf6", end: "#d946ef" },
  { start: "#f97316", end: "#f59e0b" },
  { start: "#10b981", end: "#22c55e" },
  { start: "#f43f5e", end: "#ec4899" },
  { start: "#eab308", end: "#84cc16" },
  { start: "#14b8a6", end: "#38bdf8" },
  { start: "#ef4444", end: "#f97316" },
  { start: "#a855f7", end: "#6366f1" },
  { start: "#06b6d4", end: "#10b981" },
];

export default function Shuffler() {
  const [teams, setTeams] = useState(2);
  const [size, setSize] = useState(3);
  const [namesText, setNamesText] = useState("");
  const [result, setResult] = useState<string[][]>([]);
  const [shuffleKey, setShuffleKey] = useState(0);

  const nameList = namesText.split(/\n|,|;/).map(s => s.trim()).filter(Boolean);
  const nameCount = nameList.length;

  function shuffleAndAssign() {
    const pool = [...nameList];
    const out: string[][] = Array.from({ length: teams }, () => []);

    let idx = 0;
    while (pool.length && out.some(b => b.length < size)) {
      const pick = Math.floor(Math.random() * pool.length);
      const name = pool.splice(pick, 1)[0];
      for (let i = 0; i < teams; i++) {
        const j = (idx + i) % teams;
        if (out[j].length < size) {
          out[j].push(name);
          idx = j + 1;
          break;
        }
      }
    }

    setResult(out);
    setShuffleKey(k => k + 1);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Team Shuffler
          </h2>
          <p className="text-slate-400 mt-1">Drop in your roster, set teams, and let fate decide.</p>
        </div>

        {/* Input Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Names textarea */}
          <div className="md:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Roster</label>
              {nameCount > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {nameCount} {nameCount === 1 ? "player" : "players"}
                </span>
              )}
            </div>
            <textarea
              value={namesText}
              onChange={e => setNamesText(e.target.value)}
              placeholder={"Alice\nBob\nCharlie\n..."}
              className="w-full h-52 bg-slate-950 text-slate-100 placeholder-slate-600 rounded-xl border border-slate-700 focus:border-slate-500 focus:outline-none p-3 resize-none text-sm font-mono leading-relaxed"
            />
          </div>

          {/* Config */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-300 uppercase tracking-widest block mb-2">Teams</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTeams(t => Math.max(1, t - 1))}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-colors flex items-center justify-center"
                >−</button>
                <span className="text-2xl font-black w-8 text-center">{teams}</span>
                <button
                  onClick={() => setTeams(t => Math.min(10, t + 1))}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-colors flex items-center justify-center"
                >+</button>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-300 uppercase tracking-widest block mb-2">Max per team</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSize(s => Math.max(1, s - 1))}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-colors flex items-center justify-center"
                >−</button>
                <span className="text-2xl font-black w-8 text-center">{size}</span>
                <button
                  onClick={() => setSize(s => s + 1)}
                  className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-colors flex items-center justify-center"
                >+</button>
              </div>
            </div>

            <div className="flex-1" />

            {nameCount > 0 && (
              <p className="text-xs text-slate-500 text-center">
                {Math.min(nameCount, teams * size)} of {nameCount} players assigned
              </p>
            )}

            <button
              onClick={shuffleAndAssign}
              disabled={nameCount === 0}
              className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 active:scale-95 shadow-lg shadow-violet-900/30"
            >
              ⚡ Shuffle
            </button>
          </div>
        </div>

        {/* Results */}
        {result.length > 0 && (
          <div key={shuffleKey} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.map((members, i) => {
              const palette = TEAM_PALETTE[i % TEAM_PALETTE.length];
              const teamName = TEAM_NAMES[i] ?? `Team ${i + 1}`;
              return (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden border border-slate-700/50"
                  style={{
                    background: `linear-gradient(135deg, ${palette.start}12, ${palette.end}08)`,
                    animation: `fadeSlideIn 0.35s ease both`,
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  {/* Team header bar */}
                  <div
                    className="px-5 py-3 flex items-center gap-3"
                    style={{ background: `linear-gradient(90deg, ${palette.start}33, ${palette.end}22)` }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-md"
                      style={{ background: `linear-gradient(135deg, ${palette.start}, ${palette.end})` }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest leading-none mb-0.5">Team</p>
                      <p className="font-black text-white leading-none">{teamName}</p>
                    </div>
                    <div className="ml-auto text-xs font-bold text-slate-400">
                      {members.length} {members.length === 1 ? "player" : "players"}
                    </div>
                  </div>

                  {/* Members */}
                  <div className="px-4 py-3 flex flex-col gap-2">
                    {members.map((name, j) => (
                      <div
                        key={j}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/40"
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                          style={{ background: `linear-gradient(135deg, ${palette.start}99, ${palette.end}99)` }}
                        >
                          {j + 1}
                        </div>
                        <span className="text-sm font-semibold text-slate-100">{name}</span>
                      </div>
                    ))}
                    {members.length === 0 && (
                      <p className="text-xs text-slate-600 italic text-center py-2">empty</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
