import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import Events from "./Events";
import CalendarPage from "./CalendarPage";
import Attendance from "./Attendance";
import ShrineAvailability from "./ShrineAvailability";

type Tab = "events" | "calendar" | "attendance" | "availability";

function getTabFromHash(): Tab {
  const raw = location.hash.replace(/^#\/?/, "");
  const segment = raw.split("?")[0].split("/")[0];
  if (segment === "events") return "events";
  if (segment === "attendance") return "attendance";
  if (segment === "availability") return "availability";
  const params = new URLSearchParams(raw.split("?")[1] ?? "");
  const t = params.get("tab");
  if (t === "events" || t === "calendar" || t === "attendance" || t === "availability") return t;
  return "events";
}

const TABS: { key: Tab; label: string }[] = [
  { key: "events",       label: "Events" },
  { key: "calendar",     label: "Calendar" },
  { key: "attendance",   label: "Attendance" },
  { key: "availability", label: "Availability" },
];

export default function CalendarHub() {
  const user = useAuth();
  const [tab, setTab] = useState<Tab>(getTabFromHash);

  useEffect(() => {
    function onHash() { setTab(getTabFromHash()); }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);

  return (
    <div>
      <div className="sticky top-14 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex gap-0.5 pt-1">
          {TABS.map(t => (
            <a
              key={t.key}
              href={`#/calendar?tab=${t.key}`}
              className={`px-5 py-2.5 text-sm font-medium transition-colors rounded-t-lg border-b-2 -mb-px ${
                tab === t.key
                  ? "text-white border-violet-500"
                  : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/40"
              }`}
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      {tab === "events"       && <Events />}
      {tab === "calendar"     && <CalendarPage />}
      {tab === "attendance"   && <Attendance />}
      {tab === "availability" && <ShrineAvailability key={user?.id ?? "guest"} />}
    </div>
  );
}
