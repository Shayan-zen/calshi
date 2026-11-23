import type { Action, Orderbook, OrderbookLevel, Side } from "../../shared/types";

/**
 * Levels a taker would hit, best first, priced in terms of `side`.
 * Buying YES lifts YES asks (= 100 − NO bids); selling YES hits YES bids. Symmetric for NO.
 */
export function takerLevels(book: Orderbook | undefined, side: Side, action: Action): OrderbookLevel[] {
  if (!book) return [];
  const same = side === "yes" ? book.yes : book.no;
  const other = side === "yes" ? book.no : book.yes;
  if (action === "buy") {
    return other.map((l) => ({ price: 100 - l.price, qty: l.qty })).sort((a, b) => a.price - b.price);
  }
  return [...same].sort((a, b) => b.price - a.price);
}

export interface FillEstimate {
  count: number;
  total: number; // cents paid (buy) or received (sell)
  avgPrice: number | null;
  exhausted: boolean; // book ran out before the request was filled
}

/** Sweep by contracts. */
export function estimateByCount(levels: OrderbookLevel[], count: number, limit?: number, action: Action = "buy"): FillEstimate {
  let need = Math.max(0, Math.floor(count));
  let got = 0;
  let total = 0;
  for (const l of levels) {
    if (need <= 0) break;
    if (limit !== undefined && (action === "buy" ? l.price > limit : l.price < limit)) break;
    const take = Math.min(need, l.qty);
    got += take;
    total += take * l.price;
    need -= take;
  }
  return { count: got, total, avgPrice: got ? total / got : null, exhausted: need > 0 };
}

/** Sweep by dollars (buy only): how many whole contracts the budget buys. */
export function estimateByBudget(levels: OrderbookLevel[], budgetCents: number): FillEstimate {
  let left = Math.max(0, Math.floor(budgetCents));
  let got = 0;
  let total = 0;
  for (const l of levels) {
    if (left < l.price) break;
    const take = Math.min(l.qty, Math.floor(left / l.price));
    got += take;
    total += take * l.price;
    left -= take * l.price;
    if (take < l.qty) break;
  }
  const bookDepth = levels.reduce((s, l) => s + l.qty, 0);
  return { count: got, total, avgPrice: got ? total / got : null, exhausted: got >= bookDepth && left > 0 };
}
