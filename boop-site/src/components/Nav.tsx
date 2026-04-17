import React, { useEffect, useRef, useState } from "react";
import { useAuth, clearSession, isOfficerOrAdmin, updateUser } from "../lib/auth";
import type { AuthUser } from "../lib/auth";
import ClassSelect from "./ClassSelect";
import { TIMEZONES } from "../lib/timezones";

const NAV_GROUPS = [
  {
    key: "guild-info",
    label: "Guild Info",
    memberOnly: true,
    items: [
      { label: "Calendar",         href: "#/calendar",         route: "calendar",         officerOnly: false },
      { label: "Guild Directory",  href: "#/guild-directory",  route: "guild-directory",   officerOnly: false },
      { label: "Black Shrine",     href: "#/shrine",           route: "shrine",            officerOnly: false },
      { label: "Gear Leaderboard", href: "#/gear-leaderboard", route: "gear-leaderboard",  officerOnly: false },
      { label: "Nodewar",          href: "#/nodewar",          route: "nodewar",           officerOnly: false },
    ],
  },
  {
    key: "activities",
    label: "Activities",
    memberOnly: false,
    items: [
      { label: "Class Roller",       href: "#/class-roller",       route: "class-roller",       officerOnly: false },
      { label: "Name Shuffler",      href: "#/shuffler",           route: "shuffler",            officerOnly: false },
      { label: "Random Chooser",     href: "#/random-chooser",     route: "random-chooser",      officerOnly: false },
      { label: "Dice Roller",        href: "#/dice-roller",        route: "dice-roller",         officerOnly: false },
      { label: "Frogs",              href: "#/frogs",              route: "frogs",               officerOnly: false },
      { label: "Ribbit Leaderboard", href: "#/ribbit-leaderboard", route: "ribbit-leaderboard",  officerOnly: false },
    ],
  },
  {
    key: "callouts",
    label: "Callouts",
    memberOnly: false,
    items: [
      { label: "Hall of Fame", href: "#/employee",    route: "employee",    officerOnly: false },
      { label: "Wall of Shame",href: "#/wall",        route: "wall",        officerOnly: false },
      { label: "Submit",       href: "#/submit-wall", route: "submit-wall", officerOnly: false },
    ],
  },
] as const;

const ROLE_STYLE: Record<string, string> = {
  admin:   "bg-red-500/20 text-red-400 border border-red-500/30",
  officer: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  member:  "bg-slate-700/60 text-slate-400",
  friend:  "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  pending: "bg-slate-800/80 text-slate-500",
};

// ── Profile edit form (shared between desktop dropdown and mobile panel) ──────

function ProfileForm({ user, onSave }: { user: AuthUser; onSave?: () => void }) {
  const [famName,  setFamName]  = useState(user.family_name ?? "");
  const [email,    setEmail]    = useState(user.email ?? "");
  const [timezone, setTimezone] = useState(user.timezone ?? "");
  const [cls,      setCls]      = useState(user.bdo_class ?? "");
  const [altCls,   setAltCls]   = useState(user.alt_class ?? "");
  const [ap,       setAp]       = useState(user.gear_ap  != null ? String(user.gear_ap)  : "");
  const [aap,      setAap]      = useState(user.gear_aap != null ? String(user.gear_aap) : "");
  const [dp,       setDp]       = useState(user.gear_dp  != null ? String(user.gear_dp)  : "");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const token = () => localStorage.getItem("boop_session") ?? "";

  async function save() {
    setSaving(true);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({
        family_name: famName.trim() || null,
        email:    email.trim() || null,
        timezone: timezone || null,
        bdo_class: cls || null,
        alt_class: altCls || null,
        gear_ap:  ap  ? parseInt(ap)  : null,
        gear_aap: aap ? parseInt(aap) : null,
        gear_dp:  dp  ? parseInt(dp)  : null,
      }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      updateUser(updated);
      setSaved(true);
      setTimeout(() => { setSaved(false); onSave?.(); }, 1200);
    }
    setSaving(false);
  }

  const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors";
  const numInp = `${inp} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Family Name</label>
        <input value={famName} onChange={e => setFamName(e.target.value)} placeholder="BDO family name" className={inp} />
      </div>
      <div>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inp} />
      </div>
      <div>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Timezone</label>
        <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inp}>
          <option value="">— not set —</option>
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Class</label>
          <ClassSelect value={cls} onChange={setCls}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Alt / Tagged</label>
          <ClassSelect value={altCls} onChange={setAltCls}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Gear Score</label>
        <div className="grid grid-cols-3 gap-2">
          {(["AP", "AAP", "DP"] as const).map(label => {
            const val = label === "AP" ? ap : label === "AAP" ? aap : dp;
            const set = label === "AP" ? setAp : label === "AAP" ? setAap : setDp;
            return (
              <div key={label}>
                <p className="text-[9px] text-slate-600 mb-1 text-center">{label}</p>
                <input type="number" min={0} max={9999} value={val}
                  onChange={e => set(e.target.value)} placeholder="—" className={numInp} />
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className={`w-full py-2 rounded-lg text-sm font-bold transition-colors mt-0.5 ${
          saved ? "bg-green-600/20 text-green-400 border border-green-500/30"
                : "bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white"
        }`}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}

// ── Desktop profile dropdown ──────────────────────────────────────────────────

function ProfileDropdown({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const token = () => localStorage.getItem("boop_session") ?? "";
  return (
    <div className="absolute top-full right-0 mt-1.5 w-72 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-50 py-3">
      <div className="px-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          {user.discord_avatar ? (
            <img src={user.discord_avatar} alt="" className="w-8 h-8 rounded-full border border-violet-500/40 shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-sm font-black text-violet-300 shrink-0">
              {user.username[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-white leading-tight">{user.username}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${ROLE_STYLE[user.role] ?? ROLE_STYLE.member}`}>
              {user.role}
            </span>
          </div>
        </div>
      </div>
      <div className="px-4 pt-3">
        <ProfileForm user={user} />
      </div>
      <div className="mt-3 pt-2 border-t border-slate-800 px-4">
        <button
          onClick={() => {
            const t = token();
            onClose();
            clearSession();
            if (t) fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
          }}
          className="w-full text-left text-sm text-slate-500 hover:text-white transition-colors py-1"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

interface NavProps { route: string; }

export default function Nav({ route }: NavProps) {
  const user = useAuth();
  const [openGroup,     setOpenGroup]     = useState<string | null>(null);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null); // expanded group in mobile menu
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpenGroup(null); setMobileOpen(false); }, [route]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [mobileOpen]);

  const hasGear = user && (user.family_name || user.bdo_class || user.gear_ap != null || user.gear_aap != null || user.gear_dp != null);
  const token   = () => localStorage.getItem("boop_session") ?? "";

  function signOut() {
    const t = token();
    setMobileOpen(false);
    setOpenGroup(null);
    clearSession();
    if (t) fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
  }

  return (
    <>
      {/* Overlay for desktop dropdowns */}
      {openGroup && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
      )}

      <nav ref={mobileRef} className="fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/60">

        {/* ── Main bar ── */}
        <div className="h-14 px-4 md:px-6 flex items-center gap-1 max-w-7xl mx-auto">

          {/* Logo */}
          <a href="#/" className="shrink-0 font-black text-lg tracking-tight text-white mr-3">
            boop<span className="text-violet-400">.fish</span>
          </a>

          {/* ── Desktop nav ── */}
          <div className="hidden md:flex items-center gap-1 flex-1">
            <a href="#/"
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                route === "home" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              Home
            </a>

            {NAV_GROUPS.map(group => {
              if (group.memberOnly && (!user || user.role === "pending")) return null;
              const isGroupActive = group.items.some(i => i.route === route);
              const isOpen = openGroup === group.key;
              return (
                <div key={group.key} className="relative">
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : group.key)}
                    className={`flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isGroupActive || isOpen ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    {group.label}
                    <svg className={`w-3 h-3 opacity-50 transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-44 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl py-1.5 z-50">
                      {group.items.filter(item =>
                        (!item.officerOnly || isOfficerOrAdmin(user)) &&
                        (!item.memberOnly  || (user?.role !== "friend" && user?.role !== "pending"))
                      ).map(item => (
                        <a key={item.href} href={item.href} onClick={() => setOpenGroup(null)}
                          className={`flex items-center px-3 py-2 text-sm transition-colors ${
                            route === item.route ? "text-white bg-slate-800/80 font-semibold" : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                          }`}
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {user && (
              <a href="#/quotes"
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  route === "quotes" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                Quotes
              </a>
            )}

            <div className="flex-1" />

            {user && isOfficerOrAdmin(user) && (
              <a href="#/manage"
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  route === "manage" ? "bg-slate-800 text-white" : "text-amber-400/80 hover:text-amber-300 hover:bg-slate-800/60"
                }`}
              >
                Manage
              </a>
            )}

            {user ? (
              <div className="shrink-0 relative">
                <button
                  onClick={() => setOpenGroup(openGroup === "profile" ? null : "profile")}
                  className={`flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-xl transition-colors ${
                    openGroup === "profile" ? "bg-slate-800" : "hover:bg-slate-800/60"
                  }`}
                >
                  {user.discord_avatar ? (
                    <img src={user.discord_avatar} alt="" className="w-7 h-7 rounded-full border border-violet-500/40 shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-xs font-black text-violet-300 shrink-0">
                      {user.username[0].toUpperCase()}
                    </div>
                  )}
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-200 leading-tight">{user.username}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${ROLE_STYLE[user.role] ?? ROLE_STYLE.member}`}>
                        {user.role}
                      </span>
                    </div>
                    {hasGear ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {user.family_name && <span className="text-[10px] text-violet-400 font-semibold leading-none">{user.family_name}</span>}
                        {user.bdo_class   && <span className="text-[10px] text-slate-500 font-semibold leading-none">{user.bdo_class}</span>}
                        {(user.gear_ap != null || user.gear_aap != null || user.gear_dp != null) && (
                          <span className="text-[10px] text-slate-500 font-mono leading-none">
                            {user.gear_ap ?? "—"}/{user.gear_aap ?? "—"}/{user.gear_dp ?? "—"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-600 leading-none mt-0.5">Set up your profile</p>
                    )}
                  </div>
                  <svg className={`w-3 h-3 text-slate-600 transition-transform shrink-0 ${openGroup === "profile" ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {openGroup === "profile" && (
                  <ProfileDropdown user={user} onClose={() => setOpenGroup(null)} />
                )}
              </div>
            ) : (
              <a href="#/auth"
                className={`shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  route === "auth" ? "bg-violet-500 text-white" : "bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 hover:text-violet-200"
                }`}
              >
                Login
              </a>
            )}
          </div>

          {/* ── Mobile right side ── */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            {user ? (
              <>
                {/* Avatar chip */}
                {user.discord_avatar ? (
                  <img src={user.discord_avatar} alt="" className="w-7 h-7 rounded-full border border-violet-500/40" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-xs font-black text-violet-300">
                    {user.username[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-semibold text-slate-200">{user.username}</span>
              </>
            ) : (
              <a href="#/auth"
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-600/20 text-violet-300 border border-violet-500/30"
              >
                Login
              </a>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              aria-label="Menu"
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ── */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-800/60 max-h-[80vh] overflow-y-auto">

            {/* Nav links */}
            <div className="px-4 py-3 space-y-1">
              <a href="#/" onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  route === "home" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                Home
              </a>

              {NAV_GROUPS.map(group => {
                if (group.memberOnly && (!user || user.role === "pending")) return null;
                const visibleItems = group.items.filter(item =>
  (!item.officerOnly || isOfficerOrAdmin(user)) &&
  (!item.memberOnly  || (user?.role !== "friend" && user?.role !== "pending"))
);
                if (!visibleItems.length) return null;
                const isExpanded = mobileSection === group.key;
                return (
                  <div key={group.key}>
                    <button
                      onClick={() => setMobileSection(isExpanded ? null : group.key)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                    >
                      {group.label}
                      <svg className={`w-3.5 h-3.5 opacity-50 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
                        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-800 pl-3">
                        {visibleItems.map(item => (
                          <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                              route === item.route ? "text-white bg-slate-800/80 font-semibold" : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                            }`}
                          >
                            {item.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {user && (
                <a href="#/quotes" onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    route === "quotes" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  Quotes
                </a>
              )}

              {user && isOfficerOrAdmin(user) && (
                <a href="#/manage" onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    route === "manage" ? "bg-slate-800 text-white" : "text-amber-400/80 hover:text-amber-300 hover:bg-slate-800/60"
                  }`}
                >
                  Manage
                </a>
              )}
            </div>

            {/* Profile section */}
            {user && (
              <div className="border-t border-slate-800/60 px-4 py-4">
                <button
                  onClick={() => setMobileSection(mobileSection === "profile" ? null : "profile")}
                  className="w-full flex items-center justify-between mb-3"
                >
                  <div className="flex items-center gap-2.5">
                    {user.discord_avatar ? (
                      <img src={user.discord_avatar} alt="" className="w-8 h-8 rounded-full border border-violet-500/40 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-sm font-black text-violet-300 shrink-0">
                        {user.username[0].toUpperCase()}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-bold text-white leading-tight">{user.username}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${ROLE_STYLE[user.role] ?? ROLE_STYLE.member}`}>
                        {user.role}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{mobileSection === "profile" ? "Hide" : "Edit profile"}</span>
                </button>

                {mobileSection === "profile" && (
                  <div className="mb-3">
                    <ProfileForm user={user} onSave={() => setMobileSection(null)} />
                  </div>
                )}

                <button onClick={signOut}
                  className="w-full text-left text-sm text-slate-500 hover:text-white transition-colors py-1"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
