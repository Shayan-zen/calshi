import { useMemo } from "react";
import type { EventSummary, Range } from "../../shared/types";
import { useEventHistory } from "./queries";
import { SERIES_COLORS } from "../lib/format";
import type { ChartSeries } from "../components/PriceChart";

/** Top (up to 4) outcomes by chance, each with a stable color for this event view. */
export function chartMarkets(event: EventSummary) {
  const top = [...event.markets]
    .filter((m) => m.status !== "settled" || event.markets.length === 1)
    .sort((a, b) => b.yesPrice - a.yesPrice)
    .slice(0, SERIES_COLORS.length);
  const list = top.length ? top : event.markets.slice(0, SERIES_COLORS.length);
  // Color by alphabetical ticker order among the shown set so a price swap doesn't repaint lines.
  const sortedTickers = list.map((m) => m.ticker).sort();
  return list.map((m) => ({ market: m, color: SERIES_COLORS[sortedTickers.indexOf(m.ticker)] }));
}

export function useChartSeries(event: EventSummary | undefined, range: Range) {
  const history = useEventHistory(event?.slug ?? "", range);
  const series = useMemo<ChartSeries[]>(() => {
    if (!event || !history.data) return [];
    const shown = chartMarkets(event);
    const byTicker = new Map(history.data.series.map((s) => [s.ticker, s]));
    return shown.map(({ market, color }) => {
      const pts = byTicker.get(market.ticker)?.points ?? [];
      // Make sure the latest point reflects the live price.
      const points = pts.length ? [...pts] : [{ t: Date.now() - 1000, p: market.yesPrice }];
      if (points[points.length - 1].p !== market.yesPrice) points.push({ t: Date.now(), p: market.yesPrice });
      return {
        key: market.ticker,
        name: event.markets.length === 1 ? "Yes" : market.title,
        color: event.markets.length === 1 ? "var(--series-1)" : color,
        points,
      };
    });
  }, [event, history.data]);
  return { series, isLoading: history.isLoading, error: history.error };
}
