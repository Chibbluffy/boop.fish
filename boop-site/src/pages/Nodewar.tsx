import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type WarDate    = { date: string; count: number };
type WarMessage = {
  message_id:  string;
  posted_at:   string;
  author_name: string | null;
  images:      string[];
  links:       string[];
};

function token() { return localStorage.getItem("boop_session") ?? ""; }
function authH() { return { Authorization: `Bearer ${token()}` }; }

async function refreshUrls(urls: string[]): Promise<Record<string, string>> {
  if (!urls.length) return {};
  const res = await fetch("/api/quotes/refresh-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authH() },
    body: JSON.stringify({ urls }),
  });
  return res.ok ? res.json() : {};
}

function fmtDate(dateStr: string) {
  const d = String(dateStr).slice(0, 10);
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function dateKey(dateStr: string) {
  return String(dateStr).slice(0, 10);
}

export default function Nodewar() {
  const user = useAuth();

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [dates,       setDates]       = useState<WarDate[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [configured,  setConfigured]  = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [messages,    setMessages]    = useState<WarMessage[]>([]);
  const [loadingDate, setLoadingDate] = useState(false);
  const [urlMap,      setUrlMap]      = useState<Record<string, string>>({});
  const [lightbox,    setLightbox]    = useState<string | null>(null);

  // Load date list on mount
  useEffect(() => {
    if (!user || user.role === "pending") return;
    fetch(`/api/war-scores/dates?tz=${encodeURIComponent(browserTz)}`, { headers: authH() })
      .then(r => r.json())
      .then(d => {
        setDates(d.dates ?? []);
        setSyncing(d.syncing ?? false);
        setConfigured(d.configured ?? true);
        if (d.dates?.length) setSelectedDate(dateKey(d.dates[0].date));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Poll while syncing and nothing is in DB yet
  useEffect(() => {
    if (!syncing || dates.length > 0) return;
    const id = setInterval(() => {
      fetch(`/api/war-scores/dates?tz=${encodeURIComponent(browserTz)}`, { headers: authH() })
        .then(r => r.json())
        .then(d => {
          setSyncing(d.syncing ?? false);
          if (d.dates?.length) {
            setDates(d.dates);
            setSelectedDate(dateKey(d.dates[0].date));
            clearInterval(id);
          }
        });
    }, 3000);
    return () => clearInterval(id);
  }, [syncing, dates.length]);

  // Load messages whenever selected date changes
  useEffect(() => {
    if (!selectedDate || !user || user.role === "pending") return;
    let cancelled = false;
    setLoadingDate(true);
    setMessages([]);
    setUrlMap({});

    fetch(`/api/war-scores/date/${dateKey(selectedDate)}?tz=${encodeURIComponent(browserTz)}`, { headers: authH() })
      .then(r => r.json())
      .then(async (data: WarMessage[]) => {
        if (cancelled) return;
        setMessages(data);
        const allImages = data.flatMap(m => m.images);
        if (allImages.length) {
          const fresh = await refreshUrls(allImages);
          if (!cancelled) setUrlMap(fresh);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDate(false); });

    return () => { cancelled = true; };
  }, [selectedDate, user]);

  if (!user || user.role === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">⚔️</p>
          <p className="text-white font-bold text-lg">Members only</p>
          <p className="text-slate-500 mt-2 text-sm">
            {!user ? "Sign in to view nodewar scores." : "Your account is pending approval."}
          </p>
        </div>
      </div>
    );
  }

  const allImages = messages.flatMap(m => m.images);
  const allLinks  = [...new Set(messages.flatMap(m => m.links))];

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10">
      <div className="max-w-6xl mx-auto">

        <div className="mb-8">
          <h2 className="text-4xl font-black tracking-tight text-white">Nodewar</h2>
          <p className="text-slate-400 mt-1">Guild war score history from Discord.</p>
        </div>

        {!configured ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <p className="text-slate-400 text-sm">War scores channel not configured.</p>
            <p className="text-slate-600 text-xs mt-2">
              Add <code className="font-mono bg-slate-800 px-1 rounded">WAR_SCORES_CHANNEL_ID</code> to the server environment.
            </p>
          </div>
        ) : loading ? (
          <p className="text-slate-500 text-center py-20">Loading…</p>
        ) : syncing && dates.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-block w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-sm">Syncing messages from Discord…</p>
            <p className="text-slate-600 text-xs mt-1">This only happens on first load.</p>
          </div>
        ) : dates.length === 0 ? (
          <p className="text-slate-600 text-center py-20">No messages found in the war scores channel.</p>
        ) : (
          <div className="flex gap-6">

            {/* ── Date sidebar ── */}
            <div className="w-52 shrink-0 flex flex-col gap-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-2 mb-1 flex items-center gap-1.5">
                Dates
                {syncing && (
                  <span className="text-[10px] text-violet-400 font-normal">· syncing</span>
                )}
              </p>
              {dates.map(d => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(dateKey(d.date))}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    selectedDate === dateKey(d.date)
                      ? "bg-slate-800 border-slate-600 text-white"
                      : "border-transparent text-slate-400 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  <p className="text-xs font-bold">{fmtDate(d.date)}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {d.count} message{d.count !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>

            {/* ── Content panel ── */}
            <div className="flex-1 min-w-0">
              {loadingDate ? (
                <p className="text-slate-500 text-sm py-4">Loading…</p>
              ) : !selectedDate ? (
                <p className="text-slate-600 text-sm">Select a date on the left.</p>
              ) : allImages.length === 0 && allLinks.length === 0 ? (
                <p className="text-slate-600 text-sm italic">No media found for this date.</p>
              ) : (
                <>
                  <h3 className="text-xl font-black text-white mb-5">{fmtDate(selectedDate)}</h3>

                  {/* External links */}
                  {allLinks.length > 0 && (
                    <div className="mb-6">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                        Links
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {allLinks.map((link, i) => {
                          let host = link;
                          try { host = new URL(link).hostname; } catch {}
                          return (
                            <a
                              key={i}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                            >
                              <svg className="w-3.5 h-3.5 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                              </svg>
                              {host}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Screenshots grid */}
                  {allImages.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                        Screenshots ({allImages.length})
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {allImages.map((src, i) => {
                          const url = urlMap[src] ?? src;
                          return (
                            <button
                              key={i}
                              onClick={() => setLightbox(url)}
                              className="aspect-video rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition-colors group"
                            >
                              <img
                                src={url}
                                alt={`war-score-${i + 1}`}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="war score" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}
