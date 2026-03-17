import React, { useEffect, useRef, useState } from "react";
import { BDO_CLASSES } from "../lib/bdo-classes";

export default function ClassSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen]   = useState(false);
  const inputRef          = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = BDO_CLASSES.filter(c =>
    c.toLowerCase().includes(query.toLowerCase())
  );

  function select(cls: string) {
    onChange(cls);
    setQuery(cls);
    setOpen(false);
  }

  const base = className ?? "w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-violet-500 transition-colors";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search class…"
        autoComplete="off"
        className={base}
      />
      {query && (
        <button
          onMouseDown={e => { e.preventDefault(); setQuery(""); onChange(""); inputRef.current?.focus(); setOpen(true); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 text-xs"
        >✕</button>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50">
          {filtered.map(cls => (
            <button
              key={cls}
              onMouseDown={() => select(cls)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                cls === value
                  ? "bg-violet-600/30 text-violet-300 font-semibold"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
