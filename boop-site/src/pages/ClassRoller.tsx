import React, { useState, useEffect, useRef } from "react";

const SPRITE_URL = "/assets/class-sprite.png";
// Sprite is 100x1600, two 50x50 columns (left=white, right=gold), 31 rows matching class order
const SPRITE_ICON_SIZE = 50;
const SPRITE_COL_X = 50; // right (gold) column

import { BDO_CLASSES as CLASSES } from "../lib/bdo-classes";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function sectorPath(cx: number, cy: number, r1: number, r2: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(cx, cy, r2, startAngle);
  const endOuter = polarToCartesian(cx, cy, r2, endAngle);
  const startInner = polarToCartesian(cx, cy, r1, endAngle);
  const endInner = polarToCartesian(cx, cy, r1, startAngle);

  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${r2} ${r2} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${r1} ${r1} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z"
  ].join(" ");
}

export default function ClassRoller() {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [justLanded, setJustLanded] = useState(false);
  const wasSpinning = useRef(false);

  const slice = 360 / CLASSES.length;

  // Which class is under the pointer right now
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const topAngle = (360 - normalizedAngle) % 360;
  const pointedClass = CLASSES[Math.floor(topAngle / slice) % CLASSES.length];

  // Flash "just landed" for 1.5 s when spin stops
  useEffect(() => {
    if (wasSpinning.current && !spinning) {
      setJustLanded(true);
      const t = setTimeout(() => setJustLanded(false), 1500);
      return () => clearTimeout(t);
    }
    wasSpinning.current = spinning;
  }, [spinning]);

  function spin() {
    if (spinning) return;
    setSpinning(true);
    const spins = Math.floor(Math.random() * 5) + 5;
    const pick = Math.floor(Math.random() * CLASSES.length);
    const target = spins * 360 + (360 - (pick * slice + slice / 2));
    setAngle(a => a + target);
    setTimeout(() => setSpinning(false), 4000);
  }

  return (
    <div className="flex flex-col items-center bg-slate-950 p-8 min-h-screen text-white">
      <h2 className="text-3xl font-bold mb-2">Class Roller</h2>
      <p className={`mb-8 text-lg font-bold tracking-wide transition-all duration-300 ${
        spinning
          ? "text-slate-500"
          : justLanded
          ? "text-amber-400 scale-125"
          : "text-slate-300"
      }`}>
        {spinning ? "Spinning…" : pointedClass}
      </p>

      <div className="relative">
        {/* Pointer Arrow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 -mt-2">
          <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[24px] border-t-red-500" />
        </div>

        {/* viewBox gives ~21px gap at top so pointer aligns with outer rim */}
        <svg viewBox="-142 -142 284 284" className="w-[600px] h-[600px] drop-shadow-2xl">
          <g transform={`rotate(${angle})`} style={{ transition: spinning ? "transform 4s cubic-bezier(0.15, 0, 0.15, 1)" : "none" }}>
            {CLASSES.map((name, i) => {
              const start = i * slice;
              const end = start + slice;
              const mid = start + slice / 2;
              const path = sectorPath(0, 0, 44, 132, start, end);

              const iconPos = polarToCartesian(0, 0, 108, mid);
              const textPos = polarToCartesian(0, 0, 56, mid);

              const fill = i % 2 === 0 ? "#1e293b" : "#0f172a";

              return (
                <g key={name}>
                  {/* Slice */}
                  <path d={path} fill={fill} stroke="#334155" strokeWidth={0.3} />

                  {/* Class Icon — crops the gold column of the sprite */}
                  <g transform={`rotate(${mid}, ${iconPos.x}, ${iconPos.y})`}>
                    <svg
                      x={iconPos.x - 10}
                      y={iconPos.y - 10}
                      width={20}
                      height={20}
                      viewBox={`${SPRITE_COL_X} ${i * SPRITE_ICON_SIZE} ${SPRITE_ICON_SIZE} ${SPRITE_ICON_SIZE}`}
                    >
                      <image href={SPRITE_URL} width={100} height={1600} />
                    </svg>
                  </g>

                  {/* Radial Text */}
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
                    {name.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Inner decorative circle */}
          <circle cx="0" cy="0" r="42" fill="#020617" stroke="#334155" strokeWidth="2" />
          <circle cx="0" cy="0" r="6" fill="#334155" />
        </svg>
      </div>

      <button
        onClick={spin}
        disabled={spinning}
        className={`mt-10 px-8 py-3 rounded-full font-bold text-lg transition-all ${
          spinning
            ? "bg-slate-800 text-slate-500 cursor-not-allowed"
            : "bg-red-600 hover:bg-red-500 active:scale-95 shadow-lg shadow-red-900/20"
        }`}
      >
        {spinning ? "SPINNING..." : "SPIN THE WHEEL"}
      </button>
    </div>
  );
}
