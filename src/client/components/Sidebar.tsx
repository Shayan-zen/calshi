import { Link } from "react-router";
import clsx from "clsx";
import { useActivity, useLeaderboard, useUser } from "../hooks/queries";
import { TradeFeedSkeleton, TradeRow } from "./TradeFeed";
import Avatar from "./Avatar";
import { Pnl, Skeleton } from "./ui";

export function LiveActivityCard() {
  const activity = useActivity(12);
  const trades = activity.data?.trades ?? [];
  return (
    <section className="rounded-xl border border-line bg-white">
      <header className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-yes opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-yes" />
          </span>
          Live activity
        </h2>
        <Link to="/activity" className="text-xs font-medium text-muted hover:text-ink">
          See all
        </Link>
      </header>
      <div className="divide-y divide-line-2 px-4 pb-2">
        {activity.isLoading ? (
          <TradeFeedSkeleton rows={5} />
        ) : trades.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No trades yet. Be the first.</p>
        ) : (
          trades.map((t) => <TradeRow key={t.id} trade={t} dense />)
        )}
      </div>
    </section>
  );
}

export function LeaderboardMini() {
  const lb = useLeaderboard(5);
  const { user } = useUser();
  const entries = lb.data?.entries.slice(0, 5) ?? [];
  return (
    <section className="rounded-xl border border-line bg-white">
      <header className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 className="text-[15px] font-semibold">Top traders</h2>
        <Link to="/leaderboard" className="text-xs font-medium text-muted hover:text-ink">
          Leaderboard
        </Link>
      </header>
      <ol className="px-2 pb-2">
        {lb.isLoading
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="px-2 py-2">
                <Skeleton className="h-5 w-full" />
              </li>
            ))
          : entries.map((e) => (
              <li
                key={e.userId}
                className={clsx("flex items-center gap-2.5 rounded-lg px-2 py-1.5", user?.id === e.userId && "bg-yes-tint")}
              >
                <span className="tnum w-4 text-center text-xs font-semibold text-muted">{e.rank}</span>
                <Avatar name={e.name} url={e.avatarUrl} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                <Pnl cents={e.pnl} className="text-sm" />
              </li>
            ))}
        {!lb.isLoading && entries.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted">No traders yet</li>}
      </ol>
    </section>
  );
}
