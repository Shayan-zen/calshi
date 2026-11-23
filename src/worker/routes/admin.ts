import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireAdmin } from "../lib/session";
import { closeMarket, settleMarket } from "../lib/engine";
import { quoteEvents } from "../lib/bot";
import { eventDetail, marketSummary } from "../lib/markets";
import { HttpError, bad, notFound, parseBody, slugify } from "../lib/util";

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

admin.get("/admin/stats", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE is_bot = 0) AS users,
            (SELECT COUNT(*) FROM trades WHERE both_bots = 0) AS trades,
            (SELECT COALESCE(SUM(volume), 0) FROM markets) AS volume,
            (SELECT COUNT(*) FROM markets WHERE status = 'open') AS openMarkets`,
  ).first<{ users: number; trades: number; volume: number; openMarkets: number }>();
  return c.json(r);
});
