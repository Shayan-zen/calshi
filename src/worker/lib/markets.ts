import type { EventDetail, EventSummary, MarketSummary, MarketStatus, Side } from "../../shared/types";

export interface MarketRow {
  ticker: string;
  event_slug: string;
  title: string;
  subtitle: string | null;
  sort_order: number;
  status: MarketStatus;
  result: Side | null;
  last_price: number | null;
  fair_price: number;
  volume: number;
  open_interest: number;
  close_time: number;
  created_at: number;
  settled_at: number | null;
  bot_at: number;
  last_point_at: number;
}

export interface EventRow {
  slug: string;
  title: string;
  category: string;
  description: string;
  rules: string;
  icon: string | null;
  image_url: string | null;
  close_time: number;
  mutually_exclusive: number;
  created_at: number;
}

const DAY = 24 * 3600 * 1000;

interface MarketStatsRow extends MarketRow {
  best_bid: number | null;
  best_ask: number | null;
  p24: number | null;
  vol24: number | null;
}

/** "chance": last trade, else mid of best bid/ask, else 50. Settled markets show 100/0. */
export function yesPriceOf(m: { status: string; result: string | null; last_price: number | null }, bid: number | null, ask: number | null): number {
  if (m.status === "settled" && m.result) return m.result === "yes" ? 100 : 0;
  if (m.last_price != null) return m.last_price;
  if (bid != null && ask != null) return Math.round((bid + ask) / 2);
  if (bid != null) return bid;
  if (ask != null) return ask;
  return 50;
}

const STATS_SELECT = `
  SELECT m.*,
    (SELECT MAX(o.yes_price) FROM orders o WHERE o.ticker = m.ticker AND o.status = 'open' AND o.book_side = 'bid') AS best_bid,
    (SELECT MIN(o.yes_price) FROM orders o WHERE o.ticker = m.ticker AND o.status = 'open' AND o.book_side = 'ask') AS best_ask,
    (SELECT ph.p FROM price_history ph WHERE ph.ticker = m.ticker AND ph.t <= ?1 ORDER BY ph.t DESC LIMIT 1) AS p24,
    (SELECT SUM(t.qty) FROM trades t WHERE t.ticker = m.ticker AND t.created_at > ?1) AS vol24
  FROM markets m`;

function toSummary(r: MarketStatsRow): MarketSummary {
  const yesPrice = yesPriceOf(r, r.best_bid, r.best_ask);
  return {
    ticker: r.ticker,
    eventSlug: r.event_slug,
    title: r.title,
    subtitle: r.subtitle,
    status: r.status,
    result: r.result,
    yesPrice,
    yesBid: r.best_bid,
    yesAsk: r.best_ask,
    noPrice: 100 - yesPrice,
    change24h: r.p24 == null ? 0 : yesPrice - r.p24,
    volume: r.volume,
    volume24h: r.vol24 ?? 0,
    openInterest: r.open_interest,
    closeTime: r.close_time,
  };
}

export async function marketSummariesForEvents(db: D1Database, slugs: string[]): Promise<Map<string, MarketSummary[]>> {
  const out = new Map<string, MarketSummary[]>();
  if (slugs.length === 0) return out;
  const { results } = await db
    .prepare(`${STATS_SELECT} WHERE m.event_slug IN (SELECT value FROM json_each(?2)) ORDER BY m.sort_order`)
    .bind(Date.now() - DAY, JSON.stringify(slugs))
    .all<MarketStatsRow>();
  for (const r of results) {
    const s = toSummary(r);
    const arr = out.get(r.event_slug) ?? [];
    arr.push(s);
    out.set(r.event_slug, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => b.yesPrice - a.yesPrice);
  return out;
}

export async function marketSummary(db: D1Database, ticker: string): Promise<MarketSummary | null> {
  const r = await db
    .prepare(`${STATS_SELECT} WHERE m.ticker = ?2`)
    .bind(Date.now() - DAY, ticker)
    .first<MarketStatsRow>();
  return r ? toSummary(r) : null;
}

export async function commentCounts(db: D1Database, slugs: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!slugs.length) return m;
  const { results } = await db
    .prepare(`SELECT event_slug, COUNT(*) AS n FROM comments WHERE event_slug IN (SELECT value FROM json_each(?)) GROUP BY event_slug`)
    .bind(JSON.stringify(slugs))
    .all<{ event_slug: string; n: number }>();
  for (const r of results) m.set(r.event_slug, r.n);
  return m;
}

export function toEventSummary(e: EventRow, markets: MarketSummary[], comments: number): EventSummary {
  return {
    slug: e.slug,
    title: e.title,
    category: e.category,
    imageUrl: e.image_url,
    icon: e.icon,
    closeTime: e.close_time,
    mutuallyExclusive: !!e.mutually_exclusive,
    volume: markets.reduce((s, m) => s + m.volume, 0),
    markets,
    commentCount: comments,
  };
}

export async function eventSummaries(db: D1Database, rows: EventRow[]): Promise<EventSummary[]> {
  const slugs = rows.map((r) => r.slug);
  const [mk, cc] = await Promise.all([marketSummariesForEvents(db, slugs), commentCounts(db, slugs)]);
  return rows.map((e) => toEventSummary(e, mk.get(e.slug) ?? [], cc.get(e.slug) ?? 0));
}

export async function eventDetail(db: D1Database, slug: string): Promise<EventDetail | null> {
  const e = await db.prepare(`SELECT * FROM events WHERE slug = ?`).bind(slug).first<EventRow>();
  if (!e) return null;
  const [s] = await eventSummaries(db, [e]);
  return { ...s, description: e.description, rules: e.rules, createdAt: e.created_at };
}

/** Current yes price per ticker (for mark-to-market), for a set of tickers. */
export async function currentPrices(db: D1Database, tickers: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!tickers.length) return m;
  const { results } = await db
    .prepare(
      `SELECT m.ticker, m.status, m.result, m.last_price,
        (SELECT MAX(o.yes_price) FROM orders o WHERE o.ticker = m.ticker AND o.status = 'open' AND o.book_side = 'bid') AS best_bid,
        (SELECT MIN(o.yes_price) FROM orders o WHERE o.ticker = m.ticker AND o.status = 'open' AND o.book_side = 'ask') AS best_ask
       FROM markets m WHERE m.ticker IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(tickers))
    .all<{ ticker: string; status: string; result: string | null; last_price: number | null; best_bid: number | null; best_ask: number | null }>();
  for (const r of results) m.set(r.ticker, yesPriceOf(r, r.best_bid, r.best_ask));
  return m;
}
