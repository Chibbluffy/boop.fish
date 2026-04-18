import { useEffect, useState } from "react";
import { useAuth, getToken } from "../lib/auth";

type KeywordRow = { keyword: string; count: number };
type Quote = { id: string; nadeko_id: string | null; author_name: string | null; text: string };

function looksLikeImage(text: string): boolean {
  return /^https?:\/\//.test(text) && (
    text.includes("cdn.discordapp.com") ||
    /\.(png|jpe?g|gif|webp)(\?|$)/i.test(text)
  );
}

function QuoteImage({ src, refreshed }: { src: string; refreshed: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const url = refreshed ?? src;
  if (failed) return <span className="text-xs text-slate-600 italic">Image unavailable</span>;
  return (
    <img
      src={url}
      loading="lazy"
      alt="quote"
      className="max-w-sm max-h-72 rounded-lg border border-slate-800/60 object-contain bg-slate-900/60"
      onError={() => setFailed(true)}
    />
  );
}

function ChevronRight({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 6 10" fill="none">
      <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

async function refreshImageUrls(urls: string[]): Promise<Record<string, string>> {
  if (!urls.length) return {};
  const res = await fetch("/api/quotes/refresh-urls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) return {};
  return res.json();
}

export default function Quotes() {
  const user = useAuth();
  const [keywords, setKeywords]         = useState<KeywordRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [openKws, setOpenKws]           = useState<Set<string>>(new Set());
  const [loadingKws, setLoadingKws]     = useState<Set<string>>(new Set());
  const [cache, setCache]               = useState<Record<string, Quote[]>>({});
  // original URL → refreshed URL, accumulated across all opened keywords
  const [urlMap, setUrlMap]             = useState<Record<string, string>>({});
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/quotes/keywords", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then(r => r.json())
      .then(data => { setKeywords(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 font-semibold mb-2">Login required</p>
          <a href="#/auth" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
            Go to login →
          </a>
        </div>
      </div>
    );
  }

  const filtered = search.trim()
    ? keywords.filter(k => k.keyword.toLowerCase().includes(search.toLowerCase()))
    : keywords;

  const totalQuotes = keywords.reduce((s, k) => s + k.count, 0);

  async function toggleKeyword(keyword: string) {
    const isOpen = openKws.has(keyword);
    setOpenKws(prev => {
      const next = new Set(prev);
      if (isOpen) next.delete(keyword); else next.add(keyword);
      return next;
    });

    if (!isOpen && !cache[keyword]) {
      setLoadingKws(prev => new Set(prev).add(keyword));
      try {
        const res = await fetch(`/api/quotes/keyword/${encodeURIComponent(keyword)}`, {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
        const quotes: Quote[] = await res.json();
        setCache(prev => ({ ...prev, [keyword]: quotes }));

        // Batch-refresh all Discord image URLs for this keyword in one API call
        const imageUrls = quotes.map(q => q.text).filter(looksLikeImage);
        if (imageUrls.length) {
          const fresh = await refreshImageUrls(imageUrls);
          setUrlMap(prev => ({ ...prev, ...fresh }));
        }
      } finally {
        setLoadingKws(prev => { const s = new Set(prev); s.delete(keyword); return s; });
      }
    }
  }

  function toggleQuote(quoteId: string) {
    setExpandedQuotes(prev => {
      const next = new Set(prev);
      if (next.has(quoteId)) next.delete(quoteId); else next.add(quoteId);
      return next;
    });
  }

  function toggleExpandAll(keyword: string) {
    const quotes = cache[keyword] ?? [];
    const allOpen = quotes.length > 0 && quotes.every(q => expandedQuotes.has(q.id));
    setExpandedQuotes(prev => {
      const next = new Set(prev);
      if (allOpen) quotes.forEach(q => next.delete(q.id));
      else         quotes.forEach(q => next.add(q.id));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-black text-white tracking-tight mb-1">Quotes</h1>
          <p className="text-slate-500 text-sm">
            {keywords.length.toLocaleString()} keywords &middot; {totalQuotes.toLocaleString()} total quotes
          </p>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter keywords…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
          {search && (
            <p className="text-xs text-slate-600 mt-1.5 ml-1">
              {filtered.length} match{filtered.length !== 1 ? "es" : ""}
            </p>
          )}
        </div>

        {/* Keyword list */}
        {loading ? (
          <div className="text-slate-600 text-sm py-12 text-center">Loading…</div>
        ) : (
          <div className="space-y-1">
            {filtered.map(({ keyword, count }) => {
              const isOpen        = openKws.has(keyword);
              const isLoadingThis = loadingKws.has(keyword);
              const quotes        = cache[keyword];
              const allOpen       = !!quotes?.length && quotes.every(q => expandedQuotes.has(q.id));

              return (
                <div key={keyword} className="rounded-xl overflow-hidden border border-slate-800/50">

                  {/* ── Keyword header ── */}
                  <button
                    onClick={() => toggleKeyword(keyword)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/70 transition-colors text-left group"
                  >
                    <span className="text-slate-500 group-hover:text-slate-400 transition-colors">
                      <ChevronRight open={isOpen} />
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-200 flex-1 tracking-wide">
                      {keyword}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700/50">
                      {count}
                    </span>
                  </button>

                  {/* ── Quotes panel ── */}
                  {isOpen && (
                    <div className="border-t border-slate-800/50 bg-slate-950/60">
                      {isLoadingThis ? (
                        <div className="px-10 py-4 text-xs text-slate-600">Loading quotes…</div>
                      ) : quotes ? (
                        <>
                          <div className="px-10 py-2 flex items-center justify-between border-b border-slate-800/40">
                            <span className="text-xs text-slate-700">{quotes.length} quote{quotes.length !== 1 ? "s" : ""}</span>
                            <button
                              onClick={() => toggleExpandAll(keyword)}
                              className="text-xs text-slate-600 hover:text-slate-300 transition-colors"
                            >
                              {allOpen ? "Collapse all" : "Expand all"}
                            </button>
                          </div>

                          <div className="divide-y divide-slate-800/30">
                            {quotes.map(quote => {
                              const isExpanded = expandedQuotes.has(quote.id);
                              const isImg      = looksLikeImage(quote.text);
                              return (
                                <div key={quote.id}>
                                  <button
                                    onClick={() => toggleQuote(quote.id)}
                                    className="w-full flex items-center gap-3 px-10 py-2.5 hover:bg-slate-800/30 transition-colors text-left group"
                                  >
                                    <span className="text-slate-700 group-hover:text-slate-500 transition-colors">
                                      <ChevronRight open={isExpanded} />
                                    </span>
                                    <span className="font-mono text-xs text-violet-400/70 w-14 shrink-0">
                                      {quote.nadeko_id ?? "—"}
                                    </span>
                                    <span className="text-xs text-slate-400 flex-1">
                                      {quote.author_name ?? <span className="italic text-slate-600">unknown</span>}
                                    </span>
                                    {isImg && (
                                      <span className="text-[10px] text-slate-700 shrink-0">img</span>
                                    )}
                                  </button>

                                  {isExpanded && (
                                    <div className="px-16 pb-4 pt-1">
                                      {isImg ? (
                                        <QuoteImage src={quote.text} refreshed={urlMap[quote.text]} />
                                      ) : (
                                        <p className="text-sm text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                                          {quote.text}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="text-slate-600 text-sm py-10 text-center">
                No keywords match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
