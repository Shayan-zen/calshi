import type { Order, Trade } from "../../shared/types";
import type { OrderRow } from "./engine";

export const ORDER_SELECT = `SELECT o.*, m.title AS market_title, m.event_slug AS event_slug, e.title AS event_title
  FROM orders o JOIN markets m ON m.ticker = o.ticker JOIN events e ON e.slug = m.event_slug`;

export type OrderJoinRow = OrderRow & { market_title: string; event_slug: string; event_title: string };

export function toOrder(r: OrderJoinRow): Order {
  return {
    id: r.id,
    ticker: r.ticker,
    marketTitle: r.market_title,
    eventSlug: r.event_slug,
    eventTitle: r.event_title,
    side: r.side,
    action: r.action,
    type: r.type,
    price: r.price,
    count: r.count,
    remaining: r.remaining,
    filled: r.filled,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function loadOrder(db: D1Database, id: string): Promise<Order | null> {
  const r = await db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).bind(id).first<OrderJoinRow>();
  return r ? toOrder(r) : null;
}

export const TRADE_SELECT = `SELECT t.id, t.ticker, t.yes_price, t.qty, t.taker_side, t.created_at,
    m.title AS market_title, m.event_slug AS event_slug, e.title AS event_title,
    u.name AS taker_name, u.is_bot AS taker_is_bot
  FROM trades t JOIN markets m ON m.ticker = t.ticker JOIN events e ON e.slug = m.event_slug
  LEFT JOIN users u ON u.id = t.taker_user_id`;

export interface TradeJoinRow {
  id: string;
  ticker: string;
  yes_price: number;
  qty: number;
  taker_side: "yes" | "no";
  created_at: number;
  market_title: string;
  event_slug: string;
  event_title: string;
  taker_name: string | null;
  taker_is_bot: number | null;
}

export function toTrade(r: TradeJoinRow): Trade {
  return {
    id: r.id,
    ticker: r.ticker,
    marketTitle: r.market_title,
    eventSlug: r.event_slug,
    eventTitle: r.event_title,
    yesPrice: r.yes_price,
    qty: r.qty,
    takerSide: r.taker_side,
    takerName: r.taker_is_bot ? null : r.taker_name,
    createdAt: r.created_at,
  };
}
