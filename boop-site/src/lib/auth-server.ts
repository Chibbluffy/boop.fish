/**
 * Server-side auth helpers — NOT imported by any client code.
 * Uses Bun.password (bcrypt) and Bun.randomUUIDv7 for tokens.
 */
import sql from "./db";

export type SessionUser = {
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

const SESSION_TTL_DAYS = 30;

// ── Passwords ────────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  // bcrypt via Bun — cost factor 12, salt embedded in output
  return Bun.password.hash(plain, { algorithm: "bcrypt", cost: 12 });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await sql`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (${userId}, ${token}, ${expiresAt})
  `;
  return token;
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await sql<SessionUser[]>`
    SELECT u.id, u.username, u.email, u.role, u.character_name, u.family_name,
           u.discord_name, u.discord_id, u.discord_username, u.discord_avatar,
           u.ribbit_count, u.bdo_class, u.alt_class, u.gear_ap, u.gear_aap,
           u.gear_dp, u.timezone
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
      AND s.expires_at > NOW()
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

// ── Request helper ────────────────────────────────────────────────────────────

export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function authenticate(req: Request): Promise<SessionUser | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return getSessionUser(token);
}

export function requireRole(user: SessionUser | null, role: "officer" | "admin"): boolean {
  if (!user) return false;
  if (role === "officer") return user.role === "officer" || user.role === "admin";
  return user.role === "admin";
}
