import { Navigate, useParams } from "react-router";
import { useMarket } from "../hooks/queries";
import { ErrorState, Skeleton } from "../components/ui";
import { ApiError } from "../api";
import NotFoundPage from "./NotFoundPage";

export default function MarketRedirect() {
  const { ticker } = useParams();
  const q = useMarket(ticker);
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage what="market" />;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <Navigate replace to={`/events/${q.data.event.slug}?market=${encodeURIComponent(q.data.market.ticker)}`} />;
}
