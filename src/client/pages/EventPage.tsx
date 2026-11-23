import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { CalendarClock, ChevronDown, ChevronRight, FileText } from "lucide-react";
import clsx from "clsx";
import type { EventDetail, Range, Side } from "../../shared/types";
import { useEvent } from "../hooks/queries";
import { useChartSeries } from "../hooks/useChartSeries";
import { ApiError } from "../api";
import EventIcon from "../components/EventIcon";
import PriceChart, { RangeTabs } from "../components/PriceChart";
import OutcomesTable from "../components/OutcomesTable";
import TradeTicket, { PositionAndOrders } from "../components/TradeTicket";
import Comments from "../components/Comments";
import EventActivity from "../components/EventActivity";
import { Change, ErrorState, Skeleton } from "../components/ui";
import { dateTime, pct, shortDate, volume } from "../lib/format";
import NotFoundPage from "./NotFoundPage";

function ChartSection({ event }: { event: EventDetail }) {
  const [range, setRange] = useState<Range>("1w");
  const { series, isLoading } = useChartSeries(event, range);
  const single = event.markets.length === 1;
  const m0 = event.markets[0];

  return (
    <section>
      {single && m0 ? (
        <div className="mb-2 flex items-baseline gap-3">
          <span className="tnum text-3xl font-bold tracking-tight text-yes-strong">{pct(m0.yesPrice)} chance</span>
          <Change value={m0.change24h} suffix="%" className="text-sm" />
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => {
            const m = event.markets.find((x) => x.ticker === s.key);
            return (
              <span key={s.key} className="flex items-center gap-1.5 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                <span className="max-w-44 truncate text-ink-2">{s.name}</span>
                <span className="tnum font-semibold text-ink">{m ? pct(m.yesPrice) : ""}</span>
              </span>
            );
          })}
        </div>
      )}
      {isLoading && series.length === 0 ? <Skeleton className="h-[300px] w-full" /> : <PriceChart series={series} range={range} height={300} />}
      <div className="mt-2 flex items-center justify-between">
        <span className="tnum text-xs text-muted">{volume(event.volume)} vol</span>
        <RangeTabs value={range} onChange={setRange} />
      </div>
    </section>
  );
}

function RulesSection({ event }: { event: EventDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-line bg-card shadow-card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-3.5 text-left"
      >
        <FileText className="size-4 text-muted" />
        <span className="flex-1 text-[15px] font-semibold text-ink">Rules summary</span>
        <ChevronDown className={clsx("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <div className="px-4 pb-4">
        <p className={clsx("whitespace-pre-wrap text-sm leading-relaxed text-ink-2", !open && "line-clamp-2")}>
          {event.description || "No description provided."}
        </p>
        {open && (
          <div className="mt-4 animate-fade-in space-y-3 border-t border-line-2 pt-4 text-sm">
            <div>
              <h4 className="mb-1 font-semibold">Resolution rules</h4>
              <p className="whitespace-pre-wrap leading-relaxed text-ink-2">{event.rules || "—"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-muted">Closes</dt>
                <dd className="font-medium">{dateTime(event.closeTime)}</dd>
              </div>
              <div>
                <dt className="text-muted">Opened</dt>
                <dd className="font-medium">{dateTime(event.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">Payout</dt>
                <dd className="font-medium">$1 per winning contract</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

function DiscussionTabs({ event }: { event: EventDetail }) {
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  return (
    <section>
      <div className="mb-4 flex gap-5 border-b border-line">
        {(
          [
            ["comments", `Comments (${event.commentCount})`],
            ["activity", "Activity"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              "-mb-px border-b-2 pb-2.5 text-[15px] font-semibold transition-colors",
              tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "comments" ? <Comments slug={event.slug} /> : <EventActivity event={event} />}
    </section>
  );
}

function EventSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-4">
          <Skeleton className="size-16 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="hidden h-[480px] w-full lg:block" />
    </div>
  );
}

export default function EventPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const event = useEvent(slug);
  const [sheetOpen, setSheetOpen] = useState(false);

  const ev = event.data;
  const paramTicker = params.get("market");
  const paramSide = params.get("side");
  const side: Side = paramSide === "no" ? "no" : "yes";
  const market =
    ev?.markets.find((m) => m.ticker === paramTicker) ??
    ev?.markets.find((m) => m.status === "open") ??
    ev?.markets[0] ??
    null;

  // Deep link with a side (from a card's Yes/No pill) opens the sheet on mobile.
  useEffect(() => {
    if (paramSide && window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ev) document.title = `${ev.title} | Pilani Predict`;
    return () => {
      document.title = "Pilani Predict";
    };
  }, [ev]);

  const select = (ticker: string, s: Side, openSheet = true) => {
    const next = new URLSearchParams(params);
    next.set("market", ticker);
    next.set("side", s);
    setParams(next, { replace: true });
    if (openSheet && window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
  };

  if (event.isLoading) return <EventSkeleton />;
  if (event.error instanceof ApiError && event.error.status === 404) return <NotFoundPage what="market" />;
  if (event.isError || !ev) return <ErrorState error={event.error} onRetry={() => event.refetch()} />;

  const allSettled = ev.markets.every((m) => m.status === "settled");
  const ticket = market && (
    <TradeTicket
      event={ev}
      market={market}
      side={side}
      onSideChange={(s) => select(market.ticker, s, false)}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-7">
        <header>
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-muted">
            <Link to="/" className="transition-colors hover:text-ink">Markets</Link>
            <ChevronRight className="size-3.5" />
            <Link to={`/?category=${encodeURIComponent(ev.category)}`} className="hover:text-ink">
              {ev.category}
            </Link>
          </nav>
          <div className="flex items-start gap-4">
            <EventIcon slug={ev.slug} icon={ev.icon} imageUrl={ev.imageUrl} category={ev.category} size={64} className="rounded-xl" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[28px]">{ev.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {ev.closeTime > Date.now() ? `Closes ${shortDate(ev.closeTime)}` : `Closed ${shortDate(ev.closeTime)}`}
                </span>
                <span className="tnum">{volume(ev.volume)} vol</span>
                {allSettled && <span className="rounded-md bg-surface px-2 py-0.5 font-medium text-ink-2">Settled</span>}
              </div>
            </div>
          </div>
        </header>

        <ChartSection event={ev} />

        <OutcomesTable
          event={ev}
          selectedTicker={market?.ticker ?? null}
          selectedSide={side}
          onSelect={(t, s) => select(t, s)}
        />

        <RulesSection event={ev} />

        <DiscussionTabs event={ev} />
      </div>

      {/* Desktop: sticky ticket */}
      <aside className="hidden lg:block">
        <div className="sticky top-[124px] space-y-4">
          {ticket}
          {market && <PositionAndOrders market={market} />}
        </div>
      </aside>

      {/* Mobile: bottom bar + sheet */}
      {market && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 lg:hidden">
          <div className="flex gap-2">
            <button
              onClick={() => select(market.ticker, "yes")}
              disabled={market.status !== "open"}
              className="tnum flex-1 rounded-lg bg-yes py-3 text-[15px] font-semibold text-white transition-colors active:bg-yes-strong disabled:opacity-50"
            >
              Yes {market.yesAsk ?? market.yesPrice}¢
            </button>
            <button
              onClick={() => select(market.ticker, "no")}
              disabled={market.status !== "open"}
              className="tnum flex-1 rounded-lg bg-no py-3 text-[15px] font-semibold text-white transition-colors active:bg-no-strong disabled:opacity-50"
            >
              No {market.yesBid !== null ? 100 - market.yesBid : market.noPrice}¢
            </button>
          </div>
        </div>
      )}
      {sheetOpen && market && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Trade">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] animate-slide-up space-y-3 overflow-y-auto rounded-t-2xl border-t border-line bg-bg p-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto h-1 w-10 rounded-full bg-line-strong" />
            <TradeTicket
              event={ev}
              market={market}
              side={side}
              onSideChange={(s) => select(market.ticker, s, false)}
              onClose={() => setSheetOpen(false)}
            />
            <PositionAndOrders market={market} />
          </div>
        </div>
      )}
      <div className="h-16 lg:hidden" aria-hidden />
    </div>
  );
}
