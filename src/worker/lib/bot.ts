/**
 * Market-maker bot ("Market Maker", id bot-mm) + noise taker ("Flow Trader", id bot-flow).
 *
 * Each tick processes the events whose markets were requoted longest ago:
 *  - fair value does a small mean-reverting random walk (toward the last trade price);
 *    mutually-exclusive events are normalized so fair values sum to ~100;
 *  - the market maker keeps a passive ladder of BUY YES bids below fair and BUY NO bids
 *    (= YES asks) above fair. Only buys => it needs no inventory. Quotes never cross resting
 *    user orders (they stay strictly inside the non-bot book), so they can be posted
 *    without running the matcher. Only the ladder diff is written (D1 write budget).
 *  - the flow trader sometimes sends a small market order so prices/volume move.
 *
 * Also closes markets past close_time and prunes stale bot orders / sessions.
 */
import { BOT_FLOW_ID, BOT_MM_ID, clamp, newId } from "./util";
import { cancelStatements, closeMarket, placeOrder } from "./engine";

/** Tuning. Each processed market costs ~1 row write + ladder diff; keep D1 write budget in mind. */
const MAX_MARKETS_PER_TICK = 10;
const LEVELS = 4;
const FLOW_PROB = 0.25;
const MIN_KEEP = 10; // replace a level when its remaining size drops below this

const BOT_LOCK_KEY = "bot_last_run";

function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Acquire the run lock if the last run is older than minIntervalMs (conditional update, no overlap). */
export async function tryAcquireBotLock(db: D1Database, minIntervalMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await db.prepare(`SELECT value FROM meta WHERE key = ?`).bind(BOT_LOCK_KEY).first<{ value: string }>();
  if (!row) {
    const r = await db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)`).bind(BOT_LOCK_KEY, String(now)).run();
    return r.meta.changes === 1;
  }
  if (now - Number(row.value) < minIntervalMs) return false;
  const r = await db
    .prepare(`UPDATE meta SET value = ? WHERE key = ? AND value = ?`)
    .bind(String(now), BOT_LOCK_KEY, row.value)
    .run();
  return r.meta.changes === 1;
}

export async function maybeRunBot(db: D1Database, minIntervalMs: number): Promise<void> {
  if (!(await tryAcquireBotLock(db, minIntervalMs))) return;
  await runBotTick(db);
}

export async function runBotTick(db: D1Database): Promise<void> {
  const now = Date.now();

  // 1. Close markets past their close time.
  const expired = await db
    .prepare(`SELECT ticker FROM markets WHERE status = 'open' AND close_time <= ? LIMIT 20`)
    .bind(now)
    .all<{ ticker: string }>();
  for (const m of expired.results) {
    try {
      await closeMarket(db, m.ticker);
    } catch (e) {
      console.error("close failed", m.ticker, e);
    }
  }

  // 2. Pick the stalest events.
  const evs = await db
    .prepare(
      `SELECT event_slug, MIN(bot_at) AS b, COUNT(*) AS n FROM markets WHERE status = 'open' AND close_time > ?
       GROUP BY event_slug ORDER BY b ASC LIMIT 25`,
    )
    .bind(now)
    .all<{ event_slug: string; b: number; n: number }>();
  const slugs: string[] = [];
  let n = 0;
  for (const e of evs.results) {
    if (slugs.length > 0 && n + e.n > MAX_MARKETS_PER_TICK) break;
    slugs.push(e.event_slug);
    n += e.n;
  }
  if (slugs.length) await quoteEvents(db, slugs, { walk: true, flow: true });

  // 3. Housekeeping (cheap, indexed).
  await db.batch([
    db
      .prepare(`DELETE FROM orders WHERE user_id IN (?, ?) AND status != 'open' AND created_at < ? AND (filled = 0 OR created_at < ?)`)
      .bind(BOT_MM_ID, BOT_FLOW_ID, now - 3600_000, now - 7 * 86400_000),
    db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now),
  ]);
}

interface QMarket {
  ticker: string;
  event_slug: string;
  last_price: number | null;
  fair_price: number;
  mutually_exclusive: number;
}

/** Requote (and optionally random-walk / flow-trade) every open market of the given events. */
export async function quoteEvents(db: D1Database, slugs: string[], opts: { walk: boolean; flow: boolean }): Promise<void> {
  const now = Date.now();
  const sl = JSON.stringify(slugs);
  const [mk, book, mine] = await Promise.all([
    db
      .prepare(
        `SELECT m.ticker, m.event_slug, m.last_price, m.fair_price, e.mutually_exclusive
         FROM markets m JOIN events e ON e.slug = m.event_slug
         WHERE m.status = 'open' AND m.close_time > ? AND m.event_slug IN (SELECT value FROM json_each(?))`,
      )
      .bind(now, sl)
      .all<QMarket>(),
    db
      .prepare(
        `SELECT o.ticker,
           MAX(CASE WHEN o.book_side = 'bid' THEN o.yes_price END) AS bb,
           MIN(CASE WHEN o.book_side = 'ask' THEN o.yes_price END) AS ba
         FROM orders o JOIN markets m ON m.ticker = o.ticker
         WHERE o.status = 'open' AND o.user_id != ? AND m.event_slug IN (SELECT value FROM json_each(?))
         GROUP BY o.ticker`,
      )
      .bind(BOT_MM_ID, sl)
      .all<{ ticker: string; bb: number | null; ba: number | null }>(),
    db
      .prepare(
        `SELECT o.id, o.ticker, o.book_side, o.yes_price, o.remaining FROM orders o JOIN markets m ON m.ticker = o.ticker
         WHERE o.status = 'open' AND o.user_id = ? AND m.event_slug IN (SELECT value FROM json_each(?))`,
      )
      .bind(BOT_MM_ID, sl)
      .all<{ id: string; ticker: string; book_side: "bid" | "ask"; yes_price: number; remaining: number }>(),
  ]);
  if (!mk.results.length) return;

  // Fair value walk.
  const fair = new Map<string, number>();
  for (const m of mk.results) {
    let f = m.fair_price;
    if (opts.walk) {
      const anchor = m.last_price ?? f;
      f = f + 0.12 * (anchor - f) + gauss() * 0.6;
    }
    fair.set(m.ticker, clamp(f, 1.5, 98.5));
  }
  // Normalize mutually exclusive events to sum ~100.
  const byEvent = new Map<string, QMarket[]>();
  for (const m of mk.results) if (m.mutually_exclusive) byEvent.set(m.event_slug, [...(byEvent.get(m.event_slug) ?? []), m]);
  for (const ms of byEvent.values()) {
    if (ms.length < 2) continue;
    const sum = ms.reduce((s, m) => s + fair.get(m.ticker)!, 0);
    if (sum <= 0) continue;
    for (const m of ms) fair.set(m.ticker, clamp((fair.get(m.ticker)! * 100) / sum, 1.5, 98.5));
  }

  const bookMap = new Map(book.results.map((b) => [b.ticker, b]));
  const mineBy = new Map<string, typeof mine.results>();
  for (const o of mine.results) mineBy.set(o.ticker, [...(mineBy.get(o.ticker) ?? []), o]);

  const st: D1PreparedStatement[] = [];
  const cancelIds: string[] = [];
  let reserve = 0;
  for (const m of mk.results) {
    const f = fair.get(m.ticker)!;
    const spread = 1 + (hash(m.ticker) % 3); // 1..3¢, stable per market
    const bid0 = Math.floor(f - spread / 2);
    const ask0 = Math.max(bid0 + 1, Math.ceil(f + spread / 2));
    const ub = bookMap.get(m.ticker);
    const maxBid = ub?.ba != null ? ub.ba - 1 : 99; // never cross resting user asks
    const minAsk = ub?.bb != null ? ub.bb + 1 : 1; // never cross resting user bids
    const desired = new Map<string, { side: "bid" | "ask"; yes: number; level: number }>();
    for (let i = 0; i < LEVELS; i++) {
      const b = bid0 - i;
      if (b >= 1 && b <= 98 && b <= maxBid) desired.set(`bid:${b}`, { side: "bid", yes: b, level: i });
      const a = ask0 + i;
      if (a <= 99 && a >= 2 && a >= minAsk) desired.set(`ask:${a}`, { side: "ask", yes: a, level: i });
    }
    for (const o of mineBy.get(m.ticker) ?? []) {
      const k = `${o.book_side}:${o.yes_price}`;
      if (desired.has(k) && o.remaining >= MIN_KEEP) desired.delete(k);
      else cancelIds.push(o.id);
    }
    for (const d of desired.values()) {
      const size = Math.min(400, randInt(20, 60) * (d.level + 1) + randInt(0, 40));
      const side = d.side === "bid" ? "yes" : "no";
      const price = d.side === "bid" ? d.yes : 100 - d.yes;
      reserve += size * price;
      st.push(
        db
          .prepare(
            `INSERT INTO orders (id, user_id, ticker, side, action, type, price, yes_price, book_side, count, remaining, filled, status, created_at)
             VALUES (?, ?, ?, ?, 'buy', 'limit', ?, ?, ?, ?, ?, 0, 'open', ?)`,
          )
          .bind(newId(), BOT_MM_ID, m.ticker, side, price, d.yes, d.side, size, size, now),
      );
    }
    st.push(db.prepare(`UPDATE markets SET fair_price = ?, bot_at = ? WHERE ticker = ?`).bind(f, now, m.ticker));
  }
  const pre: D1PreparedStatement[] = cancelIds.length
    ? cancelStatements(db, `id IN (SELECT value FROM json_each(?))`, [JSON.stringify(cancelIds)])
    : [];
  if (reserve > 0) pre.push(db.prepare(`UPDATE users SET balance = balance - ? WHERE id = ?`).bind(reserve, BOT_MM_ID));
  await db.batch([...pre, ...st]);

  if (!opts.flow) return;
  for (const m of mk.results) {
    if (Math.random() >= FLOW_PROB) continue;
    const f = fair.get(m.ticker)!;
    const last = m.last_price ?? f;
    const pYes = clamp(0.5 + (f - last) / 20, 0.15, 0.85);
    try {
      await placeOrder(db, BOT_FLOW_ID, {
        ticker: m.ticker,
        side: Math.random() < pYes ? "yes" : "no",
        action: "buy",
        type: "market",
        count: randInt(1, 25),
      });
    } catch {
      // no liquidity / conflicts are fine for the noise trader
    }
  }
}
