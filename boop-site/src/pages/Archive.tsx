import React, { useEffect, useState } from "react";
import { useAuth, getToken } from "../lib/auth";

type KeywordRow = { keyword: string; count: number };
type Quote = { id: string; nadeko_id: string | null; author_name: string | null; text: string };

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const TRUSTED_IMAGE_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

function looksLikeImage(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return TRUSTED_IMAGE_HOSTS.has(hostname) || IMAGE_EXTENSIONS.test(pathname);
  } catch {
    return false;
  }
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={copy}
      title="Copy ID"
      className="shrink-0 p-1 text-slate-600 hover:text-slate-300 transition-colors"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      )}
    </button>
  );
}

function ChevronRight({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 6 10" fill="none">
      <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Splits on mentions and URLs so we can handle each segment type
const SEGMENT_RE = /(<@!?\d+>|https?:\/\/\S+)/g;

function extractMentionIds(texts: string[]): string[] {
  const ids = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/<@!?(\d+)>/g)) ids.add(m[1]);
  }
  return [...ids];
}

function extractImageUrls(texts: string[]): string[] {
  const urls = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/https?:\/\/\S+/g)) {
      if (looksLikeImage(m[0])) urls.add(m[0]);
    }
  }
  return [...urls];
}

function containsImage(text: string): boolean {
  return /https?:\/\/\S+/.test(text) && looksLikeImage(text.match(/https?:\/\/\S+/)?.[0] ?? "");
}

function renderText(text: string, userMap: Record<string, string>, urlMap: Record<string, string>): React.ReactNode {
  const rawParts = text.split(SEGMENT_RE);
  const blocks: React.ReactNode[] = [];
  let inline: React.ReactNode[] = [];
  let k = 0;

  function flushInline() {
    const trimmed = inline.filter(n => n !== "" && n != null);
    if (trimmed.length) {
      blocks.push(
        <p key={k++} className="text-sm text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
          {trimmed}
        </p>
      );
    }
    inline = [];
  }

  for (const part of rawParts) {
    const mention = part.match(/^<@!?(\d+)>$/);
    if (mention) {
      const name = userMap[mention[1]] ?? mention[1];
      inline.push(
        <span key={k++} className="inline-block px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium text-[0.8em]">
          @{name}
        </span>
      );
    } else if (/^https?:\/\//.test(part) && looksLikeImage(part)) {
      flushInline();
      blocks.push(<QuoteImage key={k++} src={part} refreshed={urlMap[part]} />);
    } else if (part) {
      inline.push(part);
    }
  }
  flushInline();

  return <div className="flex flex-col gap-2">{blocks}</div>;
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

async function resolveUsers(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const res = await fetch("/api/discord/resolve-users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) return {};
  return res.json();
}

type SearchGroup = { keyword: string; quotes: Quote[] };

export default function Archive() {
  const user = useAuth();
  const [keywords, setKeywords]         = useState<KeywordRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [openKws, setOpenKws]           = useState<Set<string>>(new Set());
  const [loadingKws, setLoadingKws]     = useState<Set<string>>(new Set());
  const [cache, setCache]               = useState<Record<string, Quote[]>>({});
  // original URL → refreshed URL, accumulated across all opened keywords
  const [urlMap, setUrlMap]             = useState<Record<string, string>>({});
  // discord user id → display name
  const [userMap, setUserMap]           = useState<Record<string, string>>({});
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults]   = useState<SearchGroup[] | null>(null);
  const [searchLoading, setSearchLoading]   = useState(false);

  useEffect(() => {
    fetch("/api/quotes/keywords", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then(r => r.json())
      .then(data => { setKeywords(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Debounced full-text search
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults(null); return; }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/quotes/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
        const data: SearchGroup[] = await res.json();
        setSearchResults(data);

        // Populate cache + batch-resolve images and mentions
        const allTexts   = data.flatMap(g => g.quotes.map(q => q.text));
        const imageUrls  = extractImageUrls(allTexts);
        const mentionIds = extractMentionIds(allTexts);

        setCache(prev => {
          const next = { ...prev };
          for (const group of data) next[group.keyword] = group.quotes;
          return next;
        });
        // Auto-expand all matching quote rows
        setExpandedQuotes(prev => {
          const next = new Set(prev);
          for (const group of data) for (const q of group.quotes) next.add(q.id);
          return next;
        });

        await Promise.all([
          imageUrls.length
            ? refreshImageUrls(imageUrls).then(fresh => setUrlMap(prev => ({ ...prev, ...fresh })))
            : Promise.resolve(),
          mentionIds.length
            ? resolveUsers(mentionIds).then(names => setUserMap(prev => ({ ...prev, ...names })))
            : Promise.resolve(),
        ]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

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

        // Batch-refresh image URLs and resolve user mentions in parallel
        const texts      = quotes.map(q => q.text);
        const imageUrls  = extractImageUrls(texts);
        const mentionIds = extractMentionIds(texts);

        await Promise.all([
          imageUrls.length
            ? refreshImageUrls(imageUrls).then(fresh => setUrlMap(prev => ({ ...prev, ...fresh })))
            : Promise.resolve(),
          mentionIds.length
            ? resolveUsers(mentionIds).then(names => setUserMap(prev => ({ ...prev, ...names })))
            : Promise.resolve(),
        ]);
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
          <h1 className="text-2xl font-black text-white tracking-tight mb-1">Archive</h1>
          <p className="text-slate-500 text-sm">
            {keywords.length.toLocaleString()} keywords &middot; {totalQuotes.toLocaleString()} total quotes
          </p>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search keywords, quotes, usernames…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
          {search && (
            <p className="text-xs text-slate-600 mt-1.5 ml-1">
              {searchLoading
                ? "Searching…"
                : searchResults
                  ? `${searchResults.reduce((s, g) => s + g.quotes.length, 0)} quote${searchResults.reduce((s, g) => s + g.quotes.length, 0) !== 1 ? "s" : ""} in ${searchResults.length} keyword${searchResults.length !== 1 ? "s" : ""}`
                  : ""}
            </p>
          )}
        </div>

        {/* Keyword list */}
        {loading ? (
          <div className="text-slate-600 text-sm py-12 text-center">Loading…</div>
        ) : searchResults !== null ? (
          /* ── Search results mode ── */
          <div className="space-y-1">
            {searchResults.length === 0 ? (
              <div className="text-slate-600 text-sm py-10 text-center">
                No results for &ldquo;{search}&rdquo;
              </div>
            ) : searchResults.map(({ keyword, quotes }) => {
              const allOpen = quotes.length > 0 && quotes.every(q => expandedQuotes.has(q.id));
              return (
                <div key={keyword} className="rounded-xl overflow-hidden border border-slate-800/50">
                  <div className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900 text-left">
                    <span className="font-mono text-sm font-semibold text-slate-200 flex-1 tracking-wide">
                      {keyword}
                    </span>
                    <button
                      onClick={() => toggleExpandAll(keyword)}
                      className="text-xs text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      {allOpen ? "Collapse all" : "Expand all"}
                    </button>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700/50">
                      {quotes.length}
                    </span>
                  </div>
                  <div className="border-t border-slate-800/50 bg-slate-950/60 divide-y divide-slate-800/30">
                    {quotes.map(quote => {
                      const isExpanded = expandedQuotes.has(quote.id);
                      const hasImg     = containsImage(quote.text);
                      return (
                        <div key={quote.id}>
                          <div
                            onClick={() => toggleQuote(quote.id)}
                            className="flex items-center gap-3 px-10 py-2.5 hover:bg-slate-800/30 transition-colors cursor-pointer group"
                          >
                            <span className="text-slate-700 group-hover:text-slate-500 transition-colors">
                              <ChevronRight open={isExpanded} />
                            </span>
                            <span className="font-mono text-xs text-violet-400/70 shrink-0">
                              {quote.nadeko_id ?? "—"}
                            </span>
                            {quote.nadeko_id && <CopyButton text={quote.nadeko_id} />}
                            <span className="text-xs text-slate-400 flex-1">
                              {quote.author_name ?? <span className="italic text-slate-600">unknown</span>}
                            </span>
                            {hasImg && (
                              <span className="text-[10px] text-slate-700 shrink-0">img</span>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="px-16 pb-4 pt-1">
                              {renderText(quote.text, userMap, urlMap)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Browse mode ── */
          <div className="space-y-1">
            {keywords.map(({ keyword, count }) => {
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
                              const hasImg     = containsImage(quote.text);
                              return (
                                <div key={quote.id}>
                                  <div
                                    onClick={() => toggleQuote(quote.id)}
                                    className="flex items-center gap-3 px-10 py-2.5 hover:bg-slate-800/30 transition-colors cursor-pointer group"
                                  >
                                    <span className="text-slate-700 group-hover:text-slate-500 transition-colors">
                                      <ChevronRight open={isExpanded} />
                                    </span>
                                    <span className="font-mono text-xs text-violet-400/70 shrink-0">
                                      {quote.nadeko_id ?? "—"}
                                    </span>
                                    {quote.nadeko_id && <CopyButton text={quote.nadeko_id} />}
                                    <span className="text-xs text-slate-400 flex-1">
                                      {quote.author_name ?? <span className="italic text-slate-600">unknown</span>}
                                    </span>
                                    {hasImg && (
                                      <span className="text-[10px] text-slate-700 shrink-0">img</span>
                                    )}
                                  </div>

                                  {isExpanded && (
                                    <div className="px-16 pb-4 pt-1">
                                      {renderText(quote.text, userMap, urlMap)}
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
          </div>
        )}
      </div>
    </div>
  );
}
