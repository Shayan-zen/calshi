import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, SearchX } from "lucide-react";
import clsx from "clsx";
import type { SortKey } from "../../shared/types";
import { useActivity, useEvents, useLeaderboard, useUser } from "../hooks/queries";
import EventCard, { EventCardSkeleton } from "../components/EventCard";
import HeroCarousel from "../components/HeroCarousel";
import { LeaderboardMini, LiveActivityCard } from "../components/Sidebar";
import { LogoMark } from "../components/Logo";
import { EmptyState, ErrorState, btn } from "../components/ui";

const SORTS: Array<[SortKey, string]> = [
  ["trending", "Trending"],
  ["volume", "Volume"],
  ["new", "Newest"],
  ["closing", "Closing soon"],
];

const STEPS: Array<[string, string]> = [
  ["Pick a question", "Campus, sports, politics: every market is a Yes or No question."],
  ["Buy Yes or No", "Prices run from 1¢ to 99¢ and track the crowd's odds."],
  ["Collect $1 if you're right", "Each winning contract pays $1 when the market resolves."],
];

/** Front page with zero markets: make it look intentional, and give admins the way in. */
function NoMarketsYet() {
  const { user } = useUser();
  return (
    <section className="rounded-2xl border border-line bg-card px-5 py-12 text-center shadow-card sm:px-10 sm:py-16">
      <LogoMark size={44} className="mx-auto" />
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">No markets yet</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
        {user?.isAdmin
          ? "Nothing is listed yet. Create the first market and it will show up here for everyone."
          : "Markets open here as soon as they're listed. Every account starts with $1,000 in play money to trade with."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {user?.isAdmin ? (
          <Link to="/admin?tab=create" className={btn.yes}>
            <Plus className="size-4" />
            Create a market
          </Link>
        ) : !user ? (
          <Link to="/login" className={btn.ink}>
            Log in to get started
          </Link>
        ) : null}
      </div>
      <ol className="mx-auto mt-10 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="rounded-xl border border-line-2 bg-surface/60 p-4">
            <div className="tnum grid size-6 place-items-center rounded-full bg-card text-xs font-bold text-ink shadow-card">{i + 1}</div>
            <div className="mt-3 text-sm font-semibold text-ink">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function HomePage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? undefined;
  const q = params.get("q") ?? undefined;
  const sortParam = params.get("sort") as SortKey | null;
  const sort: SortKey = sortParam && SORTS.some(([k]) => k === sortParam) ? sortParam : "trending";
  const isFront = !category && !q && sort === "trending";

  const events = useEvents({ category, q, sort, status: "open", limit: 60 });
  const list = events.data?.events ?? [];

  // Same query keys as the sidebar cards, so these share the cache.
  const activity = useActivity(12);
  const lb = useLeaderboard(5);
  const sidebarEmpty =
    !activity.isLoading &&
    !lb.isLoading &&
    (activity.data?.trades.length ?? 0) === 0 &&
    (lb.data?.entries.filter((e) => e.volume > 0).length ?? 0) === 0;

  const featured = useMemo(() => {
    if (!isFront) return [];
    return [...list]
      .map((e) => ({ e, v: e.markets.reduce((s, m) => s + m.volume24h, 0) }))
      .sort((a, b) => b.v - a.v || b.e.volume - a.e.volume)
      .slice(0, 5)
      .map((x) => x.e);
  }, [isFront, list]);

  const nothingListed = isFront && !events.isLoading && !events.isError && list.length === 0;
  const heading = q ? `Results for "${q}"` : category ? category : sort === "new" ? "New markets" : "All markets";

  const setSort = (s: SortKey) => {
    const next = new URLSearchParams(params);
    if (s === "trending") next.delete("sort");
    else next.set("sort", s);
    setParams(next);
  };

  const showAside = !sidebarEmpty;

  return (
    <div className={clsx("grid gap-8", showAside && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
      <div className="min-w-0 space-y-8">
        {nothingListed ? (
          <NoMarketsYet />
        ) : (
          <>
            {isFront && <HeroCarousel events={featured} loading={events.isLoading} />}

            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{heading}</h1>
                  <p className="tnum mt-0.5 h-5 text-sm text-muted">
                    {events.data && `${events.data.total} open ${events.data.total === 1 ? "market" : "markets"}`}
                  </p>
                </div>
                <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  {SORTS.map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setSort(k)}
                      aria-pressed={sort === k}
                      className={clsx(
                        "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                        sort === k ? "bg-ink text-on-ink" : "text-muted hover:bg-surface hover:text-ink",
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
                <div className="rounded-xl border border-dashed border-line-strong">
                  <EmptyState
                    icon={<SearchX className="size-5" />}
                    title={q ? "No markets match your search" : "No open markets here yet"}
                    body={q ? "Try a shorter search or browse a category." : "Check another category, or come back soon."}
                    action={
                      <Link to="/" className={btn.ghost}>
                        Browse all markets
                      </Link>
                    }
                  />
                </div>
              ) : (
                <div
                  className={clsx(
                    "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3",
                    !showAside && "xl:grid-cols-4",
                    events.isPlaceholderData && "opacity-60",
                  )}
                >
                  {list.map((ev) => (
                    <EventCard key={ev.slug} event={ev} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showAside && (
        <aside className="hidden xl:block">
          <div className="sticky top-[124px] space-y-4">
            <LiveActivityCard />
            <LeaderboardMini />
          </div>
        </aside>
      )}
    </div>
  );
}
