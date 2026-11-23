import { useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { EventDetail, MarketSummary, Side } from "../../shared/types";
import { OrderBook, RecentTrades } from "./OrderBook";
import { Change } from "./ui";
import { pct, volume } from "../lib/format";

function PriceButton({
  side,
  price,
  active,
  disabled,
  onClick,
}: {
  side: Side;
  price: number | null;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const yes = side === "yes";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={clsx(
        "tnum w-[80px] rounded-lg py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 sm:w-[104px]",
        yes
          ? active
            ? "bg-yes text-white"
            : "bg-yes-tint text-yes-strong hover:bg-yes-tint-2"
          : active
            ? "bg-no text-white"
            : "bg-no-tint text-no-strong hover:bg-no-tint-2",
      )}
    >
      {yes ? "Yes" : "No"} {price === null ? "—" : `${price}¢`}
    </button>
  );
}

function OutcomeRow({
  market,
  single,
  selected,
  selectedSide,
  onSelect,
  expanded,
  onToggle,
}: {
  market: MarketSummary;
  single: boolean;
  selected: boolean;
  selectedSide: Side;
  onSelect: (ticker: string, side: Side) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  const settled = market.status === "settled";
  const yesCost = market.yesAsk ?? market.yesPrice;
  const noCost = market.yesBid !== null ? 100 - market.yesBid : market.noPrice;

  return (
    <li className={clsx("relative border-b border-line-2 last:border-b-0", selected && "bg-surface/50")}>
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-surface/70 sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-ink">{single ? "Yes" : market.title}</span>
            <ChevronDown className={clsx("size-4 shrink-0 text-faint transition-transform", expanded && "rotate-180")} />
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {market.subtitle ? `${market.subtitle}  ` : ""}
            <span className="tnum">{volume(market.volume)} vol</span>
          </div>
        </div>
        <div className="flex w-14 flex-col items-end sm:w-24">
          <span className="tnum text-xl font-bold tracking-tight text-ink sm:text-2xl">{pct(market.yesPrice)}</span>
          <Change value={market.change24h} className="text-xs" />
        </div>
        {settled ? (
          <span
            className={clsx(
              "rounded-lg px-3 py-2 text-[13px] font-semibold",
              market.result === "yes" ? "bg-yes-tint text-yes-strong" : "bg-no-tint text-no-strong",
            )}
          >
            Resolved {market.result === "yes" ? "Yes" : "No"}
          </span>
        ) : (
          <div className="flex gap-1.5">
            <PriceButton
              side="yes"
              price={yesCost}
              active={selected && selectedSide === "yes"}
              disabled={market.status !== "open"}
              onClick={() => onSelect(market.ticker, "yes")}
            />
            <PriceButton
              side="no"
              price={noCost}
              active={selected && selectedSide === "no"}
              disabled={market.status !== "open"}
              onClick={() => onSelect(market.ticker, "no")}
            />
          </div>
        )}
      </div>
      {expanded && (
        <div className="animate-fade-in border-t border-line-2 bg-card px-1 pb-3 sm:px-3">
          <div className="flex gap-4 px-3 pt-2 text-sm font-medium">
            {(
              [
                ["book", "Order book"],
                ["trades", "Recent trades"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={clsx("border-b-2 py-1.5 transition-colors", tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-line">
            {tab === "book" ? <OrderBook market={market} /> : <RecentTrades ticker={market.ticker} />}
          </div>
        </div>
      )}
    </li>
  );
}

export default function OutcomesTable({
  event,
  selectedTicker,
  selectedSide,
  onSelect,
}: {
  event: EventDetail;
  selectedTicker: string | null;
  selectedSide: Side;
  onSelect: (ticker: string, side: Side) => void;
}) {
  const single = event.markets.length === 1;
  const [expanded, setExpanded] = useState<string | null>(single ? (event.markets[0]?.ticker ?? null) : null);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-line bg-surface/50 px-3 py-2 text-xs font-medium text-muted sm:px-4">
        <span>{single ? "Outcome" : `${event.markets.length} outcomes`}</span>
        <span className="hidden sm:block">Select a row for its order book</span>
      </div>
      <ul>
        {event.markets.map((m) => (
          <OutcomeRow
            key={m.ticker}
            market={m}
            single={single}
            selected={m.ticker === selectedTicker}
            selectedSide={selectedSide}
            onSelect={(t, s) => {
              onSelect(t, s);
            }}
            expanded={expanded === m.ticker}
            onToggle={() => {
              setExpanded((x) => (x === m.ticker ? null : m.ticker));
              if (m.status === "open") onSelect(m.ticker, selectedTicker === m.ticker ? selectedSide : "yes");
            }}
          />
        ))}
      </ul>
    </section>
  );
}
