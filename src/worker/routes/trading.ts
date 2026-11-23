import { Hono } from "hono";
import { z } from "zod";
import type { Portfolio, Position, PlaceOrderResponse, Side, MarketStatus } from "../../shared/types";
import { STARTING_BALANCE } from "../../shared/types";
import { type AppEnv, requireUser } from "../lib/session";
import { cancelOrder, placeOrder } from "../lib/engine";
import { ORDER_SELECT, type OrderJoinRow, loadOrder, toOrder } from "../lib/mappers";
import { currentPrices } from "../lib/markets";
import { HttpError, bad, notFound, parseBody } from "../lib/util";

export const trading = new Hono<AppEnv>();

const placeSchema = z
  .object({
    ticker: z.string().min(1).max(100),
    side: z.enum(["yes", "no"]),
    action: z.enum(["buy", "sell"]),
    type: z.enum(["market", "limit"]),
    count: z.number().int().min(1).max(100000),
    price: z.number().int().min(1).max(99).optional(),
  })
  .refine((o) => o.type === "market" || o.price !== undefined, { message: "price is required for limit orders", path: ["price"] });

trading.post("/orders", async (c) => {
  const u = requireUser(c);
  const req = await parseBody(c, placeSchema);
  const r = await placeOrder(c.env.DB, u.row.id, req);
  const order = await loadOrder(c.env.DB, r.order.id);
  if (!order) throw new HttpError(500, "Order not found after placement");
  const res: PlaceOrderResponse = { order, fills: r.fills, avgPrice: r.avgPrice, balance: r.balance };
  return c.json(res);
});

trading.get("/orders", async (c) => {
  const u = requireUser(c);
  const status = c.req.query("status") === "all" ? "all" : "open";
  const ticker = c.req.query("ticker");
  const where = [`o.user_id = ?`];
  const binds: unknown[] = [u.row.id];
  if (status === "open") where.push(`o.status = 'open'`);
  if (ticker) {
    where.push(`o.ticker = ?`);
    binds.push(ticker);
  }
  const { results } = await c.env.DB.prepare(`${ORDER_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT 200`)
    .bind(...binds)
    .all<OrderJoinRow>();
  return c.json({ orders: results.map(toOrder) });
});

trading.delete("/orders/:id", async (c) => {
  const u = requireUser(c);
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT user_id, status FROM orders WHERE id = ?`).bind(id).first<{ user_id: string; status: string }>();
  if (!row || row.user_id !== u.row.id) throw notFound("Order not found");
  if (row.status !== "open") throw bad("Order is not open");
  try {
    await cancelOrder(c.env.DB, id);
  } catch (e) {
    if (/constraint/i.test(String((e as Error).message))) throw bad("Order is no longer open");
    throw e;
  }
  const [order, bal] = await Promise.all([
    loadOrder(c.env.DB, id),
    c.env.DB.prepare(`SELECT balance FROM users WHERE id = ?`).bind(u.row.id).first<{ balance: number }>(),
  ]);
  return c.json({ order, balance: bal?.balance ?? 0 });
});

trading.get("/portfolio", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const [bal, locked, pos, settled] = await Promise.all([
    db.prepare(`SELECT balance FROM users WHERE id = ?`).bind(u.row.id).first<{ balance: number }>(),
    db
      .prepare(`SELECT COALESCE(SUM(remaining * price), 0) AS v FROM orders WHERE user_id = ? AND status = 'open' AND action = 'buy'`)
      .bind(u.row.id)
      .first<{ v: number }>(),
    db
      .prepare(
        `SELECT p.*, m.title AS market_title, m.event_slug, m.status AS market_status, m.result, e.title AS event_title
         FROM positions p JOIN markets m ON m.ticker = p.ticker JOIN events e ON e.slug = m.event_slug
         WHERE p.user_id = ? AND (p.yes_qty > 0 OR p.no_qty > 0) AND m.status != 'settled'`,
      )
      .bind(u.row.id)
      .all<{
        ticker: string;
        yes_qty: number;
        no_qty: number;
        yes_cost: number;
        no_cost: number;
        market_title: string;
        event_slug: string;
        market_status: MarketStatus;
        result: Side | null;
        event_title: string;
      }>(),
    db
      .prepare(
        `SELECT s.*, m.title AS market_title, m.event_slug, e.title AS event_title
         FROM settlements s JOIN markets m ON m.ticker = s.ticker JOIN events e ON e.slug = m.event_slug
         WHERE s.user_id = ? ORDER BY s.settled_at DESC LIMIT 200`,
      )
      .bind(u.row.id)
      .all<{
        ticker: string;
        side: Side;
        qty: number;
        result: Side;
        payout: number;
        pnl: number;
        settled_at: number;
        market_title: string;
        event_slug: string;
        event_title: string;
      }>(),
  ]);
  const prices = await currentPrices(db, pos.results.map((p) => p.ticker));
  const positions: Position[] = [];
  for (const p of pos.results) {
    const y = prices.get(p.ticker) ?? 50;
    for (const side of ["yes", "no"] as const) {
      const qty = side === "yes" ? p.yes_qty : p.no_qty;
      if (qty <= 0) continue;
      const cost = side === "yes" ? p.yes_cost : p.no_cost;
      const mark = side === "yes" ? y : 100 - y;
      positions.push({
        ticker: p.ticker,
        marketTitle: p.market_title,
        eventSlug: p.event_slug,
        eventTitle: p.event_title,
        marketStatus: p.market_status,
        result: p.result,
        side,
        qty,
        avgPrice: cost / qty,
        markPrice: mark,
        value: qty * mark,
        costBasis: cost,
        pnl: qty * mark - cost,
      });
    }
  }
  const balance = bal?.balance ?? 0;
  const lockedInOrders = locked?.v ?? 0;
  const positionsValue = positions.reduce((s, p) => s + p.value, 0);
  const totalValue = balance + lockedInOrders + positionsValue;
  const res: Portfolio = {
    balance,
    lockedInOrders,
    positionsValue,
    totalValue,
    allTimePnl: totalValue - STARTING_BALANCE,
    positions,
    settled: settled.results.map((s) => ({
      ticker: s.ticker,
      marketTitle: s.market_title,
      eventSlug: s.event_slug,
      eventTitle: s.event_title,
      side: s.side,
      qty: s.qty,
      result: s.result,
      payout: s.payout,
      pnl: s.pnl,
      settledAt: s.settled_at,
    })),
  };
  return c.json(res);
});
