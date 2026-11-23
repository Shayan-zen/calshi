import type { Context } from "hono";
import type { z } from "zod";

export const BOT_MM_ID = "bot-mm";
export const BOT_FLOW_ID = "bot-flow";
export const BOT_IDS = [BOT_MM_ID, BOT_FLOW_ID];

/** Users never shown publicly: excluded from the leaderboard, shown as "Anonymous" in trade feeds and comments. */
const HIDDEN_EMAILS = new Set(["f20250935@pilani.bits-pilani.ac.in", "f20250983@pilani.bits-pilani.ac.in"]);
export const isHiddenEmail = (email: string | null | undefined): boolean => !!email && HIDDEN_EMAILS.has(email.toLowerCase());
export const ANON_NAME = "Anonymous";

/** Error carrying an HTTP status; rendered as { error } by the app error handler. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);

export function newId(): string {
  return crypto.randomUUID();
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function isConstraintError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return /constraint|SQLITE_CONSTRAINT/i.test(msg);
}

export async function parseBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw bad("Invalid JSON body");
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw bad(issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid body");
  }
  return r.data;
}

export function intParam(v: string | undefined, def: number, min: number, max: number): number {
  const n = v === undefined || v === "" ? def : Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return clamp(n, min, max);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
