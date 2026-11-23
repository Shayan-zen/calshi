import { useState } from "react";
import clsx from "clsx";
import type { MarketSummary, Side } from "../../shared/types";
import { useMarketTrades, useOrderbook } from "../hooks/queries";
import { Skeleton } from "./ui";
import { relTime } from "../lib/format";

interface Row {
  price: number;
  qty: number;
  cum: number;
}

/** Ladder for one market. `view` picks whose prices are shown (Kalshi's "Trade Yes / Trade No"). */
export function OrderBook({ market }: { market: MarketSummary }) {
  const [view, setView] = useState<Side>("yes");
  const book = useOrderbook(market.ticker);

  if (book.isLoading) {
    return (
      <div className="space-y-1.5 p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (!book.data) return <p className="p-4 text-sm text-muted">Order book unavailable.</p>;

  const same = view === "yes" ? book.data.yes : book.data.no;
  const other = view === "yes" ? book.data.no : book.data.yes;

  // Asks for `view` side = 100 − bids on the other side. Show highest at top, best (lowest) next to spread.
  const asksAsc = other.map((l) => ({ price: 100 - l.price, qty: l.qty })).sort((a, b) => a.price - b.price).slice(0, 8);
  let c = 0;
  const asks: Row[] = asksAsc.map((l) => ({ ...l, cum: (c += l.qty) })).reverse();
  c = 0;
  const bids: Row[] = [...same]
    .sort((a, b) => b.price - a.price)
    .slice(0, 8)
    .map((l) => ({ ...l, cum: (c += l.qty) }));

  const maxQty = Math.max(1, ...asks.map((r) => r.qty), ...bids.map((r) => r.qty));
  const bestAsk = asksAsc[0]?.price ?? null;
  const bestBid = bids[0]?.price ?? null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const last = view === "yes" ? market.yesPrice : market.noPrice;

  const row = (r: Row, kind: "ask" | "bid") => (
    <div key={`${kind}${r.price}`} className="relative grid grid-cols-3 items-center px-3 py-[5px] text-[13px]">
      <div
        className={clsx("absolute inset-y-0.5 left-0 rounded-r", kind === "ask" ? "bg-down/10" : "bg-yes/12")}
        style={{ width: `${(r.qty / maxQty) * 100}%` }}
      />
      <span className={clsx("tnum relative font-semibold", kind === "ask" ? "text-down" : "text-yes-strong")}>{r.price}¢</span>
      <span className="tnum relative text-right text-ink-2">{r.qty.toLocaleString()}</span>
      <span className="tnum relative text-right text-muted">${((r.price * r.cum) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <div className="flex gap-1 rounded-lg bg-surface p-0.5 text-xs font-semibold">
          {(["yes", "no"] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => setView(s)}
              className={clsx(
                "rounded-md px-2.5 py-1",
                view === s ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              Trade {s === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">Top of book</span>
      </div>
      <div className="grid grid-cols-3 border-y border-line-2 px-3 py-1.5 text-[11px] font-medium text-muted">
        <span>Price</span>
        <span className="text-right">Contracts</span>
        <span className="text-right">Total</span>
      </div>
      <div className="py-1">
        {asks.length === 0 ? <p className="px-3 py-2 text-xs text-faint">No asks</p> : asks.map((r) => row(r, "ask"))}
      </div>
      <div className="flex items-center justify-between border-y border-line-2 bg-surface px-3 py-1.5 text-xs">
        <span className="text-muted">
          Last <span className="tnum font-semibold text-ink">{last}¢</span>
        </span>
        <span className="text-muted">
          Spread <span className="tnum font-semibold text-ink">{spread === null ? "—" : `${spread}¢`}</span>
        </span>
      </div>
      <div className="py-1">
        {bids.length === 0 ? <p className="px-3 py-2 text-xs text-faint">No bids</p> : bids.map((r) => row(r, "bid"))}
      </div>
    </div>
  );
}

export function RecentTrades({ ticker }: { ticker: string }) {
  const trades = useMarketTrades(ticker);
  const list = trades.data?.trades.slice(0, 12) ?? [];
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line-2 px-3 py-1.5 text-[11px] font-medium text-muted">
        <span>Side</span>
        <span className="w-14 text-right">Contracts</span>
        <span className="w-14 text-right">Time</span>
      </div>
      {trades.isLoading ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted">No trades yet</p>
      ) : (
        <ul className="py-1">
          {list.map((t) => (
            <li key={t.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-[5px] text-[13px]">
              <span className={clsx("tnum font-semibold", t.takerSide === "yes" ? "text-yes-strong" : "text-no-strong")}>
                {t.takerSide === "yes" ? `Yes ${t.yesPrice}¢` : `No ${100 - t.yesPrice}¢`}
              </span>
              <span className="tnum w-14 text-right text-ink-2">{t.qty}</span>
              <span className="w-14 text-right text-xs text-faint">{relTime(t.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
