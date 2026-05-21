import React, { useState, useEffect, useRef } from "react";
import { BDO_CLASSES } from "../lib/bdo-classes";

type BdoClassEntry = {
  class_name: string;
  emoji_id:   string | null;
  emoji_name: string | null;
  animated:   boolean;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function sectorPath(cx: number, cy: number, r1: number, r2: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(cx, cy, r2, startAngle);
  const endOuter   = polarToCartesian(cx, cy, r2, endAngle);
  const startInner = polarToCartesian(cx, cy, r1, endAngle);
  const endInner   = polarToCartesian(cx, cy, r1, startAngle);
  const largeArc   = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${r2} ${r2} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${r1} ${r1} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

export default function ClassRoller() {
  const [classes, setClasses]       = useState<BdoClassEntry[]>([]);
  const [angle, setAngle]           = useState(0);
  const [spinning, setSpinning]     = useState(false);
  const [justLanded, setJustLanded] = useState(false);
  const wasSpinning = useRef(false);

  // Fetch BDO class list from DB; fall back to the static list if unavailable
  useEffect(() => {
    fetch("/api/bdo-classes")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setClasses(d);
        } else {
          setClasses(BDO_CLASSES.map(name => ({ class_name: name, emoji_id: null, emoji_name: null, animated: false })));
        }
      })
      .catch(() => {
        setClasses(BDO_CLASSES.map(name => ({ class_name: name, emoji_id: null, emoji_name: null, animated: false })));
      });
  }, []);

  const count = classes.length || 1;
  const slice = 360 / count;

  const normalizedAngle = ((angle % 360) + 360) % 360;
  const topAngle        = (360 - normalizedAngle) % 360;
  const pointedClass    = classes[Math.floor(topAngle / slice) % count]?.class_name ?? "…";

  useEffect(() => {
    if (wasSpinning.current && !spinning) {
      setJustLanded(true);
      const t = setTimeout(() => setJustLanded(false), 1500);
      return () => clearTimeout(t);
    }
    wasSpinning.current = spinning;
  }, [spinning]);

  function spin() {
    if (spinning || classes.length === 0) return;
    setSpinning(true);
    const spins  = Math.floor(Math.random() * 5) + 5;
    const pick   = Math.floor(Math.random() * classes.length);
    const target = spins * 360 + (360 - (pick * slice + slice / 2));
    setAngle(a => a + target);
    setTimeout(() => setSpinning(false), 4000);
  }

  return (
    <div className="flex flex-col items-center bg-slate-950 p-8 min-h-screen text-white">
      <h2 className="text-3xl font-bold mb-2">Class Roller</h2>
      <p className={`mb-8 text-lg font-bold tracking-wide transition-all duration-300 ${
        spinning ? "text-slate-500" : justLanded ? "text-amber-400 scale-125" : "text-slate-300"
      }`}>
        {spinning ? "Spinning…" : pointedClass}
      </p>

      <div className="relative">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 -mt-2">
          <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[24px] border-t-red-500" />
        </div>

        <svg viewBox="-142 -142 284 284" className="w-[600px] h-[600px] drop-shadow-2xl">
          <g
            transform={`rotate(${angle})`}
            style={{ transition: spinning ? "transform 4s cubic-bezier(0.15, 0, 0.15, 1)" : "none" }}
          >
            {classes.map((cls, i) => {
              const start   = i * slice;
              const end     = start + slice;
              const mid     = start + slice / 2;
              const path    = sectorPath(0, 0, 44, 132, start, end);
              const iconPos = polarToCartesian(0, 0, 108, mid);
              const textPos = polarToCartesian(0, 0, 56, mid);
              const fill    = i % 2 === 0 ? "#1e293b" : "#0f172a";
              const emojiUrl = cls.emoji_id
                ? `/api/discord/emoji-image/${cls.emoji_id}${cls.animated ? "?animated=1" : ""}`
                : null;

              return (
                <g key={cls.class_name}>
                  <path d={path} fill={fill} stroke="#334155" strokeWidth={0.3} />

                  {/* Class icon — Discord emoji image, or nothing if no emoji assigned */}
                  {emojiUrl && (
                    <image
                      href={emojiUrl}
                      x={iconPos.x - 10}
                      y={iconPos.y - 10}
                      width={20}
                      height={20}
                      transform={`rotate(${mid}, ${iconPos.x}, ${iconPos.y})`}
                    />
                  )}

                  {/* Radial text label */}
                  <text
                    x={textPos.x}
                    y={textPos.y}
                    fill="#cbd5e1"
                    fontSize="6"
                    fontWeight="bold"
                    textAnchor="start"
                    dominantBaseline="middle"
                    transform={`rotate(${mid - 90}, ${textPos.x}, ${textPos.y})`}
                  >
                    {cls.class_name.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Inner hub */}
          <circle cx="0" cy="0" r="42" fill="#020617" stroke="#334155" strokeWidth="2" />
          <circle cx="0" cy="0" r="6" fill="#334155" />
        </svg>
      </div>

      <button
        onClick={spin}
        disabled={spinning || classes.length === 0}
        className={`mt-10 px-8 py-3 rounded-full font-bold text-lg transition-all ${
          spinning || classes.length === 0
            ? "bg-slate-800 text-slate-500 cursor-not-allowed"
            : "bg-red-600 hover:bg-red-500 active:scale-95 shadow-lg shadow-red-900/20"
        }`}
      >
        {spinning ? "SPINNING..." : "SPIN THE WHEEL"}
      </button>
    </div>
  );
}
