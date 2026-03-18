import React, { useEffect, useRef, useState } from "react";
import { useRibbits } from "../hooks/useRibbits";
import { useAuth } from "../lib/auth";

const FROG_COUNT = 60;

const FROGS = Array.from({ length: FROG_COUNT }).map((_, i) => ({
  id: i,
  fontSize: 1.5 + Math.random() * 1.4,
  rotation: Math.round((Math.random() - 0.5) * 24),
  rare: Math.random() < 0.08,
}));

type Float = { key: number; text: string; frogId: number };

const FRIEND_RIBBIT_CAP = 300;

// ── Frog croak synthesizer ────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === "closed") _audioCtx = new AudioContext();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}

// Five distinct croak personalities — random selection per click
const CROAK_TYPES = [
  { freq: 110, sweep: 0.55, dur: 0.20, wave: "square"   as OscillatorType }, // deep basso
  { freq: 160, sweep: 0.60, dur: 0.16, wave: "square"   as OscillatorType }, // classic ribbit
  { freq: 85,  sweep: 0.50, dur: 0.26, wave: "sawtooth" as OscillatorType }, // bullfrog grumble
  { freq: 200, sweep: 0.65, dur: 0.13, wave: "square"   as OscillatorType }, // high chirp
  { freq: 130, sweep: 0.45, dur: 0.22, wave: "sawtooth" as OscillatorType }, // raspy croak
];

function playCroak(mult: 1 | 2 | 3) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const type = CROAK_TYPES[Math.floor(Math.random() * CROAK_TYPES.length)];
  // Volume scales with multiplier
  const baseVol = mult === 3 ? 0.75 : mult === 2 ? 0.48 : 0.25;
  // Pitch randomised slightly so every click sounds a little different
  const pitchJitter = 0.85 + Math.random() * 0.3;

  function oneCroak(startTime: number, freq: number, vol: number, dur: number) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    // Bandpass filter carves out the "froggy" mid-range
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = freq * 2.2;
    filt.Q.value = 1.8;

    osc.type = type.wave;
    // Pitch swoops down — that's the characteristic ribbit shape
    osc.frequency.setValueAtTime(freq * 2.0, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * type.sweep, startTime + dur * 0.65);
    osc.frequency.exponentialRampToValueAtTime(freq * type.sweep * 0.8, startTime + dur);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.009);       // fast attack
    gain.gain.setValueAtTime(vol, startTime + dur * 0.25);            // sustain briefly
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur); // tail off

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.04);
  }

  const f = type.freq * pitchJitter;
  oneCroak(now, f, baseVol, type.dur);

  // 2× frogs croak twice (rapid-fire ribbit-ribbit)
  if (mult >= 2) {
    oneCroak(now + type.dur * 0.75, f * (0.88 + Math.random() * 0.25), baseVol * 0.88, type.dur * 0.9);
  }
  // 3× frogs add a third even rowdier croak
  if (mult >= 3) {
    oneCroak(now + type.dur * 1.45, f * (0.80 + Math.random() * 0.40), baseVol * 0.80, type.dur * 0.85);
  }
}

export default function Frogs() {
  const { count: ribbited, add } = useRibbits();
  const user = useAuth();
  const isFriend = user?.role === "friend";
  const isCapped = isFriend && ribbited >= FRIEND_RIBBIT_CAP;
  const [popped, setPopped] = useState<Set<number>>(new Set());
  const [litFrogs, setLitFrogs] = useState<Map<number, 2 | 3>>(new Map());
  const [floats, setFloats] = useState<Float[]>([]);
  const floatKey = useRef(0);

  // Randomly light up frogs on an interval
  useEffect(() => {
    const litRef = new Map<number, 2 | 3>();

    const interval = setInterval(() => {
      const count = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const id = Math.floor(Math.random() * FROG_COUNT);
        const mult: 2 | 3 = Math.random() < 0.3 ? 3 : 2;
        litRef.set(id, mult);
        setLitFrogs(new Map(litRef));

        setTimeout(() => {
          litRef.delete(id);
          setLitFrogs(new Map(litRef));
        }, 2500);
      }
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  function handleClick(id: number) {
    if (isCapped) return;
    const mult = litFrogs.get(id) ?? 1;
    playCroak(mult as 1 | 2 | 3);
    add(mult);

    // pop animation
    setPopped(s => new Set(s).add(id));
    setTimeout(() => setPopped(s => { const n = new Set(s); n.delete(id); return n; }), 400);

    // floating score if bonus
    if (mult > 1) {
      const f: Float = { key: floatKey.current++, text: `+${mult}×`, frogId: id };
      setFloats(fs => [...fs, f]);
      setTimeout(() => setFloats(fs => fs.filter(x => x.key !== f.key)), 800);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-10">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-4xl font-black tracking-tight text-white">
              Frog Party{" "}
              <span className="inline-block animate-bounce origin-bottom">🐸</span>
            </h2>
            <p className="text-slate-400 mt-1">
              Click frogs to ribbit. Golden frogs are worth more — but they don't wait around.
            </p>
          </div>

          <div className="text-right">
            <p className={`text-3xl font-black transition-colors ${ribbited > 0 ? "text-green-400" : "text-slate-700"}`}>
              {ribbited}
            </p>
            <p className="text-xs text-slate-500 uppercase tracking-widest">ribbited</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-full bg-amber-400/80 shadow-[0_0_6px_2px_rgba(251,191,36,0.5)]" />
            2× bonus
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-full bg-violet-400/80 shadow-[0_0_6px_2px_rgba(167,139,250,0.6)]" />
            3× bonus
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2.5">
          {FROGS.map(frog => {
            const mult = litFrogs.get(frog.id);
            const isPop = popped.has(frog.id);
            const float = floats.find(f => f.frogId === frog.id);

            const litStyle =
              mult === 3
                ? "border-violet-400/80 bg-violet-950/60 shadow-[0_0_16px_4px_rgba(167,139,250,0.45)]"
                : mult === 2
                ? "border-amber-400/80 bg-amber-950/60 shadow-[0_0_16px_4px_rgba(251,191,36,0.4)]"
                : frog.rare
                ? "bg-green-950/60 border-green-700/40 shadow-[0_0_12px_2px_rgba(74,222,128,0.15)]"
                : "bg-slate-900 border-slate-800 hover:border-green-600/50 hover:bg-slate-800";

            return (
              <button
                key={frog.id}
                onClick={() => handleClick(frog.id)}
                className={`relative aspect-square flex items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer select-none
                  ${litStyle}
                  ${isPop ? "scale-125" : mult ? "scale-110 hover:scale-125" : "hover:scale-110"}
                `}
              >
                <span
                  style={{
                    fontSize: `${frog.fontSize}rem`,
                    display: "inline-block",
                    transform: `rotate(${frog.rotation}deg)`,
                  }}
                >
                  🐸
                </span>

                {/* Multiplier badge while lit */}
                {mult && !isPop && (
                  <span
                    className={`absolute -top-1.5 -right-1.5 text-[9px] font-black px-1 py-0.5 rounded-full leading-none
                      ${mult === 3 ? "bg-violet-500 text-white" : "bg-amber-400 text-slate-900"}
                    `}
                  >
                    {mult}×
                  </span>
                )}

                {/* Floating score popup */}
                {float && (
                  <span
                    key={float.key}
                    className={`absolute inset-0 flex items-center justify-center text-sm font-black pointer-events-none
                      ${mult === 3 ? "text-violet-300" : "text-amber-300"}
                    `}
                    style={{ animation: "floatUp 0.8s ease forwards" }}
                  >
                    {float.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Friend ribbit cap notice */}
        {isCapped && (
          <div className="mt-8 text-center bg-violet-500/10 border border-violet-500/20 rounded-xl px-6 py-4 max-w-md mx-auto">
            <p className="text-violet-300 font-semibold text-sm">Oops! You've collected the maximum ribbits as a non-member. 🐸</p>
            <p className="text-slate-400 text-xs mt-1">Join Boop for more fun and features!</p>
          </div>
        )}

        {/* Milestone messages */}
        {!isCapped && ribbited >= 10 && (
          <p className="mt-8 text-center text-slate-600 text-sm">
            {ribbited >= 500
              ? "Maximum frog power unlocked. +5 payout tier. You are a legend. 🐸👑"
              : ribbited >= 450
              ? "Almost there. The frogs are watching. 🐸🐸🐸🐸"
              : ribbited >= 400
              ? "Four tiers of frog. Truly unhinged. 🐸🐸🐸🐸"
              : ribbited >= 350
              ? "The pond bends to your will. +3 and climbing. 🌿"
              : ribbited >= 300
              ? "Three frog tiers earned. Frog ascension imminent. 🌌"
              : ribbited >= 250
              ? "Halfway to max frog power. Keep going. 🐸🐸"
              : ribbited >= 200
              ? "Two payout tiers of pure frog dedication. 🐸🐸"
              : ribbited >= 150
              ? "Frog economy going strong. +1 tier and counting. 📈"
              : ribbited >= 100
              ? "100 ribbits. That's a full bonus tier. There is no cure. 🐸🐸🐸"
              : ribbited >= 50
              ? "Halfway to your first frog tier bonus. Keep ribbiting. 🐸"
              : ribbited >= 30
              ? "You're really into frogs, huh? 🐸"
              : "ribbit ribbit ribbit..."}
          </p>
        )}
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { opacity: 1; transform: translateY(0) scale(1.2); }
          100% { opacity: 0; transform: translateY(-28px) scale(1); }
        }
      `}</style>
    </div>
  );
}
