/**
 * Central limit order book with Kalshi semantics.
 *
 * One book per market in YES-price terms:
 *   buy YES @p  -> bid p        sell NO @p -> bid 100-p
 *   buy NO  @p  -> ask 100-p    sell YES @p -> ask p
 * Match combos (bid x ask):
 *   BuyYes x SellYes -> YES transfer      BuyYes x BuyNo  -> mint a pair
 *   SellNo x SellYes -> burn a pair       SellNo x BuyNo  -> NO transfer
 * Fills execute at the maker's price, price-time priority, self-trade prevention by skipping.
 *
 * Concurrency: D1 has no interactive transactions. We read state, compute every write in JS,
 * and commit with ONE db.batch() (atomic). Each write derived from a read is guarded:
 *   - `INSERT INTO guard (v) SELECT NULL WHERE NOT EXISTS (<expected row state>)` fails (NOT NULL)
 *     if a maker order / position / market changed since we read it;
 *   - balances are relative updates protected by CHECK (balance >= 0).
 * A constraint failure rolls the whole batch back and the placement is retried.
 */
import type { Action, Fill, OrderStatus, OrderType, PlaceOrderRequest, Side } from "../../shared/types";
import { BOT_IDS, HttpError, bad, isConstraintError, newId } from "./util";
import type { MarketRow } from "./markets";

export interface OrderRow {
  id: string;
  user_id: string;
  ticker: string;
  side: Side;
  action: Action;
  type: OrderType;
  price: number;
  yes_price: number;
  book_side: "bid" | "ask";
  count: number;
  remaining: number;
  filled: number;
  status: OrderStatus;
  created_at: number;
}

interface PositionRow {
  user_id: string;
  ticker: string;
  yes_qty: number;
  no_qty: number;
  yes_cost: number;
  no_cost: number;
  yes_reserved: number;
  no_reserved: number;
  realized_pnl: number;
  version: number;
}

interface PosState {
  yes: { qty: number; cost: number; res: number };
  no: { qty: number; cost: number; res: number };
  realized: number;
  version: number;
  exists: boolean;
  dirty: boolean;
}

export const PRICE_POINT_THROTTLE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_MAKERS = 200;

const GUARD = (cond: string) => `INSERT INTO guard (v) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM ${cond})`;

export function bookOf(side: Side, action: Action, price: number): { bookSide: "bid" | "ask"; yesPrice: number } {
  if (side === "yes") return action === "buy" ? { bookSide: "bid", yesPrice: price } : { bookSide: "ask", yesPrice: price };
  return action === "sell" ? { bookSide: "bid", yesPrice: 100 - price } : { bookSide: "ask", yesPrice: 100 - price };
}

function posFromRow(r: PositionRow | undefined): PosState {
  if (!r)
    return { yes: { qty: 0, cost: 0, res: 0 }, no: { qty: 0, cost: 0, res: 0 }, realized: 0, version: 0, exists: false, dirty: false };
  return {
    yes: { qty: r.yes_qty, cost: r.yes_cost, res: r.yes_reserved },
    no: { qty: r.no_qty, cost: r.no_cost, res: r.no_reserved },
    realized: r.realized_pnl,
    version: r.version,
    exists: true,
    dirty: false,
  };
}

function removeShares(p: PosState, side: Side, q: number): number {
  const leg = p[side];
  const removedCost = q >= leg.qty ? leg.cost : Math.round((leg.cost * q) / leg.qty);
  leg.qty -= q;
  leg.cost -= removedCost;
  p.dirty = true;
  return removedCost;
}

export interface PlaceResult {
  order: OrderRow;
  fills: Fill[];
  avgPrice: number | null;
  balance: number;
}

export async function placeOrder(db: D1Database, userId: string, req: PlaceOrderRequest): Promise<PlaceResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptPlace(db, userId, req);
    } catch (e) {
      if (isConstraintError(e) && attempt < MAX_ATTEMPTS) continue;
      if (isConstraintError(e)) throw new HttpError(409, "The order book changed while placing your order — please retry");
      throw e;
    }
  }
}

async function attemptPlace(db: D1Database, userId: string, req: PlaceOrderRequest): Promise<PlaceResult> {
  const now = Date.now();
  const { ticker, side, action, type, count } = req;
  const isMarket = type === "market";
  const limit = isMarket ? (action === "buy" ? 99 : 1) : req.price!;
  const { bookSide, yesPrice: limitYes } = bookOf(side, action, limit);

  const [market, user, openAgg] = await Promise.all([
    db.prepare(`SELECT * FROM markets WHERE ticker = ?`).bind(ticker).first<MarketRow>(),
    db.prepare(`SELECT id, balance, is_bot FROM users WHERE id = ?`).bind(userId).first<{ id: string; balance: number; is_bot: number }>(),
    db
      .prepare(`SELECT side, action, COUNT(*) AS n FROM orders WHERE user_id = ? AND ticker = ? AND status = 'open' GROUP BY side, action`)
      .bind(userId, ticker)
      .all<{ side: Side; action: Action; n: number }>(),
  ]);
  if (!market) throw new HttpError(404, "Market not found");
  if (market.status !== "open" || market.close_time <= now) throw bad("Market is not open for trading");
  if (!user) throw new HttpError(401, "Unknown user");

  // A user never holds both sides. Opposite-side resting orders that could leave reserved
  // shares un-redeemable are rejected up front.
  const has = (s: Side, a: Action) => openAgg.results.some((r) => r.side === s && r.action === a && r.n > 0);
  const other: Side = side === "yes" ? "no" : "yes";
  if (action === "buy" && has(other, "sell"))
    throw bad(`Cancel your open ${other.toUpperCase()} sell orders before buying ${side.toUpperCase()}`);
  if (action === "sell" && has(other, "buy"))
    throw bad(`Cancel your open ${other.toUpperCase()} buy orders before selling ${side.toUpperCase()}`);

  // Opposing book, excluding the user's own orders (self-trade prevention).
  const makers = (
    bookSide === "bid"
      ? await db
          .prepare(
            `SELECT * FROM orders WHERE ticker = ? AND status = 'open' AND book_side = 'ask' AND yes_price <= ? AND user_id != ?
             ORDER BY yes_price ASC, created_at ASC, rowid ASC LIMIT ${MAX_MAKERS}`,
          )
          .bind(ticker, limitYes, userId)
          .all<OrderRow>()
      : await db
          .prepare(
            `SELECT * FROM orders WHERE ticker = ? AND status = 'open' AND book_side = 'bid' AND yes_price >= ? AND user_id != ?
             ORDER BY yes_price DESC, created_at ASC, rowid ASC LIMIT ${MAX_MAKERS}`,
          )
          .bind(ticker, limitYes, userId)
          .all<OrderRow>()
  ).results;

  const userIds = [...new Set([userId, ...makers.map((m) => m.user_id)])];
  const [posRes, usersRes] = await Promise.all([
    db
      .prepare(`SELECT * FROM positions WHERE ticker = ? AND user_id IN (SELECT value FROM json_each(?))`)
      .bind(ticker, JSON.stringify(userIds))
      .all<PositionRow>(),
    db
      .prepare(`SELECT id, is_bot FROM users WHERE id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(userIds))
      .all<{ id: string; is_bot: number }>(),
  ]);
  const isBot = new Map(usersRes.results.map((u) => [u.id, !!u.is_bot]));
  const posRows = new Map(posRes.results.map((p) => [p.user_id, p]));
  const pos = new Map<string, PosState>();
  const P = (uid: string) => {
    let p = pos.get(uid);
    if (!p) {
      p = posFromRow(posRows.get(uid));
      pos.set(uid, p);
    }
    return p;
  };
  const cash = new Map<string, number>(); // balance deltas
  const vol = new Map<string, number>();
  const addCash = (uid: string, d: number) => cash.set(uid, (cash.get(uid) ?? 0) + d);
  const addVol = (uid: string, d: number) => vol.set(uid, (vol.get(uid) ?? 0) + d);

  const takerPos = P(userId);
  if (action === "sell") {
    const free = takerPos[side].qty - takerPos[side].res;
    if (free < count) throw bad(free <= 0 ? `You have no ${side.toUpperCase()} contracts to sell` : `You can only sell ${free} ${side.toUpperCase()} contracts`);
  } else if (!isMarket && limit * count > user.balance) {
    throw bad("Insufficient balance");
  }

  const takerId = newId();
  const fills: Fill[] = [];
  const makerUpdates: Array<{ id: string; q: number }> = [];
  const trades: Array<{ id: string; yes: number; q: number; kind: string; maker: OrderRow }> = [];
  let remaining = count;
  let cashAvail = user.balance;
  let oiDelta = 0;
  let volume = 0;
  let lastPrice: number | null = null;
  let realUserInvolved = !isBot.get(userId);
  let costTotal = 0; // in taker side terms

  for (const mk of makers) {
    if (remaining === 0) break;
    const m = mk.yes_price;
    const takerSidePrice = side === "yes" ? m : 100 - m;
    let q = Math.min(remaining, mk.remaining);
    if (action === "buy" && isMarket) {
      q = Math.min(q, Math.floor(cashAvail / takerSidePrice));
      if (q <= 0) break;
      cashAvail -= q * takerSidePrice;
    }

    // Apply each leg of the fill.
    for (const o of [
      { uid: userId, side, action, isTaker: true },
      { uid: mk.user_id, side: mk.side, action: mk.action, isTaker: false },
    ]) {
      const sp = o.side === "yes" ? m : 100 - m;
      const p = P(o.uid);
      if (o.action === "buy") {
        p[o.side].qty += q;
        p[o.side].cost += q * sp;
        p.dirty = true;
        // Maker buys were reserved at exactly this price; taker pays now.
        if (o.isTaker) addCash(o.uid, -q * sp);
      } else {
        if (!o.isTaker) p[o.side].res -= q;
        const removed = removeShares(p, o.side, q);
        p.realized += q * sp - removed;
        addCash(o.uid, q * sp);
      }
      addVol(o.uid, q);
    }

    const bidAction = bookSide === "bid" ? action : mk.action; // buy YES | sell NO
    const askAction = bookSide === "bid" ? mk.action : action; // sell YES | buy NO
    let kind: string;
    if (bidAction === "buy" && askAction === "sell") kind = "transfer_yes";
    else if (bidAction === "buy" && askAction === "buy") {
      kind = "mint";
      oiDelta += q;
    } else if (bidAction === "sell" && askAction === "sell") {
      kind = "burn";
      oiDelta -= q;
    } else kind = "transfer_no";

    if (!isBot.get(mk.user_id)) realUserInvolved = true;
    makerUpdates.push({ id: mk.id, q });
    trades.push({ id: newId(), yes: m, q, kind, maker: mk });
    fills.push({ price: takerSidePrice, qty: q });
    costTotal += takerSidePrice * q;
    volume += q;
    lastPrice = m;
    remaining -= q;
  }

  const filled = count - remaining;
  if (isMarket && filled === 0) {
    if (action === "buy" && makers.length > 0 && cashAvail < (side === "yes" ? makers[0].yes_price : 100 - makers[0].yes_price))
      throw bad("Insufficient balance");
    throw bad("No liquidity");
  }

  // Resting remainder (limit) or IOC cancel (market).
  let status: OrderStatus;
  let restRemaining = 0;
  if (isMarket) status = remaining === 0 ? "filled" : "cancelled";
  else {
    restRemaining = remaining;
    status = remaining === 0 ? "filled" : "open";
    if (remaining > 0) {
      if (action === "buy") addCash(userId, -limit * remaining);
      else {
        takerPos[side].res += remaining;
        takerPos.dirty = true;
      }
    }
  }

  // Auto-redeem YES+NO pairs at 100¢ for everyone touched.
  for (const [uid, p] of pos) {
    if (!p.dirty) continue;
    const pairs = Math.min(p.yes.qty - p.yes.res, p.no.qty - p.no.res);
    if (pairs > 0) {
      const ry = removeShares(p, "yes", pairs);
      const rn = removeShares(p, "no", pairs);
      p.realized += 100 * pairs - ry - rn;
      addCash(uid, 100 * pairs);
      oiDelta -= pairs;
    }
  }

  const avgPrice = filled > 0 ? costTotal / filled : null;
  const storedPrice = isMarket ? Math.min(99, Math.max(1, Math.round(avgPrice ?? limit))) : limit;
  const stored = bookOf(side, action, storedPrice);
  const order: OrderRow = {
    id: takerId,
    user_id: userId,
    ticker,
    side,
    action,
    type,
    price: storedPrice,
    yes_price: stored.yesPrice,
    book_side: stored.bookSide,
    count,
    remaining: restRemaining,
    filled,
    status,
    created_at: now,
  };

  // ---- Build the atomic batch ----
  const st: D1PreparedStatement[] = [];
  st.push(db.prepare(GUARD(`markets WHERE ticker = ? AND status = 'open'`)).bind(ticker));
  for (const u of makerUpdates) {
    st.push(db.prepare(GUARD(`orders WHERE id = ? AND status = 'open' AND remaining >= ?`)).bind(u.id, u.q));
    st.push(
      db
        .prepare(
          `UPDATE orders SET remaining = remaining - ?1, filled = filled + ?1,
             status = CASE WHEN remaining - ?1 = 0 THEN 'filled' ELSE status END WHERE id = ?2`,
        )
        .bind(u.q, u.id),
    );
  }
  for (const [uid, p] of pos) {
    if (!p.dirty) continue;
    if (p.exists) {
      st.push(db.prepare(GUARD(`positions WHERE user_id = ? AND ticker = ? AND version = ?`)).bind(uid, ticker, p.version));
      st.push(
        db
          .prepare(
            `UPDATE positions SET yes_qty = ?, no_qty = ?, yes_cost = ?, no_cost = ?, yes_reserved = ?, no_reserved = ?,
               realized_pnl = ?, version = version + 1 WHERE user_id = ? AND ticker = ?`,
          )
          .bind(p.yes.qty, p.no.qty, p.yes.cost, p.no.cost, p.yes.res, p.no.res, p.realized, uid, ticker),
      );
    } else {
      st.push(
        db
          .prepare(
            `INSERT INTO positions (user_id, ticker, yes_qty, no_qty, yes_cost, no_cost, yes_reserved, no_reserved, realized_pnl, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          )
          .bind(uid, ticker, p.yes.qty, p.no.qty, p.yes.cost, p.no.cost, p.yes.res, p.no.res, p.realized),
      );
    }
  }
  for (const uid of new Set([...cash.keys(), ...vol.keys()])) {
    st.push(
      db.prepare(`UPDATE users SET balance = balance + ?, volume = volume + ? WHERE id = ?`).bind(cash.get(uid) ?? 0, vol.get(uid) ?? 0, uid),
    );
  }
  st.push(
    db
      .prepare(
        `INSERT INTO orders (id, user_id, ticker, side, action, type, price, yes_price, book_side, count, remaining, filled, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(order.id, userId, ticker, side, action, type, order.price, order.yes_price, order.book_side, count, order.remaining, filled, status, now),
  );
  const takerSide: Side = bookSide === "bid" ? "yes" : "no";
  for (const t of trades) {
    st.push(
      db
        .prepare(
          `INSERT INTO trades (id, ticker, yes_price, qty, taker_side, kind, taker_user_id, maker_user_id, taker_order_id, maker_order_id, both_bots, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(t.id, ticker, t.yes, t.q, takerSide, t.kind, userId, t.maker.user_id, takerId, t.maker.id,
          isBot.get(userId) && isBot.get(t.maker.user_id) ? 1 : 0, now),
    );
  }
  if (volume > 0 || oiDelta !== 0) {
    const addPoint = lastPrice != null && (realUserInvolved || now - market.last_point_at >= PRICE_POINT_THROTTLE_MS);
    st.push(
      db
        .prepare(
          `UPDATE markets SET last_price = COALESCE(?, last_price), volume = volume + ?, open_interest = open_interest + ?,
             last_point_at = CASE WHEN ? THEN ? ELSE last_point_at END WHERE ticker = ?`,
        )
        .bind(lastPrice, volume, oiDelta, addPoint ? 1 : 0, now, ticker),
    );
    if (addPoint) st.push(db.prepare(`INSERT INTO price_history (ticker, t, p) VALUES (?, ?, ?)`).bind(ticker, now, lastPrice));
  }

  await db.batch(st);
  return { order, fills: mergeFills(fills), avgPrice, balance: user.balance + (cash.get(userId) ?? 0) };
}

function mergeFills(fills: Fill[]): Fill[] {
  const out: Fill[] = [];
  for (const f of fills) {
    const last = out[out.length - 1];
    if (last && last.price === f.price) last.qty += f.qty;
    else out.push({ ...f });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Set-based cancellation / close / settlement. These read the live state inside the
// atomic batch, so they are always consistent regardless of concurrent activity.

/**
 * Statements that cancel all open orders matching `where` (unqualified orders columns)
 * and refund their reservations (cash for buys, reserved shares for sells).
 */
export function cancelStatements(db: D1Database, where: string, binds: unknown[]): D1PreparedStatement[] {
  const w = `(${where})`;
  return [
    db
      .prepare(
        `UPDATE users SET balance = balance + (
           SELECT COALESCE(SUM(o.remaining * o.price), 0) FROM orders o
           WHERE o.user_id = users.id AND o.action = 'buy' AND o.status = 'open' AND ${w})
         WHERE id IN (SELECT o.user_id FROM orders o WHERE o.action = 'buy' AND o.status = 'open' AND ${w})`,
      )
      .bind(...binds, ...binds),
    db
      .prepare(
        `UPDATE positions SET
           yes_reserved = yes_reserved - (SELECT COALESCE(SUM(o.remaining), 0) FROM orders o
             WHERE o.user_id = positions.user_id AND o.ticker = positions.ticker AND o.action = 'sell' AND o.side = 'yes' AND o.status = 'open' AND ${w}),
           no_reserved = no_reserved - (SELECT COALESCE(SUM(o.remaining), 0) FROM orders o
             WHERE o.user_id = positions.user_id AND o.ticker = positions.ticker AND o.action = 'sell' AND o.side = 'no' AND o.status = 'open' AND ${w}),
           version = version + 1
         WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = positions.user_id AND o.ticker = positions.ticker
           AND o.action = 'sell' AND o.status = 'open' AND ${w})`,
      )
      .bind(...binds, ...binds, ...binds),
    db.prepare(`UPDATE orders SET status = 'cancelled', remaining = 0 WHERE status = 'open' AND ${w}`).bind(...binds),
  ];
}

export async function closeMarket(db: D1Database, ticker: string): Promise<void> {
  await db.batch([
    db.prepare(GUARD(`markets WHERE ticker = ? AND status = 'open'`)).bind(ticker),
    ...cancelStatements(db, `ticker = ?`, [ticker]),
    db.prepare(`UPDATE markets SET status = 'closed' WHERE ticker = ?`).bind(ticker),
  ]);
}

export async function settleMarket(db: D1Database, ticker: string, result: Side): Promise<void> {
  await db.batch(settleStatements(db, ticker, result, Date.now()));
}

/** All statements that settle one market (guarded on it not being settled yet). */
export function settleStatements(db: D1Database, ticker: string, result: Side, now: number): D1PreparedStatement[] {
  const winQty = result === "yes" ? "yes_qty" : "no_qty";
  const st: D1PreparedStatement[] = [
    db.prepare(GUARD(`markets WHERE ticker = ? AND status != 'settled'`)).bind(ticker),
    ...cancelStatements(db, `ticker = ?`, [ticker]),
  ];
  for (const s of ["yes", "no"] as const) {
    st.push(
      db
        .prepare(
          `INSERT INTO settlements (user_id, ticker, side, qty, result, payout, pnl, settled_at)
           SELECT user_id, ticker, ?1, ${s}_qty, ?2, CASE WHEN ?1 = ?2 THEN 100 * ${s}_qty ELSE 0 END,
                  (CASE WHEN ?1 = ?2 THEN 100 * ${s}_qty ELSE 0 END) - ${s}_cost, ?3
           FROM positions WHERE ticker = ?4 AND ${s}_qty > 0`,
        )
        .bind(s, result, now, ticker),
    );
  }
  st.push(
    db
      .prepare(
        `UPDATE users SET balance = balance + 100 * (SELECT p.${winQty} FROM positions p WHERE p.user_id = users.id AND p.ticker = ?1)
         WHERE id IN (SELECT user_id FROM positions WHERE ticker = ?1 AND ${winQty} > 0)`,
      )
      .bind(ticker),
    db
      .prepare(
        `UPDATE positions SET realized_pnl = realized_pnl + 100 * ${winQty} - yes_cost - no_cost,
           yes_qty = 0, no_qty = 0, yes_cost = 0, no_cost = 0, yes_reserved = 0, no_reserved = 0, version = version + 1
         WHERE ticker = ?`,
      )
      .bind(ticker),
    db
      .prepare(`UPDATE markets SET status = 'settled', result = ?, settled_at = ?, last_price = ?, open_interest = 0 WHERE ticker = ?`)
      .bind(result, now, result === "yes" ? 100 : 0, ticker),
    db.prepare(`INSERT INTO price_history (ticker, t, p) VALUES (?, ?, ?)`).bind(ticker, now, result === "yes" ? 100 : 0),
  );
  return st;
}

/**
 * Statements that void a whole event: cancel + refund every open order, refund each holder's
 * remaining cost basis in cash, then delete the event and every row that references it.
 */
export function voidEventStatements(db: D1Database, slug: string): D1PreparedStatement[] {
  const inEvent = `ticker IN (SELECT ticker FROM markets WHERE event_slug = ?)`;
  return [
    db.prepare(GUARD(`events WHERE slug = ?`)).bind(slug),
    ...cancelStatements(db, inEvent, [slug]),
    db
      .prepare(
        `UPDATE users SET balance = balance + (
           SELECT COALESCE(SUM(p.yes_cost + p.no_cost), 0) FROM positions p
           WHERE p.user_id = users.id AND p.${inEvent})
         WHERE id IN (SELECT p.user_id FROM positions p WHERE p.${inEvent} AND (p.yes_cost + p.no_cost) > 0)`,
      )
      .bind(slug, slug),
    db.prepare(`DELETE FROM positions WHERE ${inEvent}`).bind(slug),
    db.prepare(`DELETE FROM orders WHERE ${inEvent}`).bind(slug),
    db.prepare(`DELETE FROM trades WHERE ${inEvent}`).bind(slug),
    db.prepare(`DELETE FROM price_history WHERE ${inEvent}`).bind(slug),
    db.prepare(`DELETE FROM settlements WHERE ${inEvent}`).bind(slug),
    db.prepare(`DELETE FROM comments WHERE event_slug = ?`).bind(slug),
    db.prepare(`DELETE FROM markets WHERE event_slug = ?`).bind(slug),
    db.prepare(`DELETE FROM events WHERE slug = ?`).bind(slug),
  ];
}

export async function cancelOrder(db: D1Database, orderId: string): Promise<void> {
  await db.batch([
    db.prepare(GUARD(`orders WHERE id = ? AND status = 'open'`)).bind(orderId),
    ...cancelStatements(db, `id = ?`, [orderId]),
  ]);
}

export const isBotId = (id: string) => BOT_IDS.includes(id);
