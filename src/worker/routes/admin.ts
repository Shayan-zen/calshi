import { Hono } from "hono";
import { z } from "zod";
import type { AdminComment, AdminUser, Side } from "../../shared/types";
import { type AppEnv, type UserRow, isAdminEmail, isAllowedEmail, requireAdmin } from "../lib/session";
import type { AdminEntry } from "../../shared/types";
import { closeMarket, settleMarket, settleStatements, voidEventStatements } from "../lib/engine";
import { quoteEvents } from "../lib/bot";
import { type EventRow, currentPrices, eventDetail, marketSummary } from "../lib/markets";
import { HttpError, bad, isConstraintError, notFound, parseBody, slugify } from "../lib/util";

export const admin = new Hono<AppEnv>();

admin.use("/admin/*", async (c, next) => {
  requireAdmin(c);
  await next();
});

const STOP = new Set(["will", "the", "a", "an", "of", "in", "by", "be", "before", "after", "who", "what", "which", "to", "for", "on", "at", "is", "than", "and", "or", "does", "do", "how", "many"]);

export function tickerPrefix(slug: string): string {
  const words = slug.split("-").filter((w) => w && !STOP.has(w));
  return (words.length ? words : slug.split("-")).slice(0, 3).join("-").toUpperCase().slice(0, 28).replace(/-+$/, "") || "EVT";
}

const createSchema = z.object({
  title: z.string().trim().min(5).max(200),
  category: z.string().trim().min(2).max(40),
  description: z.string().trim().max(5000),
  rules: z.string().trim().max(5000),
  icon: z.string().trim().max(16).nullish(),
  imageUrl: z.string().trim().url().max(500).nullish(),
  closeTime: z.number().int(),
  mutuallyExclusive: z.boolean(),
  markets: z
    .array(z.object({ title: z.string().trim().min(1).max(120), subtitle: z.string().trim().max(200).nullish(), initialPrice: z.number().int().min(1).max(99) }))
    .min(1)
    .max(20),
});

admin.post("/admin/events", async (c) => {
  const body = await parseBody(c, createSchema);
  const db = c.env.DB;
  const now = Date.now();
  if (body.closeTime <= now + 60_000) throw bad("closeTime must be in the future");

  const base = slugify(body.title) || "event";
  let slug = base;
  for (let i = 2; await db.prepare(`SELECT 1 FROM events WHERE slug = ?`).bind(slug).first(); i++) slug = `${base}-${i}`;

  const existing = new Set(
    (await db.prepare(`SELECT ticker FROM markets WHERE ticker LIKE ?`).bind(tickerPrefix(slug) + "%").all<{ ticker: string }>()).results.map((r) => r.ticker),
  );
  const prefix = tickerPrefix(slug);
  const tickers: string[] = [];
  for (const m of body.markets) {
    let t = body.markets.length === 1 ? prefix : `${prefix}-${(slugify(m.title).split("-").slice(0, 2).join("-") || "M").toUpperCase()}`;
    const b = t;
    for (let i = 2; existing.has(t); i++) t = `${b}-${i}`;
    existing.add(t);
    tickers.push(t);
  }

  const st: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO events (slug, title, category, description, rules, icon, image_url, close_time, mutually_exclusive, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(slug, body.title, body.category, body.description, body.rules, body.icon ?? null, body.imageUrl ?? null, body.closeTime, body.mutuallyExclusive ? 1 : 0, now),
  ];
  body.markets.forEach((m, i) => {
    st.push(
      db
        .prepare(
          `INSERT INTO markets (ticker, event_slug, title, subtitle, sort_order, status, fair_price, close_time, created_at, last_point_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        )
        .bind(tickers[i], slug, m.title, m.subtitle ?? null, i, m.initialPrice, body.closeTime, now, now),
      db.prepare(`INSERT INTO price_history (ticker, t, p) VALUES (?, ?, ?)`).bind(tickers[i], now, m.initialPrice),
    );
  });
  await db.batch(st);
  try {
    await quoteEvents(db, [slug], { walk: false, flow: false });
  } catch (e) {
    console.error("initial quotes failed", e);
  }
  return c.json({ event: await eventDetail(db, slug) });
});

admin.post("/admin/markets/:ticker/close", async (c) => {
  const ticker = c.req.param("ticker");
  const m = await c.env.DB.prepare(`SELECT status FROM markets WHERE ticker = ?`).bind(ticker).first<{ status: string }>();
  if (!m) throw notFound("Market not found");
  if (m.status !== "open") throw bad("Market is not open");
  try {
    await closeMarket(c.env.DB, ticker);
  } catch (e) {
    if (/constraint/i.test(String((e as Error).message))) throw bad("Market is not open");
    throw e;
  }
  return c.json({ market: await marketSummary(c.env.DB, ticker) });
});

admin.post("/admin/markets/:ticker/resolve", async (c) => {
  const ticker = c.req.param("ticker");
  const { result } = await parseBody(c, z.object({ result: z.enum(["yes", "no"]) }));
  const m = await c.env.DB.prepare(`SELECT status FROM markets WHERE ticker = ?`).bind(ticker).first<{ status: string }>();
  if (!m) throw notFound("Market not found");
  if (m.status === "settled") throw bad("Market already settled");
  try {
    await settleMarket(c.env.DB, ticker, result);
  } catch (e) {
    if (/constraint/i.test(String((e as Error).message))) throw new HttpError(409, "Market changed during settlement — retry");
    throw e;
  }
  return c.json({ market: await marketSummary(c.env.DB, ticker) });
});

// ---------------------------------------------------------------------------
// Event management

async function eventOr404(db: D1Database, slug: string): Promise<EventRow> {
  const e = await db.prepare(`SELECT * FROM events WHERE slug = ?`).bind(slug).first<EventRow>();
  if (!e) throw notFound("Event not found");
  return e;
}

const updateSchema = z.object({
  title: z.string().trim().min(5).max(200).optional(),
  category: z.string().trim().min(2).max(40).optional(),
  description: z.string().trim().max(5000).optional(),
  rules: z.string().trim().max(5000).optional(),
  icon: z.string().trim().max(16).nullish(),
  imageUrl: z.string().trim().url().max(500).nullish().or(z.literal("")),
  closeTime: z.number().int().optional(),
  mutuallyExclusive: z.boolean().optional(),
});

admin.patch("/admin/events/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.env.DB;
  const body = await parseBody(c, updateSchema);
  const e = await eventOr404(db, slug);
  const now = Date.now();
  const closeChanged = body.closeTime !== undefined && body.closeTime !== e.close_time;
  if (closeChanged && body.closeTime! <= now + 60_000) throw bad("closeTime must be in the future");

  const st: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE events SET title = ?, category = ?, description = ?, rules = ?, icon = ?, image_url = ?, close_time = ?, mutually_exclusive = ?
         WHERE slug = ?`,
      )
      .bind(
        body.title ?? e.title,
        body.category ?? e.category,
        body.description ?? e.description,
        body.rules ?? e.rules,
        body.icon !== undefined ? body.icon || null : e.icon,
        body.imageUrl !== undefined ? body.imageUrl || null : e.image_url,
        body.closeTime ?? e.close_time,
        body.mutuallyExclusive !== undefined ? (body.mutuallyExclusive ? 1 : 0) : e.mutually_exclusive,
        slug,
      ),
  ];
  if (closeChanged) st.push(db.prepare(`UPDATE markets SET close_time = ? WHERE event_slug = ? AND status = 'open'`).bind(body.closeTime!, slug));
  await db.batch(st);
  return c.json({ event: await eventDetail(db, slug) });
});

const addMarketSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).nullish(),
  initialPrice: z.number().int().min(1).max(99),
});

admin.post("/admin/events/:slug/markets", async (c) => {
  const slug = c.req.param("slug");
  const db = c.env.DB;
  const body = await parseBody(c, addMarketSchema);
  const e = await eventOr404(db, slug);
  const now = Date.now();
  if (e.close_time <= now) throw bad("Event has already closed — extend its close time first");

  const prefix = tickerPrefix(slug);
  const [existing, order] = await Promise.all([
    db.prepare(`SELECT ticker FROM markets WHERE ticker LIKE ?`).bind(prefix + "%").all<{ ticker: string }>(),
    db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM markets WHERE event_slug = ?`).bind(slug).first<{ n: number }>(),
  ]);
  const taken = new Set(existing.results.map((r) => r.ticker));
  const base = `${prefix}-${(slugify(body.title).split("-").slice(0, 2).join("-") || "M").toUpperCase()}`;
  let ticker = base;
  for (let i = 2; taken.has(ticker); i++) ticker = `${base}-${i}`;

  await db.batch([
    db
      .prepare(
        `INSERT INTO markets (ticker, event_slug, title, subtitle, sort_order, status, fair_price, close_time, created_at, last_point_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      )
      .bind(ticker, slug, body.title, body.subtitle ?? null, order?.n ?? 0, body.initialPrice, e.close_time, now, now),
    db.prepare(`INSERT INTO price_history (ticker, t, p) VALUES (?, ?, ?)`).bind(ticker, now, body.initialPrice),
  ]);
  try {
    await quoteEvents(db, [slug], { walk: false, flow: false });
  } catch (err) {
    console.error("initial quotes failed", err);
  }
  return c.json({ event: await eventDetail(db, slug) });
});

admin.post("/admin/events/:slug/resolve", async (c) => {
  const slug = c.req.param("slug");
  const db = c.env.DB;
  const { winnerTicker } = await parseBody(c, z.object({ winnerTicker: z.string().trim().min(1).max(80) }));
  await eventOr404(db, slug);
  const { results: markets } = await db
    .prepare(`SELECT ticker, status, result FROM markets WHERE event_slug = ?`)
    .bind(slug)
    .all<{ ticker: string; status: string; result: Side | null }>();
  if (!markets.some((m) => m.ticker === winnerTicker)) throw bad("Winner is not an outcome of this event");
  const now = Date.now();
  const st: D1PreparedStatement[] = [];
  for (const m of markets) {
    const result: Side = m.ticker === winnerTicker ? "yes" : "no";
    if (m.status === "settled") {
      if (m.result !== result) throw bad(`${m.ticker} is already settled ${m.result === "yes" ? "Yes" : "No"}`);
      continue;
    }
    st.push(...settleStatements(db, m.ticker, result, now));
  }
  if (!st.length) throw bad("Every outcome is already settled");
  try {
    await db.batch(st);
  } catch (e) {
    if (isConstraintError(e)) throw new HttpError(409, "Event changed during settlement — retry");
    throw e;
  }
  return c.json({ event: await eventDetail(db, slug) });
});

admin.delete("/admin/events/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.env.DB;
  await eventOr404(db, slug);
  try {
    await db.batch(voidEventStatements(db, slug));
  } catch (e) {
    if (isConstraintError(e)) throw new HttpError(409, "Event changed while voiding — retry");
    throw e;
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Users

async function adminUsers(db: D1Database, env: Env, where: string, binds: unknown[], limit: number): Promise<AdminUser[]> {
  const { results: users } = await db
    .prepare(`SELECT * FROM users WHERE is_bot = 0 AND (${where}) ORDER BY created_at DESC LIMIT ${limit}`)
    .bind(...binds)
    .all<UserRow>();
  if (!users.length) return [];
  const ids = JSON.stringify(users.map((u) => u.id));
  const [locked, pos] = await Promise.all([
    db
      .prepare(
        `SELECT user_id, SUM(remaining * price) AS v FROM orders
         WHERE status = 'open' AND action = 'buy' AND user_id IN (SELECT value FROM json_each(?)) GROUP BY user_id`,
      )
      .bind(ids)
      .all<{ user_id: string; v: number }>(),
    db
      .prepare(
        `SELECT user_id, ticker, yes_qty, no_qty FROM positions
         WHERE (yes_qty > 0 OR no_qty > 0) AND user_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(ids)
      .all<{ user_id: string; ticker: string; yes_qty: number; no_qty: number }>(),
  ]);
  const prices = await currentPrices(db, [...new Set(pos.results.map((p) => p.ticker))]);
  const lockedBy = new Map(locked.results.map((r) => [r.user_id, r.v]));
  const posVal = new Map<string, number>();
  for (const p of pos.results) {
    const y = prices.get(p.ticker) ?? 50;
    posVal.set(p.user_id, (posVal.get(p.user_id) ?? 0) + p.yes_qty * y + p.no_qty * (100 - y));
  }
  const dbAdmins = new Set((await db.prepare(`SELECT email FROM admins`).all<{ email: string }>()).results.map((r) => r.email));
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatar_url,
    balance: u.balance,
    totalValue: Math.round(u.balance + (lockedBy.get(u.id) ?? 0) + (posVal.get(u.id) ?? 0)),
    volume: u.volume,
    createdAt: u.created_at,
    isAdmin: !!u.is_admin || isAdminEmail(env, u.email) || dbAdmins.has(u.email.toLowerCase()),
  }));
}

// ---------- admin management ----------
async function listAdmins(db: D1Database, env: Env): Promise<AdminEntry[]> {
  const owners = (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const added = (await db.prepare(`SELECT email, added_by, created_at FROM admins ORDER BY created_at`).all<{ email: string; added_by: string | null; created_at: number }>()).results;
  const emails = [...new Set([...owners, ...added.map((a) => a.email)])];
  const names = new Map(
    (await db.prepare(`SELECT email, name FROM users WHERE email IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(emails)).all<{ email: string; name: string }>()).results.map((r) => [r.email, r.name]),
  );
  return [
    ...owners.map((e): AdminEntry => ({ email: e, name: names.get(e) ?? null, source: "owner", addedBy: null, createdAt: null })),
    ...added
      .filter((a) => !owners.includes(a.email))
      .map((a): AdminEntry => ({ email: a.email, name: names.get(a.email) ?? null, source: "added", addedBy: a.added_by, createdAt: a.created_at })),
  ];
}

admin.get("/admin/admins", async (c) => c.json({ admins: await listAdmins(c.env.DB, c.env) }));

admin.post("/admin/admins", async (c) => {
  const me = requireAdmin(c);
  const { email: raw } = await parseBody(c, z.object({ email: z.string().trim().min(3).max(200) }));
  const email = raw.toLowerCase();
  if (!isAllowedEmail(c.env, email)) throw bad(`Admins must have an @${c.env.ALLOWED_EMAIL_DOMAIN} email`);
  if (isAdminEmail(c.env, email)) throw bad("Already an admin");
  const res = await c.env.DB.prepare(`INSERT OR IGNORE INTO admins (email, added_by, created_at) VALUES (?, ?, ?)`).bind(email, me.row.email, Date.now()).run();
  if (!res.meta.changes) throw bad("Already an admin");
  return c.json({ admins: await listAdmins(c.env.DB, c.env) });
});

admin.delete("/admin/admins/:email", async (c) => {
  const email = decodeURIComponent(c.req.param("email")).toLowerCase();
  if (isAdminEmail(c.env, email)) throw bad("Owner admins are set in the ADMIN_EMAILS secret and can't be removed here");
  const res = await c.env.DB.prepare(`DELETE FROM admins WHERE email = ?`).bind(email).run();
  if (!res.meta.changes) throw notFound("Not an admin");
  return c.json({ admins: await listAdmins(c.env.DB, c.env) });
});

admin.get("/admin/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 100);
  const like = `%${q.replace(/[\\%_]/g, (ch) => "\\" + ch)}%`;
  const users = await adminUsers(
    c.env.DB,
    c.env,
    `?1 = '' OR LOWER(name) LIKE ?2 ESCAPE '\\' OR LOWER(email) LIKE ?2 ESCAPE '\\'`,
    [q, like],
    200,
  );
  return c.json({ users });
});

admin.post("/admin/users/:id/credit", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const body = await parseBody(
    c,
    z.object({
      amount: z.number().int().refine((n) => n !== 0, "must not be zero").refine((n) => Math.abs(n) <= 100_000_000, "is too large"),
      reason: z.string().trim().max(200).optional(),
    }),
  );
  const u = await db.prepare(`SELECT id, balance FROM users WHERE id = ? AND is_bot = 0`).bind(id).first<{ id: string; balance: number }>();
  if (!u) throw notFound("User not found");
  if (u.balance + body.amount < 0) throw bad("Balance can't go below $0");
  try {
    await db.prepare(`UPDATE users SET balance = balance + ? WHERE id = ?`).bind(body.amount, id).run();
  } catch (e) {
    if (isConstraintError(e)) throw bad("Balance can't go below $0");
    throw e;
  }
  console.log("admin credit", { by: c.get("user")?.row.id, user: id, amount: body.amount, reason: body.reason ?? null });
  const [user] = await adminUsers(db, c.env, `id = ?`, [id], 1);
  return c.json({ user });
});

// ---------------------------------------------------------------------------
// Comment moderation

admin.get("/admin/comments", async (c) => {
  const viewer = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, u.name AS user_name, u.avatar_url, e.title AS event_title
     FROM comments c JOIN users u ON u.id = c.user_id JOIN events e ON e.slug = c.event_slug
     ORDER BY c.created_at DESC LIMIT 100`,
  ).all<{ id: string; event_slug: string; user_id: string; body: string; created_at: number; user_name: string; avatar_url: string | null; event_title: string }>();
  const comments: AdminComment[] = results.map((r) => ({
    id: r.id,
    eventSlug: r.event_slug,
    eventTitle: r.event_title,
    userId: r.user_id,
    userName: r.user_name,
    avatarUrl: r.avatar_url,
    body: r.body,
    createdAt: r.created_at,
    canDelete: !!viewer?.isAdmin,
  }));
  return c.json({ comments });
});

admin.get("/admin/stats", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE is_bot = 0) AS users,
            (SELECT COUNT(*) FROM trades WHERE both_bots = 0) AS trades,
            (SELECT COALESCE(SUM(volume), 0) FROM markets) AS volume,
            (SELECT COUNT(*) FROM markets WHERE status = 'open') AS openMarkets`,
  ).first<{ users: number; trades: number; volume: number; openMarkets: number }>();
  return c.json(r);
});
