import React, { useMemo, useState } from "react";

const DEFAULT_CLASSES = [
  { name: "Warrior", icon: "⚔️" },
  { name: "Ranger", icon: "🏹" },
  { name: "Sorceress", icon: "🔮" },
  { name: "Berserker", icon: "🪓" },
  { name: "Tamer", icon: "🐺" },
  { name: "Musa", icon: "🗡️" },
  { name: "Maehwa", icon: "🌸" },
  { name: "Valkyrie", icon: "🛡️" },
  { name: "Wizard", icon: "🔥" },
  { name: "Witch", icon: "🌙" },
];

function useSpinWheel(items: any[]) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    const spins = Math.floor(Math.random() * 6) + 4;
    const pick = Math.floor(Math.random() * items.length);
    const slice = 360 / items.length;
    // target so that picked slice lands at top (0deg)
    const target = spins * 360 + (360 - pick * slice - slice / 2) + (Math.random() * (slice - 6) - (slice - 6) / 2);
    setAngle(a => a + target);
    setTimeout(() => setSpinning(false), 3500);
  };
  return { angle, spin, spinning };
}

export default function Dice() {
  const items = useMemo(() => DEFAULT_CLASSES, []);
  const useWheel = items.length > 8; // fallback to wheel for many classes
  const { angle, spin, spinning } = useSpinWheel(items);

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold">Dice Roller</h2>
      <p className="text-sm text-muted-foreground">Animated roll; switches to wheel for large class counts.</p>

      <div className="mt-6 flex items-center justify-center">
        {useWheel ? (
          <div className="relative w-72 h-72">
            <div
              className="absolute inset-0 rounded-full overflow-hidden transition-transform duration-3500"
              style={{ transform: `rotate(${angle}deg)`, transition: spinning ? "transform 3.5s cubic-bezier(.1,.8,.2,1)" : undefined }}
            >
              {items.map((it, i) => {
                const slice = 360 / items.length;
                return (
                  <div
                    key={i}
                    style={{ transform: `rotate(${i * slice}deg)`, transformOrigin: "50% 50%" }}
                    className="absolute left-1/2 top-1/2 w-1/2 h-1/2 origin-left"
                  >
                    <div
                      className="w-full h-full flex items-center justify-start text-xs"
                      style={{ transform: `skewY(${-90 + slice}deg) rotate(${slice / 2}deg)` }}
                    >
                      <div className="w-full flex items-center gap-2 pl-3">
                        <span className="text-2xl">{it.icon}</span>
                        <span className="text-xs">{it.name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-6 h-6 bg-accent rounded-full shadow" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-48 h-48 rounded-lg shadow-lg bg-card grid place-items-center text-5xl animate-roll">
              🎲
            </div>
            <div className="grid grid-cols-4 gap-2">
              {items.slice(0, 8).map((it, i) => (
                <div key={i} className="p-3 rounded bg-muted text-center">
                  <div className="text-2xl">{it.icon}</div>
                  <div className="text-xs">{it.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <button className="btn btn-primary" onClick={spin} disabled={spinning}>
          {spinning ? "Spinning..." : "Roll"}
        </button>
      </div>
    </div>
  );
}
