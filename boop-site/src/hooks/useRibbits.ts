import { useEffect, useState } from "react";
import { getUser, getToken } from "../lib/auth";

const KEY = "boop_ribbits";
const AUTH_EVENT = "boop-auth-changed";

// ── Module-level singleton ────────────────────────────────────────────────────
// _serverBase: the last count confirmed by the server (or loaded from stored user)
// _localDelta: ribbits earned this session that haven't been synced yet
// _count: what we display = _serverBase + _localDelta

let _serverBase = 0;
let _localDelta = 0;
let _count = parseInt(localStorage.getItem(KEY) || "0", 10);

// Initialise _serverBase from the cached user on startup so we don't flash 0
const _cachedUser = getUser();
if (_cachedUser && typeof _cachedUser.ribbit_count === "number") {
  _serverBase = _cachedUser.ribbit_count;
  // Any local excess above the server base is unsaved delta from a previous session
  _localDelta = Math.max(0, _count - _serverBase);
  _count = _serverBase + _localDelta;
}

const _subs = new Set<() => void>();

function notify() {
  _subs.forEach(fn => fn());
}

// Called by auth.ts when a fresh server user object arrives (login / me check)
export function initRibbitsFromServer(serverCount: number) {
  // Keep any delta earned since page load; server is the authoritative base
  _serverBase = serverCount;
  _count = _serverBase + _localDelta;
  localStorage.setItem(KEY, String(_count));
  notify();
}

export function addRibbits(n: number) {
  _localDelta += n;
  _count = _serverBase + _localDelta;
  localStorage.setItem(KEY, String(_count));
  notify();
}

async function syncToServer(keepalive = false) {
  if (_localDelta <= 0) return;
  const token = getToken();
  if (!token) return;

  const delta = _localDelta;
  _localDelta = 0; // optimistic — restore on failure

  try {
    const res = await fetch("/api/ribbits", {
      method: "POST",
      keepalive,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ delta }),
    });
    if (res.ok) {
      const { ribbit_count } = await res.json();
      _serverBase = ribbit_count;
      _count = _serverBase + _localDelta; // include any new clicks during the await
      localStorage.setItem(KEY, String(_count));
      notify();
    } else {
      _localDelta += delta; // put it back
    }
  } catch {
    _localDelta += delta; // put it back
  }
}

// ── Auto-sync every 15 seconds if there's unsaved delta ──────────────────────
setInterval(() => {
  if (_localDelta > 0 && getToken()) syncToServer();
}, 15_000);

// ── Flush on tab close ────────────────────────────────────────────────────────
window.addEventListener("beforeunload", () => {
  if (_localDelta > 0 && getToken()) syncToServer(true /* keepalive */);
});

// ── Re-seed from server when auth state changes ───────────────────────────────
window.addEventListener(AUTH_EVENT, () => {
  const u = getUser();
  if (u && typeof u.ribbit_count === "number") {
    initRibbitsFromServer(u.ribbit_count);
  }
});

// ── React hook ────────────────────────────────────────────────────────────────
export function useRibbits() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const sub = () => rerender(n => n + 1);
    _subs.add(sub);
    return () => { _subs.delete(sub); };
  }, []);

  return { count: _count, add: addRibbits };
}
