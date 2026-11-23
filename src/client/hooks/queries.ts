import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EventsQuery } from "../api";
import type { Range } from "../../shared/types";

export const qk = {
  me: ["me"] as const,
  categories: ["categories"] as const,
  events: (q: EventsQuery) => ["events", q] as const,
  event: (slug: string) => ["event", slug] as const,
  eventHistory: (slug: string, range: Range) => ["eventHistory", slug, range] as const,
  market: (ticker: string) => ["market", ticker] as const,
  orderbook: (ticker: string) => ["orderbook", ticker] as const,
  marketTrades: (ticker: string) => ["marketTrades", ticker] as const,
  activity: (limit: number) => ["activity", limit] as const,
  leaderboard: (limit: number) => ["leaderboard", limit] as const,
  comments: (slug: string) => ["comments", slug] as const,
  portfolio: ["portfolio"] as const,
  orders: (status: "open" | "all", ticker?: string) => ["orders", status, ticker ?? null] as const,
  adminStats: ["adminStats"] as const,
  adminUsers: (q: string) => ["adminUsers", q] as const,
  adminComments: ["adminComments"] as const,
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: api.me, staleTime: 30_000, refetchInterval: 30_000 });
}

export function useUser() {
  const q = useMe();
  return { user: q.data?.user ?? null, isLoading: q.isLoading };
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: api.categories, staleTime: 60_000 });
}

export function useEvents(q: EventsQuery, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: qk.events(q),
    queryFn: () => api.events(q),
    placeholderData: keepPreviousData,
    refetchInterval: opts.refetchInterval ?? 15_000,
    enabled: opts.enabled ?? true,
  });
}

export function useEvent(slug: string | undefined) {
  return useQuery({
    queryKey: qk.event(slug ?? ""),
    queryFn: () => api.event(slug!),
    enabled: !!slug,
    refetchInterval: 4_000,
  });
}

export function useEventHistory(slug: string, range: Range) {
  return useQuery({
    queryKey: qk.eventHistory(slug, range),
    queryFn: () => api.eventHistory(slug, range),
    placeholderData: keepPreviousData,
    refetchInterval: range === "1d" ? 10_000 : 30_000,
    enabled: !!slug,
  });
}

export function useMarket(ticker: string | undefined) {
  return useQuery({
    queryKey: qk.market(ticker ?? ""),
    queryFn: () => api.market(ticker!),
    enabled: !!ticker,
    retry: false,
  });
}

export function useOrderbook(ticker: string | undefined) {
  return useQuery({
    queryKey: qk.orderbook(ticker ?? ""),
    queryFn: () => api.orderbook(ticker!),
    enabled: !!ticker,
    refetchInterval: 3_000,
  });
}

export function useMarketTrades(ticker: string | undefined) {
  return useQuery({
    queryKey: qk.marketTrades(ticker ?? ""),
    queryFn: () => api.marketTrades(ticker!, 30),
    enabled: !!ticker,
    refetchInterval: 5_000,
  });
}

export function useActivity(limit = 30) {
  return useQuery({ queryKey: qk.activity(limit), queryFn: () => api.activity(limit), refetchInterval: 5_000 });
}

export function useLeaderboard(limit = 50) {
  return useQuery({ queryKey: qk.leaderboard(limit), queryFn: () => api.leaderboard(limit), refetchInterval: 30_000 });
}

export function useComments(slug: string) {
  return useQuery({ queryKey: qk.comments(slug), queryFn: () => api.comments(slug), refetchInterval: 15_000 });
}

export function usePortfolio(enabled = true) {
  return useQuery({ queryKey: qk.portfolio, queryFn: api.portfolio, refetchInterval: 10_000, enabled });
}

export function useOrders(status: "open" | "all", ticker?: string, enabled = true) {
  return useQuery({
    queryKey: qk.orders(status, ticker),
    queryFn: () => api.orders(status, ticker),
    refetchInterval: 5_000,
    enabled,
  });
}

/** Everything that can change after the user trades. */
export function useInvalidateTrading() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["me", "portfolio", "orderbook", "event", "events", "orders", "eventHistory", "marketTrades", "activity", "leaderboard", "market"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}
