import { useCallback, useRef, useState } from "react";
import Dice3D, { type Dice3DHandle, type DieSpec } from "./Dice3D";

// ─── Types ──────────────────────────────────────────────────
const DIE_TYPES = [4, 6, 8, 10, 12, 20] as const;
const DIE_LABELS: Record<number, string> = {
  4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12", 20: "d20", 100: "d100",
};
const DIE_COLORS: Record<number, string> = {
  4: "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30",
  6: "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30",
  8: "bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30",
  10: "bg-orange-500/20 border-orange-500/40 text-orange-400 hover:bg-orange-500/30",
  12: "bg-purple-500/20 border-purple-500/40 text-purple-400 hover:bg-purple-500/30",
  20: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30",
  100: "bg-pink-500/20 border-pink-500/40 text-pink-400 hover:bg-pink-500/30",
};

interface DicePool {
  [key: number]: number;
}

interface RollResult {
  dice: { type: number; value: number; id: string }[];
  modifier: number;
  total: number;
}

// ─── Sound Synthesis ────────────────────────────────────────
class DiceSounds {
  private ctx: AudioContext | null = null;
  private impactBuffers: AudioBuffer[] = [];

  private ensureCtx() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.generateBuffers();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private generateBuffers() {
    if (!this.ctx) return;
    const variations = [
      { duration: 0.06, decay: 60, hpFreq: 2000 },
      { duration: 0.04, decay: 80, hpFreq: 2500 },
      { duration: 0.08, decay: 50, hpFreq: 1800 },
      { duration: 0.05, decay: 70, hpFreq: 3000 },
      { duration: 0.03, decay: 90, hpFreq: 3500 },
      { duration: 0.07, decay: 55, hpFreq: 2200 },
    ];

    for (const v of variations) {
      const length = Math.ceil(this.ctx.sampleRate * v.duration);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const t = i / this.ctx.sampleRate;
        const envelope = Math.exp(-t * v.decay);
        const noise = Math.random() * 2 - 1;
        const tone = Math.sin(2 * Math.PI * v.hpFreq * 0.3 * t);
        data[i] = (noise * 0.7 + tone * 0.3) * envelope;
      }
      this.impactBuffers.push(buffer);
    }
  }

  play(diceCount: number) {
    const ctx = this.ensureCtx();

    for (let i = 0; i < diceCount; i++) {
      const delay = i * 0.03 + Math.random() * 0.05;
      this.playBuffer(ctx, delay, 0.4 + Math.random() * 0.3);
    }

    const clatterCount = Math.min(diceCount * 3 + Math.floor(Math.random() * 3), 12);
    for (let i = 0; i < clatterCount; i++) {
      const delay = 0.15 + i * 0.04 + Math.random() * 0.06;
      this.playBuffer(ctx, delay, 0.1 + Math.random() * 0.15);
    }

    const settleCount = Math.min(diceCount, 4);
    for (let i = 0; i < settleCount; i++) {
      const delay = 0.5 + i * 0.08 + Math.random() * 0.1;
      this.playBuffer(ctx, delay, 0.05 + Math.random() * 0.08);
    }
  }

  private playBuffer(ctx: AudioContext, delay: number, volume: number) {
    const buffer =
      this.impactBuffers[Math.floor(Math.random() * this.impactBuffers.length)];
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 800 + Math.random() * 400;

    source.connect(hp).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + delay);
  }
}

const diceSounds = new DiceSounds();

// ─── Roll Logic ─────────────────────────────────────────────
function rollDice(pool: DicePool, modifier: number): RollResult {
  const dice: RollResult["dice"] = [];
  let id = 0;

  for (const [typeStr, count] of Object.entries(pool)) {
    const type = Number(typeStr);
    if (count <= 0) continue;

    for (let i = 0; i < count; i++) {
      const faces = type === 100 ? 100 : type;
      dice.push({
        type,
        value: Math.floor(Math.random() * faces) + 1,
        id: `d${id++}`,
      });
    }
  }

  const total = dice.reduce((sum, d) => sum + d.value, 0) + modifier;
  return { dice, modifier, total };
}

// ─── Component ──────────────────────────────────────────────
export default function DiceRoller() {
  const [pool, setPool] = useState<DicePool>({});
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);
  const [use3D, setUse3D] = useState(true);

  const dice3DRef = useRef<Dice3DHandle>(null);

  const totalDice = Object.values(pool).reduce((a, b) => a + b, 0);

  const setDieCount = useCallback((type: number, count: number) => {
    setPool((p) => {
      const next = { ...p };
      if (count <= 0) delete next[type];
      else next[type] = count;
      return next;
    });
    setResult(null);
  }, []);

  const clearPool = useCallback(() => {
    setPool({});
    setResult(null);
  }, []);

  const roll = useCallback(async () => {
    if (totalDice === 0 || rolling) return;

    setRolling(true);
    setResult(null);
    diceSounds.play(totalDice);

    if (use3D && dice3DRef.current) {
      // Build array of {qty, sides} — the format dice-box actually supports
      // for rolling multiple die types at once
      const diceSpecs: DieSpec[] = Object.entries(pool)
        .filter(([, c]) => c > 0)
        .map(([t, c]) => ({ qty: c, sides: Number(t) }));

      try {
        const raw = await dice3DRef.current.roll(diceSpecs);
        // dice-box returns results in the same order as the specs
        const dice: RollResult["dice"] = raw.map((r, i) => ({
          type: r.sides,
          value: r.value,
          id: `d${i}`,
        }));
        const total = dice.reduce((sum, d) => sum + d.value, 0) + modifier;
        setResult({ dice, modifier, total });
      } catch {
        // Fallback to flat roll if 3D fails
        setResult(rollDice(pool, modifier));
      }
    } else {
      await new Promise((res) => setTimeout(res, 300));
      setResult(rollDice(pool, modifier));
    }

    setRolling(false);
  }, [pool, modifier, totalDice, rolling, use3D]);

  const poolDesc = Object.entries(pool)
    .filter(([, c]) => c > 0)
    .map(([t, c]) => `${c}${DIE_LABELS[Number(t)] ?? `d${t}`}`)
    .join(" + ");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-black text-white">Dice Roller</h1>

        {/* 3D Mode toggle */}
        <button
          onClick={() => setUse3D((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-colors ${
            use3D
              ? "bg-violet-600/30 border-violet-500/60 text-violet-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${use3D ? "bg-violet-400" : "bg-slate-600"}`}
          />
          3D Mode
        </button>
      </div>
      <p className="text-slate-500 text-sm mb-8">
        Roll dice and get instant results.
      </p>

      {/* Dice type selectors */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[...DIE_TYPES, 100 as const].map((type) => {
          const count = pool[type] || 0;
          const colors = DIE_COLORS[type] ?? "";
          return (
            <div
              key={type}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${colors}`}
            >
              <span className="text-sm font-bold">{DIE_LABELS[type]}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDieCount(type, count - 1)}
                  disabled={count === 0}
                  className="w-6 h-6 flex items-center justify-center rounded-md bg-black/20 hover:bg-black/40 disabled:opacity-20 text-xs font-bold transition-colors"
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  value={count}
                  onChange={(e) =>
                    setDieCount(type, Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-10 text-center bg-black/20 rounded-md px-1 py-0.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-white/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setDieCount(type, count + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded-md bg-black/20 hover:bg-black/40 text-xs font-bold transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pool summary + clear */}
      {totalDice > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-slate-400 font-mono">
            {poolDesc}
            {modifier !== 0 && ` ${modifier > 0 ? "+" : ""}${modifier}`}
          </span>
          <button
            onClick={clearPool}
            className="text-xs px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Modifier input */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-slate-400">Modifier</label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setModifier((m) => m - 1)}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-sm transition-colors"
          >
            -
          </button>
          <input
            type="number"
            value={modifier}
            onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
            className="w-16 text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => setModifier((m) => m + 1)}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-sm transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Roll button */}
      <button
        onClick={roll}
        disabled={totalDice === 0 || rolling}
        className="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:hover:bg-violet-600 text-white font-bold text-lg transition-colors mb-6"
      >
        {rolling ? "Rolling..." : "Roll"}
      </button>

      {/* 3D canvas — always mounted when 3D mode is on so it initializes */}
      {use3D && (
        <div className="mb-6">
          <Dice3D ref={dice3DRef} />
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            {result.dice.map((d) => {
              const colors = DIE_COLORS[d.type] ?? "";
              return (
                <div
                  key={d.id}
                  className={`px-3 py-2 rounded-xl border text-center min-w-[3rem] ${colors}`}
                >
                  <div className="text-xs opacity-60 mb-0.5">
                    {DIE_LABELS[d.type] ?? `d${d.type}`}
                  </div>
                  <div className="text-lg font-black">{d.value}</div>
                </div>
              );
            })}
          </div>

          {result.modifier !== 0 && (
            <div className="text-sm text-slate-400 mb-2">
              Modifier:{" "}
              <span className="font-bold text-slate-200">
                {result.modifier > 0 ? "+" : ""}
                {result.modifier}
              </span>
            </div>
          )}

          <div className="border-t border-slate-800 pt-3">
            <div className="text-sm text-slate-500 mb-1">Total</div>
            <div className="text-4xl font-black text-white">{result.total}</div>
          </div>
        </div>
      )}
    </div>
  );
}
