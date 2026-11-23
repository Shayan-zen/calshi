import { Hono, type MiddlewareHandler } from "hono";
import type { Category, LeaderboardEntry, Orderbook, OrderbookLevel, PricePoint, Range } from "../../shared/types";
import { STARTING_BALANCE } from "../../shared/types";
import type { AppEnv } from "../lib/session";
import { type EventRow, type MarketRow, eventDetail, eventSummaries, marketSummary, currentPrices } from "../lib/markets";
import { TRADE_SELECT, type TradeJoinRow, toTrade } from "../lib/mappers";
import { maybeRunBot } from "../lib/bot";
import { BOT_IDS, intParam, notFound } from "../lib/util";

const DAY = 86400_000;
const RANGE_MS: Record<Range, number | null> = { "1d": DAY, "1w": 7 * DAY, "1m": 30 * DAY, all: null };
const MAX_POINTS = 400;

export const browse = new Hono<AppEnv>();

/** Lazily run the bot if it hasn't run in 30s (so local dev feels alive without cron). */
const lazyBot: MiddlewareHandler<AppEnv> = async (c, next) => {
  try {
    c.executionCtx.waitUntil(maybeRunBot(c.env.DB, 30_000).catch((e) => console.error("bot", e)));
  } catch {
    // no execution context (tests)
  }
  await next();
};
browse.use("/events/*", lazyBot);
browse.use("/events", lazyBot);
browse.use("/markets/*", lazyBot);

browse.get("/categories", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.category AS name,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM markets m WHERE m.event_slug = e.slug AND m.status = 'open') THEN 1 ELSE 0 END) AS count
     FROM events e GROUP BY e.category ORDER BY count DESC, name ASC`,
  ).all<Category>();
  return c.json(results);
});

browse.get("/events", async (c) => {
  const db = c.env.DB;
  const category = (c.req.query("category") ?? "").trim();
  const q = (c.req.query("q") ?? "").trim().slice(0, 100);
  const sort = c.req.query("sort") ?? "trending";
  const status = c.req.query("status") ?? "open";
  const limit = intParam(c.req.query("limit"), 24, 1, 100);
  const offset = intParam(c.req.query("offset"), 0, 0, 100000);

  const where: string[] = [];
  const binds: unknown[] = [];
  if (category && category.toLowerCase() !== "all") {
    where.push(`LOWER(e.category) = LOWER(?)`);
    binds.push(category);
  }
  if (q) {
    where.push(`(e.title LIKE ? ESCAPE '\\' OR e.category LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM markets mq WHERE mq.event_slug = e.slug AND mq.title LIKE ? ESCAPE '\\'))`);
    const like = `%${q.replace(/[\\%_]/g, (ch) => "\\" + ch)}%`;
    binds.push(like, like, like);
  }
  const anyOpen = `EXISTS (SELECT 1 FROM markets ms WHERE ms.event_slug = e.slug AND ms.status = 'open')`;
  if (status === "open") where.push(anyOpen);
  else if (status === "settled") where.push(`NOT EXISTS (SELECT 1 FROM markets ms WHERE ms.event_slug = e.slug AND ms.status != 'settled')`);
  else if (status === "closed")
    where.push(`NOT ${anyOpen} AND EXISTS (SELECT 1 FROM markets ms WHERE ms.event_slug = e.slug AND ms.status = 'closed')`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const order =
    sort === "new"
      ? `e.created_at DESC`
      : sort === "closing"
        ? `e.close_time ASC`
        : sort === "volume"
          ? `vol DESC`
          : `vol24 DESC, vol DESC`;

  const [rows, total] = await Promise.all([
    db
      .prepare(
        `SELECT e.*,
           (SELECT COALESCE(SUM(m.volume), 0) FROM markets m WHERE m.event_slug = e.slug) AS vol,
           (SELECT COALESCE(SUM(t.qty), 0) FROM markets m JOIN trades t ON t.ticker = m.ticker
              WHERE m.event_slug = e.slug AND t.created_at > ?) AS vol24
         FROM events e ${whereSql} ORDER BY ${order}, e.slug LIMIT ? OFFSET ?`,
      )
      .bind(Date.now() - DAY, ...binds, limit, offset)
      .all<EventRow>(),
    db.prepare(`SELECT COUNT(*) AS n FROM events e ${whereSql}`).bind(...binds).first<{ n: number }>(),
  ]);
  return c.json({ events: await eventSummaries(db, rows.results), total: total?.n ?? 0 });
});

browse.get("/events/:slug", async (c) => {
  const ev = await eventDetail(c.env.DB, c.req.param("slug"));
  if (!ev) throw notFound("Event not found");
  return c.json(ev);
});

async function loadHistory(db: D1Database, ticker: string, range: Range, current: number): Promise<PricePoint[]> {
  const now = Date.now();
  const span = RANGE_MS[range] ?? null;
  const from = span ? now - span : 0;
  const [prev, rows] = await Promise.all([
    span
      ? db.prepare(`SELECT t, p FROM price_history WHERE ticker = ? AND t < ? ORDER BY t DESC LIMIT 1`).bind(ticker, from).first<PricePoint>()
      : Promise.resolve(null),
    db.prepare(`SELECT t, p FROM price_history WHERE ticker = ? AND t >= ? ORDER BY t ASC`).bind(ticker, from).all<PricePoint>(),
  ]);
  let pts = rows.results;
  if (pts.length > MAX_POINTS) {
    const step = pts.length / MAX_POINTS;
    const sampled: PricePoint[] = [];
    for (let i = 0; i < MAX_POINTS; i++) sampled.push(pts[Math.floor(i * step)]);
    sampled.push(pts[pts.length - 1]);
    pts = sampled;
  }
  if (prev) pts = [{ t: from, p: prev.p }, ...pts];
  if (pts.length === 0 || pts[pts.length - 1].t < now) pts = [...pts, { t: now, p: current }];
  return pts;
}

function parseRange(r: string | undefined): Range {
  return r === "1d" || r === "1w" || r === "1m" || r === "all" ? r : "1m";
}

browse.get("/events/:slug/history", async (c) => {
  const db = c.env.DB;
  const ev = await eventDetail(db, c.req.param("slug"));
  if (!ev) throw notFound("Event not found");
  const range = parseRange(c.req.query("range"));
  const series = await Promise.all(
    ev.markets.map(async (m) => ({ ticker: m.ticker, title: m.title, points: await loadHistory(db, m.ticker, range, m.yesPrice) })),
  );
  return c.json({ series });
});

browse.get("/markets/:ticker", async (c) => {
  const db = c.env.DB;
  const market = await marketSummary(db, c.req.param("ticker"));
  if (!market) throw notFound("Market not found");
  const e = await db.prepare(`SELECT * FROM events WHERE slug = ?`).bind(market.eventSlug).first<EventRow>();
  if (!e) throw notFound("Event not found");
  const [event] = await eventSummaries(db, [e]);
  return c.json({ market, event });
});

browse.get("/markets/:ticker/orderbook", async (c) => {
  const db = c.env.DB;
  const ticker = c.req.param("ticker");
  const m = await db.prepare(`SELECT ticker FROM markets WHERE ticker = ?`).bind(ticker).first<MarketRow>();
  if (!m) throw notFound("Market not found");
  const [bids, asks] = await Promise.all([
    db
      .prepare(
        `SELECT yes_price AS price, SUM(remaining) AS qty FROM orders WHERE ticker = ? AND status = 'open' AND book_side = 'bid'
         GROUP BY yes_price ORDER BY yes_price DESC LIMIT 10`,
      )
      .bind(ticker)
      .all<OrderbookLevel>(),
    db
      .prepare(
        `SELECT 100 - yes_price AS price, SUM(remaining) AS qty FROM orders WHERE ticker = ? AND status = 'open' AND book_side = 'ask'
         GROUP BY yes_price ORDER BY yes_price ASC LIMIT 10`,
      )
      .bind(ticker)
      .all<OrderbookLevel>(),
  ]);
  const book: Orderbook = { ticker, yes: bids.results, no: asks.results };
  return c.json(book);
});

browse.get("/markets/:ticker/history", async (c) => {
  const market = await marketSummary(c.env.DB, c.req.param("ticker"));
  if (!market) throw notFound("Market not found");
  return c.json({ points: await loadHistory(c.env.DB, market.ticker, parseRange(c.req.query("range")), market.yesPrice) });
});

browse.get("/markets/:ticker/trades", async (c) => {
  const limit = intParam(c.req.query("limit"), 50, 1, 200);
  const { results } = await c.env.DB.prepare(`${TRADE_SELECT} WHERE t.ticker = ? ORDER BY t.created_at DESC, t.rowid DESC LIMIT ?`)
    .bind(c.req.param("ticker"), limit)
    .all<TradeJoinRow>();
  return c.json({ trades: results.map(toTrade) });
});

browse.get("/activity", async (c) => {
  const limit = intParam(c.req.query("limit"), 30, 1, 100);
  const { results } = await c.env.DB.prepare(`${TRADE_SELECT} WHERE t.both_bots = 0 ORDER BY t.created_at DESC, t.rowid DESC LIMIT ?`)
    .bind(limit)
    .all<TradeJoinRow>();
  return c.json({ trades: results.map(toTrade) });
});

browse.get("/leaderboard", async (c) => {
  const db = c.env.DB;
  const limit = intParam(c.req.query("limit"), 50, 1, 200);
  const [users, locked, pos] = await Promise.all([
    db
      .prepare(`SELECT id, name, avatar_url, balance, volume FROM users WHERE is_bot = 0`)
      .all<{ id: string; name: string; avatar_url: string | null; balance: number; volume: number }>(),
    db
      .prepare(`SELECT user_id, SUM(remaining * price) AS v FROM orders WHERE status = 'open' AND action = 'buy' GROUP BY user_id`)
      .all<{ user_id: string; v: number }>(),
    db
      .prepare(
        `SELECT p.user_id, p.ticker, p.yes_qty, p.no_qty FROM positions p JOIN users u ON u.id = p.user_id
         WHERE u.is_bot = 0 AND (p.yes_qty > 0 OR p.no_qty > 0)`,
      )
      .all<{ user_id: string; ticker: string; yes_qty: number; no_qty: number }>(),
  ]);
  const prices = await currentPrices(db, [...new Set(pos.results.map((p) => p.ticker))]);
  const lockedBy = new Map(locked.results.map((r) => [r.user_id, r.v]));
  const posVal = new Map<string, number>();
  for (const p of pos.results) {
    const y = prices.get(p.ticker) ?? 50;
    posVal.set(p.user_id, (posVal.get(p.user_id) ?? 0) + p.yes_qty * y + p.no_qty * (100 - y));
  }
  const entries: LeaderboardEntry[] = users.results
    .filter((u) => !BOT_IDS.includes(u.id))
    .map((u) => ({
      rank: 0,
      userId: u.id,
      name: u.name,
      avatarUrl: u.avatar_url,
      pnl: Math.round(u.balance + (lockedBy.get(u.id) ?? 0) + (posVal.get(u.id) ?? 0) - STARTING_BALANCE),
      volume: u.volume,
    }))
    .sort((a, b) => b.pnl - a.pnl || b.volume - a.volume)
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  return c.json({ entries });
});
