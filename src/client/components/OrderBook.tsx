import { useState } from "react";
import clsx from "clsx";
import type { MarketSummary, Side } from "../../shared/types";
import { useMarketTrades, useOrderbook } from "../hooks/queries";
import { Segmented, Skeleton } from "./ui";
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

  const row = (r: Row, kind: "ask" | "bid", best: boolean) => (
    <div
      key={`${kind}${r.price}`}
      className="group relative grid grid-cols-3 items-center px-3 py-[5px] text-[13px] transition-colors hover:bg-surface/70"
    >
      {/* depth bar, anchored right like Kalshi; best level a touch stronger */}
      <div
        aria-hidden
        className={clsx(
          "absolute inset-y-[3px] right-0 rounded-l-[3px] transition-[width] duration-300",
          kind === "ask" ? (best ? "bg-down/20" : "bg-down/10") : best ? "bg-yes/25" : "bg-yes/12",
        )}
        style={{ width: `${Math.max(2, (r.qty / maxQty) * 100)}%` }}
      />
      <span className={clsx("tnum relative font-semibold", kind === "ask" ? "text-down" : "text-yes-strong")}>{r.price}¢</span>
      <span className="tnum relative text-right text-ink-2">{r.qty.toLocaleString()}</span>
      <span className="tnum relative text-right text-muted">
        ${((r.price * r.cum) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-2">
        <Segmented
          label="Order book side"
          value={view}
          onChange={setView}
          options={[
            ["yes", "Trade Yes"],
            ["no", "Trade No"],
          ]}
        />
        <span className="text-[11px] font-medium text-muted">Top 8 levels</span>
      </div>
      <div className="grid grid-cols-3 border-y border-line-2 px-3 py-1.5 text-[11px] font-medium text-muted">
        <span>Price</span>
        <span className="text-right">Contracts</span>
        <span className="text-right">Total</span>
      </div>
      <div className="py-1">
        {asks.length === 0 ? <p className="px-3 py-2 text-xs text-faint">No asks</p> : asks.map((r, i) => row(r, "ask", i === asks.length - 1))}
      </div>
      <div className="flex items-center justify-between border-y border-line-2 bg-surface/70 px-3 py-1.5 text-xs">
        <span className="text-muted">
          Last <span className="tnum font-semibold text-ink">{last}¢</span>
        </span>
        <span className="text-muted">
          Spread <span className="tnum font-semibold text-ink">{spread === null ? "—" : `${spread}¢`}</span>
        </span>
      </div>
      <div className="py-1">
        {bids.length === 0 ? <p className="px-3 py-2 text-xs text-faint">No bids</p> : bids.map((r, i) => row(r, "bid", i === 0))}
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
            <li key={t.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-[5px] text-[13px] transition-colors hover:bg-surface/70">
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
