import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

export interface DieSpec {
  qty: number;
  sides: number;
}

export interface Dice3DHandle {
  roll: (dice: DieSpec[]) => Promise<{ sides: number; value: number }[]>;
  clear: () => void;
}

const CONTAINER_ID = "dice-box-canvas-container";

const Dice3D = forwardRef<Dice3DHandle>((_, ref) => {
  const boxRef = useRef<any>(null);
  const readyRef = useRef<Promise<void>>();

  useEffect(() => {
    let cancelled = false;

    // Load dice-box from our static /dice-box/ route so the bundler
    // never touches it — dice-box uses relative dynamic imports internally
    // (./world.offscreen.js etc.) that need to resolve from their own URL.
    const url = "/dice-box/dice-box.es.js";

    readyRef.current = (async () => {
      const mod = await import(/* @vite-ignore */ url as any);
      if (cancelled) return;
      const DiceBox = mod.default;

      // dice-box requires a CSS selector string, not a DOM element
      const box = new DiceBox({
        id: "dice-canvas",
        assetPath: "/dice-box/assets/",
        container: `#${CONTAINER_ID}`,
        gravity: 2,
        mass: 1,
        friction: 0.8,
        restitution: 0.4,
        angularDamping: 0.4,
        linearDamping: 0.4,
        spinForce: 5,
        throwForce: 4,
        startingHeight: 8,
        settleTimeout: 5000,
        theme: "default",
        themeColor: "#7c3aed",
        scale: 5,
      });

      await box.init();
      if (cancelled) return;
      boxRef.current = box;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    // dice-box accepts an array of {qty, sides} objects for multiple die types
    roll: async (dice: DieSpec[]) => {
      await readyRef.current;
      if (!boxRef.current) return [];
      return boxRef.current.roll(dice);
    },
    clear: () => {
      boxRef.current?.clear?.();
    },
  }));

  return (
    <div
      id={CONTAINER_ID}
      className="w-full rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 [&>canvas]:block [&>canvas]:w-full [&>canvas]:h-full"
      style={{ height: 380, position: "relative" }}
    />
  );
});

export default Dice3D;
