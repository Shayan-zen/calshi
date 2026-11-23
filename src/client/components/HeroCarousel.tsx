import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { EventSummary, Range } from "../../shared/types";
import EventIcon from "./EventIcon";
import PriceChart from "./PriceChart";
import { useChartSeries } from "../hooks/useChartSeries";
import { Change, Skeleton } from "./ui";
import { closesLabel, pct, volume } from "../lib/format";
import { tradeLink } from "./EventCard";

function HeroSlide({ event }: { event: EventSummary }) {
  const range: Range = "1w";
  const { series } = useChartSeries(event, range);
  const navigate = useNavigate();
  const colorByTicker = new Map(series.map((s) => [s.key, s.color]));
  const outcomes = event.markets.slice(0, 4);
  const single = event.markets.length === 1;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] md:gap-8">
      <div className="flex min-w-0 flex-col">
        <Link to={`/events/${event.slug}`} className="flex items-start gap-3">
          <EventIcon slug={event.slug} icon={event.icon} imageUrl={event.imageUrl} category={event.category} size={52} />
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted">{event.category}</div>
            <h2 className="mt-0.5 text-xl font-bold leading-tight tracking-tight text-ink hover:underline sm:text-2xl">
              {event.title}
            </h2>
          </div>
        </Link>

        <ul className="mt-5 space-y-1">
          {outcomes.map((m) => (
            <li key={m.ticker} className="flex items-center gap-3 rounded-lg py-1.5">
              {!single && (
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorByTicker.get(m.ticker) ?? "#e7e9ee" }} />
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{single ? "Chance" : m.title}</span>
              <span className="tnum text-[17px] font-bold text-ink">{pct(m.yesPrice)}</span>
              <Change value={m.change24h} className="w-9 justify-end text-xs" />
              <div className="hidden gap-1.5 sm:flex">
                <button
                  onClick={() => navigate(tradeLink(event.slug, m.ticker, "yes"))}
                  className="rounded-md bg-yes-tint px-3 py-1.5 text-xs font-semibold text-yes-strong hover:bg-yes hover:text-white"
                >
                  Yes
                </button>
                <button
                  onClick={() => navigate(tradeLink(event.slug, m.ticker, "no"))}
                  className="rounded-md bg-no-tint px-3 py-1.5 text-xs font-semibold text-no-strong hover:bg-no hover:text-white"
                >
                  No
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex gap-4 pt-4 text-xs text-muted">
          <span className="tnum">{volume(event.volume)} vol</span>
          <span>{closesLabel(event.closeTime)}</span>
        </div>
      </div>
      <div className="min-w-0">
        <PriceChart series={series} range={range} height={280} />
      </div>
    </div>
  );
}

export default function HeroCarousel({ events, loading }: { events: EventSummary[]; loading: boolean }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = events.length;

  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % n), 9000);
    return () => window.clearInterval(t);
  }, [n, paused]);

  useEffect(() => {
    if (i >= n) setI(0);
  }, [i, n]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-line p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (n === 0) return null;
  const ev = events[Math.min(i, n - 1)];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured markets"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative rounded-2xl border border-line bg-white p-5 sm:p-6"
    >
      <HeroSlide key={ev.slug} event={ev} />
      {n > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3">
          <div className="flex gap-1.5">
            {events.map((e, k) => (
              <button
                key={e.slug}
                onClick={() => setI(k)}
                aria-label={`Show ${e.title}`}
                aria-current={k === i}
                className={clsx("h-1.5 rounded-full transition-all", k === i ? "w-6 bg-ink" : "w-1.5 bg-line hover:bg-faint")}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setI((x) => (x - 1 + n) % n)}
              aria-label="Previous"
              className="grid size-8 place-items-center rounded-full border border-line hover:bg-surface"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setI((x) => (x + 1) % n)}
              aria-label="Next"
              className="grid size-8 place-items-center rounded-full border border-line hover:bg-surface"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
