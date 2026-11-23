import { Link } from "react-router";
import clsx from "clsx";
import type { Trade } from "../../shared/types";
import Avatar from "./Avatar";
import { relTime } from "../lib/format";
import { Skeleton } from "./ui";

/** One trade, phrased the way the taker experienced it. */
export function TradeRow({ trade, showEvent = true, dense = false }: { trade: Trade; showEvent?: boolean; dense?: boolean }) {
  const name = trade.takerName ?? "Market Maker";
  const price = trade.takerSide === "yes" ? trade.yesPrice : 100 - trade.yesPrice;
  return (
    <div className={clsx("flex items-start gap-2.5", dense ? "py-2" : "py-2.5")}>
      <Avatar name={name} size={dense ? 26 : 30} />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <p className="text-ink-2">
          <span className="font-semibold text-ink">{name}</span> bought{" "}
          <span className="tnum font-semibold text-ink">{trade.qty}</span>{" "}
          <span className={clsx("font-semibold", trade.takerSide === "yes" ? "text-yes-strong" : "text-no-strong")}>
            {trade.takerSide === "yes" ? "Yes" : "No"}
          </span>{" "}
          at <span className="tnum font-semibold text-ink">{price}¢</span>
        </p>
        {showEvent && (
          <Link to={`/events/${trade.eventSlug}?market=${encodeURIComponent(trade.ticker)}`} className="mt-0.5 block truncate text-muted hover:text-ink hover:underline">
            {trade.marketTitle !== trade.eventTitle ? `${trade.marketTitle}: ` : ""}
            {trade.eventTitle}
          </Link>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-faint">{relTime(trade.createdAt)}</span>
    </div>
  );
}

export function TradeFeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-2.5">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
