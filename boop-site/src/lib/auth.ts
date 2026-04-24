/**
 * Client-side auth utilities.
 * Stores the session token in localStorage and notifies subscribers on change.
 */

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  role: "pending" | "friend" | "member" | "officer" | "admin";
  character_name: string | null;
  family_name: string | null;
  discord_name: string | null;
  discord_id: string | null;
  discord_username: string | null;
  discord_avatar: string | null;
  ribbit_count: number;
  bdo_class: string | null;
  alt_class: string | null;
  gear_ap: number | null;
  gear_aap: number | null;
  gear_dp: number | null;
  timezone: string | null;
};

const TOKEN_KEY = "boop_session";
const USER_KEY  = "boop_user";
const EVENT     = "boop-auth-changed";

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notify();
}

export function updateUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function isOfficerOrAdmin(user: AuthUser | null): boolean {
  return user?.role === "officer" || user?.role === "admin";
}

/** React hook — re-renders on login/logout */
import { useEffect, useState } from "react";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(getUser);

  useEffect(() => {
    const handler = () => setUser(getUser());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  // Validate stored token on mount — clears + redirects if session is no longer valid
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) {
          clearSession();
          location.hash = "#/auth";
        }
      })
      .catch(() => {}); // network error — leave session alone, may be transient
  }, []);

  return user;
}

/**
 * Drop-in fetch wrapper that automatically attaches the auth token
 * and clears the session + redirects to login on 401.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken() ?? ""}`,
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    clearSession();
    location.hash = "#/auth";
  }
  return res;
}
