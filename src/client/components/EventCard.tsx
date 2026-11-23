import { Link, useNavigate } from "react-router";
import { MessageCircle } from "lucide-react";
import clsx from "clsx";
import type { EventSummary, MarketSummary, Side } from "../../shared/types";
import EventIcon from "./EventIcon";
import Gauge from "./Gauge";
import { Skeleton } from "./ui";
import { closesLabel, pct, volume } from "../lib/format";

export function tradeLink(slug: string, ticker: string, side: Side) {
  return `/events/${slug}?market=${encodeURIComponent(ticker)}&side=${side}`;
}

function YesNoPills({ event, market, size = "sm" }: { event: EventSummary; market: MarketSummary; size?: "sm" | "lg" }) {
  const navigate = useNavigate();
  const go = (side: Side) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(tradeLink(event.slug, market.ticker, side));
  };
  const disabled = market.status !== "open";
  const base =
    size === "lg"
      ? "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-colors"
      : "w-11 rounded-md py-1 text-xs font-semibold transition-colors";
  if (market.status === "settled" && market.result) {
    return (
      <span
        className={clsx(
          base,
          size === "sm" && "w-auto px-2",
          "inline-flex justify-center",
          market.result === "yes" ? "bg-yes-tint text-yes-strong" : "bg-no-tint text-no-strong",
        )}
      >
        {size === "lg" ? `Resolved ${market.result === "yes" ? "Yes" : "No"}` : market.result === "yes" ? "Won Yes" : "Won No"}
      </span>
    );
  }
  return (
    <div className={clsx("flex shrink-0 gap-1.5", size === "lg" && "w-full")}>
      <button
        onClick={go("yes")}
        disabled={disabled}
        className={clsx(base, "bg-yes-tint text-yes-strong hover:bg-yes hover:text-white disabled:pointer-events-none disabled:opacity-50")}
        aria-label={`Buy Yes on ${market.title}`}
      >
        Yes
        {size === "lg" && <span className="tnum font-medium opacity-80">{market.yesAsk ?? market.yesPrice}¢</span>}
      </button>
      <button
        onClick={go("no")}
        disabled={disabled}
        className={clsx(base, "bg-no-tint text-no-strong hover:bg-no hover:text-white disabled:pointer-events-none disabled:opacity-50")}
        aria-label={`Buy No on ${market.title}`}
      >
        No
        {size === "lg" && (
          <span className="tnum font-medium opacity-80">{market.yesBid !== null ? 100 - market.yesBid : market.noPrice}¢</span>
        )}
      </button>
    </div>
  );
}

export default function EventCard({ event }: { event: EventSummary }) {
  const single = event.markets.length === 1;
  const m0 = event.markets[0];
  const rows = event.markets.slice(0, single ? 0 : 3);
  const more = event.markets.length - rows.length;

  return (
    <Link
      to={`/events/${event.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-card p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start gap-3">
        <EventIcon slug={event.slug} icon={event.icon} imageUrl={event.imageUrl} category={event.category} size={40} />
        <h3 className="line-clamp-2 min-h-10 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          {event.title}
        </h3>
        {single && m0 && <Gauge value={m0.yesPrice} size={68} />}
      </div>

      <div className="mt-3 flex-1">
        {single && m0 ? (
          <div className="flex h-full items-end">
            <YesNoPills event={event} market={m0} size="lg" />
          </div>
        ) : (
          <ul className="-mx-1.5 space-y-0.5">
            {rows.map((m) => (
              <li key={m.ticker} className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{m.title}</span>
                <span className="tnum w-10 text-right text-sm font-bold text-ink">{pct(m.yesPrice)}</span>
                <YesNoPills event={event} market={m} />
              </li>
            ))}
            {more > 0 && <li className="px-1.5 pt-1 text-xs font-medium text-muted">+{more} more outcomes</li>}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line-2 pt-2.5 text-xs text-muted">
        <span className="tnum font-medium">{volume(event.volume)} vol</span>
        {event.commentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3.5" />
            <span className="tnum">{event.commentCount}</span>
          </span>
        )}
        <span className="ml-auto">{closesLabel(event.closeTime)}</span>
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-1/2" />
    </div>
  );
}
