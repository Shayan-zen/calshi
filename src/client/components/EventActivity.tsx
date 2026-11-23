import { useQueries } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import type { EventSummary, Trade } from "../../shared/types";
import { api } from "../api";
import { qk } from "../hooks/queries";
import { TradeFeedSkeleton, TradeRow } from "./TradeFeed";
import { EmptyState } from "./ui";

/** Trades across every market in the event, newest first. */
export default function EventActivity({ event }: { event: EventSummary }) {
  const results = useQueries({
    queries: event.markets.map((m) => ({
      queryKey: qk.marketTrades(m.ticker),
      queryFn: () => api.marketTrades(m.ticker, 30),
      refetchInterval: 5_000,
    })),
  });
  const loading = results.some((r) => r.isLoading);
  const trades: Trade[] = results
    .flatMap((r) => r.data?.trades ?? [])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);

  if (loading && trades.length === 0) return <TradeFeedSkeleton />;
  if (trades.length === 0)
    return <EmptyState icon={<Activity className="size-5" />} title="No trades yet" body="Trades on this event show up here as they happen." className="py-8" />;
  return (
    <div className="divide-y divide-line-2">
      {trades.map((t) => (
        <TradeRow key={t.id} trade={t} showEvent={event.markets.length > 1} />
      ))}
    </div>
  );
}
