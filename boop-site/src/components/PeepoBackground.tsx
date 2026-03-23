import React, { useEffect, useMemo, useState } from "react";

// Mix of static and animated peepo emotes from BTTV
const PEEPOS = [
  "https://cdn.betterttv.net/emote/5a16ee718c22a247ead62d4a/3x", // peepoHappy
  "https://cdn.betterttv.net/emote/5a16ddca8c22a247ead62ceb/3x", // peepoSad
  "https://cdn.betterttv.net/emote/5d38aaa592fc550c2d5996b8/3x", // peepoClap (gif)
  "https://cdn.betterttv.net/emote/5a5e0e8d80f53146a54a516b/3x", // peepoLove
  "https://cdn.betterttv.net/emote/5bc7ff14664a3b079648dd66/3x", // peepoRun (gif)
  "https://cdn.betterttv.net/emote/5d922afbc0652668c9e52ead/3x", // peepoArrive (gif)
  "https://cdn.betterttv.net/emote/5d324913ff6ed36801311fd2/3x", // peepoLeave (gif)
  "https://cdn.betterttv.net/emote/5eaa12a074046462f768344b/3x", // peepoShy (gif)
  "https://cdn.betterttv.net/emote/5a1702fb8c22a247ead62d95/3x", // peepoHug
  "https://cdn.betterttv.net/emote/5c04c335693c6324ee6a23b2/3x", // peepoPog
  "https://cdn.betterttv.net/emote/5ec059009af1ea16863b2dec/3x", // PETTHEPEEPO (gif)
  "https://cdn.betterttv.net/emote/5ebd239bf0fb3f168c4b58f0/3x", // widepeepoSad
];

const CELL = 52;

// Deterministic seeded random — same layout on every render
function rand(seed: number) {
  return ((Math.sin(seed) * 43758.5453) % 1 + 1) / 2;
}

// Calculate how many cols/rows are needed to fill the screen.
// Extra 60% accounts for the -25% top/left offset, scale(1.45), and drift animation.
function getCounts() {
  return {
    cols: Math.ceil(window.innerWidth  * 1.6 / CELL) + 2,
    rows: Math.ceil(window.innerHeight * 1.6 / CELL) + 2,
  };
}

export default function PeepoBackground() {
  const [{ cols, rows }, setSize] = useState(getCounts);

  useEffect(() => {
    const onResize = () => setSize(getCounts());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cells = useMemo(
    () => Array.from({ length: cols * rows }, (_, i) =>
      PEEPOS[Math.floor(rand(i * 7 + 3) * PEEPOS.length)]
    ),
    [cols, rows]
  );

  return (
    <>
      <style>{`
        @keyframes peepo-drift {
          0%   { transform: rotate(-11deg) scale(1.45) translate(0px, 0px); }
          100% { transform: rotate(-11deg) scale(1.45) translate(-${CELL * 2}px, -${CELL}px); }
        }
      `}</style>
      <div
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
        style={{ willChange: "transform" }}
        aria-hidden="true"
      >
        <div
          style={{
            position: "absolute",
            top: "-25%",
            left: "-25%",
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
            gridTemplateRows: `repeat(${rows}, ${CELL}px)`,
            opacity: 0.09,
            animation: "peepo-drift 35s ease-in-out infinite alternate",
            transformOrigin: "center center",
          }}
        >
          {cells.map((src, i) => (
            <img
              key={i}
              src={src}
              width={CELL}
              height={CELL}
              style={{ objectFit: "contain" }}
              loading="eager"
              decoding="sync"
            />
          ))}
        </div>
      </div>
    </>
  );
}
