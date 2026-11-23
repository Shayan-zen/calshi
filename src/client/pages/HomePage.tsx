import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { SearchX } from "lucide-react";
import clsx from "clsx";
import type { SortKey } from "../../shared/types";
import { useEvents } from "../hooks/queries";
import EventCard, { EventCardSkeleton } from "../components/EventCard";
import HeroCarousel from "../components/HeroCarousel";
import { LeaderboardMini, LiveActivityCard } from "../components/Sidebar";
import { EmptyState, ErrorState } from "../components/ui";

const SORTS: Array<[SortKey, string]> = [
  ["trending", "Trending"],
  ["volume", "Volume"],
  ["new", "Newest"],
  ["closing", "Closing soon"],
];

export default function HomePage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? undefined;
  const q = params.get("q") ?? undefined;
  const sortParam = params.get("sort") as SortKey | null;
  const sort: SortKey = sortParam && SORTS.some(([k]) => k === sortParam) ? sortParam : "trending";
  const isFront = !category && !q && sort === "trending";

  const events = useEvents({ category, q, sort, status: "open", limit: 60 });
  const list = events.data?.events ?? [];

  const featured = useMemo(() => {
    if (!isFront) return [];
    return [...list]
      .map((e) => ({ e, v: e.markets.reduce((s, m) => s + m.volume24h, 0) }))
      .sort((a, b) => b.v - a.v || b.e.volume - a.e.volume)
      .slice(0, 5)
      .map((x) => x.e);
  }, [isFront, list]);

  const heading = q ? `Results for "${q}"` : category ? category : sort === "new" ? "New markets" : "All markets";

  const setSort = (s: SortKey) => {
    const next = new URLSearchParams(params);
    if (s === "trending") next.delete("sort");
    else next.set("sort", s);
    setParams(next);
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-8">
        {isFront && <HeroCarousel events={featured} loading={events.isLoading} />}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h1>
              {events.data && (
                <p className="mt-0.5 text-sm text-muted">
                  {events.data.total} open {events.data.total === 1 ? "market" : "markets"}
                </p>
              )}
            </div>
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {SORTS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={clsx(
                    "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium",
                    sort === k ? "bg-ink text-white" : "text-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {events.isError ? (
            <ErrorState error={events.error} onRetry={() => events.refetch()} />
          ) : events.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-5" />}
              title={q ? "No markets match your search" : "No open markets here yet"}
              body={q ? "Try a shorter search or browse a category." : "Check another category, or come back soon."}
              action={
                <Link to="/" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-surface">
                  Browse trending
                </Link>
              }
            />
          ) : (
            <div
              className={clsx(
                "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
                events.isPlaceholderData && "opacity-60",
              )}
            >
              {list.map((ev) => (
                <EventCard key={ev.slug} event={ev} />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="hidden space-y-4 xl:block">
        <div className="sticky top-[124px] space-y-4">
          <LiveActivityCard />
          <LeaderboardMini />
        </div>
      </aside>
    </div>
  );
}
