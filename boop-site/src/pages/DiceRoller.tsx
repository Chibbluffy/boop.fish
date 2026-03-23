import { useState } from "react";

const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;
type DieSides = typeof DIE_TYPES[number];

type DieGroup  = { sides: DieSides; count: number };
type RollGroup = { sides: DieSides; values: number[] };

function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1;
}

export default function DiceRoller() {
  const [groups,   setGroups]   = useState<DieGroup[]>([]);
  const [results,  setResults]  = useState<RollGroup[]>([]);
  const [modifier, setModifier] = useState(0);
  const [shaking,  setShaking]  = useState(false);

  function addDie(sides: DieSides) {
    setGroups(prev => {
      const hit = prev.find(g => g.sides === sides);
      if (hit) return prev.map(g => g.sides === sides ? { ...g, count: g.count + 1 } : g);
      return [...prev, { sides, count: 1 }];
    });
  }

  function removeDie(sides: DieSides) {
    setGroups(prev => {
      const hit = prev.find(g => g.sides === sides);
      if (!hit) return prev;
      if (hit.count === 1) return prev.filter(g => g.sides !== sides);
      return prev.map(g => g.sides === sides ? { ...g, count: g.count - 1 } : g);
    });
  }

  function doRoll() {
    if (!groups.length) return;
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
    setResults(
      groups.map(g => ({
        sides: g.sides,
        values: Array.from({ length: g.count }, () => rollDie(g.sides)),
      }))
    );
  }

  function clear() {
    setGroups([]);
    setResults([]);
    setModifier(0);
  }

  const allValues = results.flatMap(r => r.values);
  const diceTotal = allValues.reduce((a, b) => a + b, 0);
  const total     = diceTotal + modifier;
  const hasGroups  = groups.length > 0;
  const hasResults = results.length > 0;

  return (
    <>
      <style>{`
        @keyframes dice-shake {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          20%      { transform: translate(-3px, 2px) rotate(-4deg); }
          40%      { transform: translate(3px,-2px) rotate(4deg); }
          60%      { transform: translate(-2px, 3px) rotate(-2deg); }
          80%      { transform: translate(2px,-1px) rotate(2deg); }
        }
        .dice-shake { animation: dice-shake 0.4s ease-in-out; }
      `}</style>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-black text-white mb-1">Dice Roller</h1>
        <p className="text-slate-500 text-sm mb-8">Add dice, roll, see totals.</p>

        {/* Die type buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {DIE_TYPES.map(sides => (
            <button
              key={sides}
              onClick={() => addDie(sides)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm transition-colors active:scale-95"
            >
              d{sides}
            </button>
          ))}
        </div>

        {/* Active dice */}
        {hasGroups && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {groups.map(g => (
              <div key={g.sides}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm font-bold"
              >
                <input
                  type="number"
                  min={1}
                  value={g.count}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    if (!val || val < 1) return;
                    setGroups(prev => prev.map(x => x.sides === g.sides ? { ...x, count: val } : x));
                  }}
                  className="w-8 bg-violet-900/40 border border-violet-500/40 rounded text-center text-violet-200 font-black focus:outline-none focus:border-violet-400 focus:bg-violet-900/60 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span>d{g.sides}</span>
                <button
                  onClick={() => removeDie(g.sides)}
                  className="text-violet-500 hover:text-red-400 transition-colors leading-none ml-1"
                >×</button>
              </div>
            ))}
            <button
              onClick={clear}
              className="px-3 py-1.5 text-slate-600 hover:text-red-400 text-sm transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Modifier */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-slate-500 text-sm">Modifier</span>
          <button
            onClick={() => setModifier(m => m - 1)}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-sm transition-colors"
          >−</button>
          <input
            type="number"
            value={modifier}
            onChange={e => setModifier(parseInt(e.target.value) || 0)}
            className={`w-16 text-center font-black text-lg bg-slate-800 border rounded-lg px-2 py-0.5 focus:outline-none focus:border-violet-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              modifier > 0 ? "border-violet-500/50 text-violet-300" : modifier < 0 ? "border-red-500/30 text-red-400" : "border-slate-700 text-slate-500"
            }`}
          />
          <button
            onClick={() => setModifier(m => m + 1)}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-sm transition-colors"
          >+</button>
          {modifier !== 0 && (
            <button
              onClick={() => setModifier(0)}
              className="text-slate-600 hover:text-red-400 text-xs transition-colors"
            >reset</button>
          )}
        </div>

        {/* Roll button */}
        <button
          onClick={doRoll}
          disabled={!hasGroups}
          className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-black text-sm transition-all active:scale-95 mb-10"
        >
          {hasResults ? "Reroll" : "Roll"}
        </button>

        {/* Results */}
        {hasResults && (
          <div className={shaking ? "dice-shake" : ""}>
            <div className="flex flex-wrap gap-3 mb-8">
              {results.flatMap((r, gi) =>
                r.values.map((v, i) => (
                  <div
                    key={`${gi}-${i}`}
                    className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border font-black select-none ${
                      v === r.sides
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-200 shadow-lg shadow-violet-900/30"
                        : v === 1
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-slate-800 border-slate-700 text-white"
                    }`}
                  >
                    <span className="text-xl leading-none">{v}</span>
                    <span className="text-[10px] text-slate-500 mt-1 font-normal">d{r.sides}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-baseline gap-3 border-t border-slate-800 pt-6 flex-wrap">
              {(allValues.length > 1 || modifier !== 0) && (
                <span className="text-slate-500 text-sm">
                  {allValues.join(" + ")}
                  {modifier !== 0 && (
                    <span className={modifier > 0 ? "text-violet-400" : "text-red-400"}>
                      {modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`}
                    </span>
                  )}
                  {" ="}
                </span>
              )}
              <span className="text-5xl font-black text-white">{total}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
