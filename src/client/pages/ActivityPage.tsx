import { Activity } from "lucide-react";
import { useActivity } from "../hooks/queries";
import { TradeFeedSkeleton, TradeRow } from "../components/TradeFeed";
import { EmptyState, ErrorState, PageTitle } from "../components/ui";

export default function ActivityPage() {
  const activity = useActivity(100);
  const trades = activity.data?.trades ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle sub="Every trade across Pilani Predict, updated every few seconds.">Live activity</PageTitle>
      <div className="rounded-xl border border-line px-4">
        {activity.isLoading ? (
          <TradeFeedSkeleton rows={10} />
        ) : activity.isError ? (
          <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
        ) : trades.length === 0 ? (
          <EmptyState icon={<Activity className="size-5" />} title="No trades yet" body="When someone trades, it shows up here." />
        ) : (
          <div className="divide-y divide-line-2">
            {trades.map((t) => (
              <TradeRow key={t.id} trade={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
