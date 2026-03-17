import { useEffect, useState } from "react";
import { getUser, getToken } from "../lib/auth";

const KEY      = "boop_ribbits";
const BASE_KEY = "boop_ribbit_base"; // last server-confirmed base, persisted separately
const AUTH_EVENT = "boop-auth-changed";

// ── Module-level singleton ────────────────────────────────────────────────────
// _serverBase: the last count confirmed by the server
// _localDelta: ribbits earned since last sync, not yet sent to server
// _count: what we display = _serverBase + _localDelta

let _count = parseInt(localStorage.getItem(KEY) || "0", 10);

// Use the dedicated base key (accurate) if present; fall back to cached user
// on first ever load before the key exists.
let _serverBase = 0;
const _storedBase = localStorage.getItem(BASE_KEY);
if (_storedBase !== null) {
  _serverBase = parseInt(_storedBase, 10);
} else {
  const _cachedUser = getUser();
  if (_cachedUser && typeof _cachedUser.ribbit_count === "number") {
    _serverBase = _cachedUser.ribbit_count;
  }
}

let _localDelta = Math.max(0, _count - _serverBase);
_count = _serverBase + _localDelta;

const _subs = new Set<() => void>();

function notify() {
  _subs.forEach(fn => fn());
}

// Called by auth.ts when a fresh server user object arrives (login / me check)
export function initRibbitsFromServer(serverCount: number) {
  _serverBase = serverCount;
  _count = _serverBase + _localDelta;
  localStorage.setItem(KEY,      String(_count));
  localStorage.setItem(BASE_KEY, String(_serverBase));
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
      localStorage.setItem(KEY,      String(_count));
      localStorage.setItem(BASE_KEY, String(_serverBase));
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
