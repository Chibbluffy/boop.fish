/**
 * Client-side auth utilities.
 * Stores the session token in localStorage and notifies subscribers on change.
 */

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  role: "pending" | "member" | "officer" | "admin";
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

  return user;
}
