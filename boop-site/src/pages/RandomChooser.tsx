import { useRef, useState } from "react";

export default function RandomChooser() {
  const [input,   setInput]   = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [result,  setResult]  = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addOption() {
    const val = input.trim();
    if (!val) return;
    setOptions(prev => [...prev, val]);
    setInput("");
    setResult(null);
    inputRef.current?.focus();
  }

  function removeOption(i: number) {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
    setResult(null);
  }

  function pick() {
    if (options.length < 2 || picking) return;
    setPicking(true);
    setResult(null);

    // Rapid-cycle through random options, then land on the final pick
    let count = 0;
    const steps = 14;
    const final = options[Math.floor(Math.random() * options.length)];
    const interval = setInterval(() => {
      count++;
      if (count >= steps) {
        clearInterval(interval);
        setResult(final);
        setPicking(false);
      } else {
        setResult(options[Math.floor(Math.random() * options.length)]);
      }
    }, 70);
  }

  const canPick = options.length >= 2 && !picking;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-black text-white mb-1">Random Chooser</h1>
      <p className="text-slate-500 text-sm mb-8">Can't decide? Let fate decide.</p>

      {/* Input */}
      <div className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addOption()}
          placeholder="Add an option…"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <button
          onClick={addOption}
          disabled={!input.trim()}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm disabled:opacity-30 transition-colors"
        >
          Add
        </button>
      </div>

      {options.length > 0 && (
        <>
          {/* Options list */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-6">
            {options.map((opt, i) => {
              const isWinner = result === opt && !picking;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60 last:border-0 transition-colors ${
                    isWinner ? "bg-violet-500/10" : ""
                  }`}
                >
                  <span className={`text-sm ${isWinner ? "text-violet-300 font-semibold" : "text-slate-300"}`}>
                    {isWinner && <span className="mr-2 text-violet-400">→</span>}
                    {opt}
                  </span>
                  <button
                    onClick={() => removeOption(i)}
                    className="text-slate-600 hover:text-red-400 transition-colors ml-4 leading-none text-base"
                  >×</button>
                </div>
              );
            })}
          </div>

          <button
            onClick={pick}
            disabled={!canPick}
            className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white font-black text-sm transition-all active:scale-95"
          >
            {picking ? "Choosing…" : result ? "Pick Again" : "Pick One"}
          </button>

          {options.length < 2 && (
            <p className="text-slate-600 text-xs mt-3">Add at least 2 options to pick.</p>
          )}
        </>
      )}

      {/* Result */}
      {result && !picking && (
        <div className="mt-10 text-center">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">The chosen one</p>
          <p className="text-4xl font-black text-white">{result}</p>
        </div>
      )}

      {/* Cycling display */}
      {picking && result && (
        <div className="mt-10 text-center opacity-40">
          <p className="text-4xl font-black text-white">{result}</p>
        </div>
      )}
    </div>
  );
}
