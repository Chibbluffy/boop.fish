import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { TIMEZONES } from "../lib/timezones";

type Member = {
  username: string;
  family_name: string | null;
  discord_name: string | null;
  bdo_class: string | null;
  alt_class: string | null;
  gear_ap: number | null;
  gear_aap: number | null;
  gear_dp: number | null;
  gs: number;
  timezone: string | null;
  ribbit_count: number;
  play_status: string | null;
  guild_rank: string | null;
  role: string;
};

type SortKey = "gs" | "ribbit_count" | "username" | "timezone";

const STATUS_STYLE: Record<string, string> = {
  "Active PvP":  "bg-red-500/20 text-red-400 border-red-500/30",
  "Active PvE":  "bg-green-500/20 text-green-400 border-green-500/30",
  "Semi-Active": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "AFK":         "bg-slate-600/30 text-slate-400 border-slate-600/50",
  "Inactive":    "bg-slate-800/60 text-slate-500 border-slate-700/50",
};

const RANK_STYLE: Record<string, string> = {
  "GM":        "text-red-400",
  "Advisor":   "text-orange-400",
  "Staff":     "text-blue-400",
  "Secretary": "text-violet-400",
  "Officer":   "text-amber-400",
  "CN/QM":     "text-cyan-400",
  "Member":    "text-slate-500",
};

// Map role → display rank when no guild_rank is set
const ROLE_RANK: Record<string, string> = {
  admin: "GM", officer: "Officer", member: "Member", pending: "Pending",
};

function tzShort(value: string | null): string {
  if (!value) return "—";
  const entry = TIMEZONES.find(t => t.value === value);
  if (!entry) return value;
  // Extract the abbreviation part e.g. "Eastern (ET, UTC-5/-4)" → "ET"
  const m = entry.label.match(/\(([^,)]+)/);
  return m ? m[1] : entry.label.split(" ")[0];
}

function tzFull(value: string | null): string {
  if (!value) return "No timezone set";
  return TIMEZONES.find(t => t.value === value)?.label ?? value;
}

// All BDO classes from the project
const BDO_CLASSES = [
  "Archer","Berserker","Dark Knight","Guardian","Hashashin","Lahn","Maehwa",
  "Musa","Mystic","Ninja","Nova","Ranger","Sage","Scholar","Sorceress",
  "Striker","Tamer","Valkyrie","Warrior","Witch","Wizard","Woosa","Drakania",
  "Maegu","Acher","Dosa",
];

export default function GuildDirectory() {
  const user = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]               = useState("");
  const [filterClass, setFilterClass]     = useState("");
  const [filterStatus, setFilterStatus]   = useState("");
  const [filterTimezone, setFilterTimezone] = useState("");
  const [sortKey, setSortKey]             = useState<SortKey>("username");
  const [sortDir, setSortDir]             = useState<1 | -1>(1);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    const token = localStorage.getItem("boop_session") ?? "";
    fetch("/api/guild-members", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500">Members only.</p>
      </div>
    );
  }

  // Collect values that actually appear
  const classesInUse = Array.from(new Set(members.map(m => m.bdo_class).filter(Boolean))) as string[];
  classesInUse.sort();
  const timezonesInUse = Array.from(new Set(members.map(m => m.timezone).filter(Boolean))) as string[];
  timezonesInUse.sort((a, b) => {
    const la = TIMEZONES.find(t => t.value === a)?.label ?? a;
    const lb = TIMEZONES.find(t => t.value === b)?.label ?? b;
    return la.localeCompare(lb);
  });

  const PLAY_STATUSES = ["Active PvP", "Active PvE", "Semi-Active", "AFK", "Inactive"];

  const filtered = members
    .filter(m => {
      const q = search.toLowerCase();
      if (q &&
        !m.username.toLowerCase().includes(q) &&
        !(m.family_name?.toLowerCase().includes(q)) &&
        !(m.discord_name?.toLowerCase().includes(q)) &&
        !(m.bdo_class?.toLowerCase().includes(q)) &&
        !(m.alt_class?.toLowerCase().includes(q))
      ) return false;
      if (filterClass    && m.bdo_class   !== filterClass)    return false;
      if (filterStatus   && m.play_status !== filterStatus)   return false;
      if (filterTimezone && m.timezone    !== filterTimezone) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "username") return a.username.localeCompare(b.username) * sortDir;
      if (sortKey === "timezone") {
        const la = tzShort(a.timezone);
        const lb = tzShort(b.timezone);
        return la.localeCompare(lb) * sortDir;
      }
      return ((b[sortKey] as number) - (a[sortKey] as number)) * sortDir;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(key === "username" ? 1 : -1); }
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
        sortKey === k
          ? "bg-violet-600/20 text-violet-300 border-violet-500/40"
          : "text-slate-500 border-slate-800 hover:text-white hover:border-slate-700"
      }`}
    >
      {label}
      {sortKey === k && <span className="text-[10px] opacity-70">{sortDir === 1 ? "↑" : "↓"}</span>}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-black text-white">Guild Directory</h1>
        <span className="text-sm text-slate-500">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, family, discord, class…"
          className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-colors">
          <option value="">All classes</option>
          {classesInUse.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-colors">
          <option value="">All statuses</option>
          {PLAY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={filterTimezone} onChange={e => setFilterTimezone(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-colors">
          <option value="">All timezones</option>
          {timezonesInUse.map(tz => (
            <option key={tz} value={tz}>{tzShort(tz)}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-slate-600 mr-1">Sort:</span>
          <SortBtn k="username"     label="Name" />
          <SortBtn k="gs"           label="GS" />
          <SortBtn k="ribbit_count" label="Frogs" />
          <SortBtn k="timezone"     label="TZ" />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-600 text-center py-16">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-600 text-center py-16">No members match.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {filtered.map(m => {
            const rank = m.guild_rank ?? ROLE_RANK[m.role] ?? "Member";
            const rankColor = RANK_STYLE[rank] ?? RANK_STYLE["Member"];
            const statusStyle = m.play_status ? (STATUS_STYLE[m.play_status] ?? "") : "";
            const hasGear = m.gear_ap != null || m.gear_aap != null || m.gear_dp != null;
            const initials = m.username[0].toUpperCase();

            return (
              <div key={m.username}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 hover:border-slate-700 transition-colors"
              >
                {/* Top row: avatar + name + rank/status */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                    m.role === "admin"   ? "bg-red-500/20 text-red-300 border border-red-500/20" :
                    m.role === "officer" ? "bg-amber-500/20 text-amber-300 border border-amber-500/20" :
                                          "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white leading-tight truncate">{m.username}</p>
                    {m.family_name && (
                      <p className="text-xs text-slate-500 leading-tight truncate">{m.family_name}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold leading-none ${rankColor}`}>{rank}</span>
                      {m.play_status && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${statusStyle}`}>
                          {m.play_status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Class + Gear row */}
                <div className="flex items-center justify-between gap-2 bg-slate-800/50 rounded-xl px-3 py-2">
                  <div>
                    {m.bdo_class ? (
                      <p className="text-xs font-semibold text-violet-300">
                        {m.bdo_class}{m.alt_class && <span className="text-slate-500">/{m.alt_class}</span>}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-600">No class</p>
                    )}
                    {hasGear && (
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {m.gear_ap ?? "—"} / {m.gear_aap ?? "—"} / {m.gear_dp ?? "—"}
                      </p>
                    )}
                  </div>
                  {m.gs > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-600 uppercase tracking-widest">GS</p>
                      <p className="text-sm font-black text-slate-200 tabular-nums">{m.gs}</p>
                    </div>
                  )}
                </div>

                {/* Info row: timezone + frogs + discord */}
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Timezone</span>
                    <span className="text-slate-300 font-mono" title={tzFull(m.timezone)}>
                      {tzShort(m.timezone)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Frogs 🐸</span>
                    <span className={`font-bold tabular-nums ${m.ribbit_count > 0 ? "text-green-400" : "text-slate-700"}`}>
                      {m.ribbit_count.toLocaleString()}
                    </span>
                  </div>
                  {m.discord_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Discord</span>
                      <span className="text-slate-400 truncate max-w-[140px]">{m.discord_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
