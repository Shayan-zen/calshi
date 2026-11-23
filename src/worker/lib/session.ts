import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { User } from "../../shared/types";
import { STARTING_BALANCE } from "../../shared/types";
import { HttpError, newId } from "./util";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  balance: number;
  volume: number;
  is_bot: number;
  is_admin: number;
  created_at: number;
}

export interface AuthedUser {
  row: UserRow;
  isAdmin: boolean;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AuthedUser | null };
};

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export function isAdminEmail(env: Env, email: string): boolean {
  const list = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Admin = listed in the ADMIN_EMAILS secret ("owner") OR added via the admin panel (admins table). */
export async function resolveAdmin(db: D1Database, env: Env, email: string): Promise<boolean> {
  if (isAdminEmail(env, email)) return true;
  return !!(await db.prepare(`SELECT 1 FROM admins WHERE email = ?`).bind(email.toLowerCase()).first());
}

/** Exact-domain check: "x@evilpilani.bits-pilani.ac.in" fails for "pilani.bits-pilani.ac.in". */
export function isAllowedEmail(env: Env, email: string): boolean {
  const domain = String(env.ALLOWED_EMAIL_DOMAIN).toLowerCase();
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return false;
  return e.endsWith("@" + domain) && e.slice(at + 1) === domain;
}

export function toUser(row: UserRow, isAdmin: boolean): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    isAdmin,
    balance: row.balance,
    createdAt: row.created_at,
  };
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export async function upsertUser(
  db: D1Database,
  email: string,
  name: string,
  avatarUrl: string | null,
): Promise<UserRow> {
  const e = email.trim().toLowerCase();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, avatar_url, balance, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, avatar_url = COALESCE(excluded.avatar_url, users.avatar_url)`,
    )
    .bind(newId(), e, name, avatarUrl, STARTING_BALANCE, now)
    .run();
  const row = await db.prepare(`SELECT * FROM users WHERE email = ?`).bind(e).first<UserRow>();
  if (!row) throw new HttpError(500, "Failed to create user");
  return row;
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken(32);
  const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256Hex(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isHttps(c) });
}

/** Loads the session user (if any) into c.var.user. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token && token.length < 200) {
    const row = await c.env.DB.prepare(
      `SELECT u.*, EXISTS(SELECT 1 FROM admins a WHERE a.email = u.email) AS db_admin
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(await sha256Hex(token), Date.now())
      .first<UserRow & { db_admin: number }>();
    if (row && !row.is_bot) {
      const { db_admin, ...userRow } = row;
      c.set("user", { row: userRow, isAdmin: isAdminEmail(c.env, row.email) || !!db_admin });
    }
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): AuthedUser {
  const u = c.get("user");
  if (!u) throw new HttpError(401, "Login required");
  return u;
}

export function requireAdmin(c: Context<AppEnv>): AuthedUser {
  const u = requireUser(c);
  if (!u.isAdmin) throw new HttpError(403, "Admin only");
  return u;
}
