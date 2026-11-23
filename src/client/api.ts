import type {
  AddMarketRequest,
  AdminComment,
  AdminStats,
  AdminUser,
  CreditUserRequest,
  ResolveEventRequest,
  UpdateEventRequest,
  Category,
  Comment,
  CreateEventRequest,
  EventDetail,
  EventSummary,
  LeaderboardEntry,
  MarketStatus,
  MarketSummary,
  Order,
  Orderbook,
  PlaceOrderRequest,
  PlaceOrderResponse,
  Portfolio,
  PricePoint,
  Range,
  Side,
  SortKey,
  Trade,
  User,
} from "../shared/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface EventsQuery {
  category?: string;
  q?: string;
  sort?: SortKey;
  status?: MarketStatus | "all";
  limit?: number;
  offset?: number;
}

export const api = {
  me: () => request<{ user: User | null }>("/me"),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  devLogin: (email: string, name?: string) =>
    request<{ user: User }>("/auth/dev-login", { method: "POST", json: { email, name: name || undefined } }),

  categories: () => request<Category[]>("/categories"),
  events: (q: EventsQuery = {}) =>
    request<{ events: EventSummary[]; total: number }>(`/events${qs({ ...q })}`),
  event: (slug: string) => request<EventDetail>(`/events/${encodeURIComponent(slug)}`),
  eventHistory: (slug: string, range: Range) =>
    request<{ series: Array<{ ticker: string; title: string; points: PricePoint[] }> }>(
      `/events/${encodeURIComponent(slug)}/history${qs({ range })}`,
    ),
  market: (ticker: string) =>
    request<{ market: MarketSummary; event: EventSummary }>(`/markets/${encodeURIComponent(ticker)}`),
  orderbook: (ticker: string) => request<Orderbook>(`/markets/${encodeURIComponent(ticker)}/orderbook`),
  marketHistory: (ticker: string, range: Range) =>
    request<{ points: PricePoint[] }>(`/markets/${encodeURIComponent(ticker)}/history${qs({ range })}`),
  marketTrades: (ticker: string, limit = 50) =>
    request<{ trades: Trade[] }>(`/markets/${encodeURIComponent(ticker)}/trades${qs({ limit })}`),
  activity: (limit = 30) => request<{ trades: Trade[] }>(`/activity${qs({ limit })}`),
  leaderboard: (limit = 50) => request<{ entries: LeaderboardEntry[] }>(`/leaderboard${qs({ limit })}`),
  comments: (slug: string) => request<{ comments: Comment[] }>(`/events/${encodeURIComponent(slug)}/comments`),

  placeOrder: (req: PlaceOrderRequest) => request<PlaceOrderResponse>("/orders", { method: "POST", json: req }),
  orders: (status: "open" | "all" = "open", ticker?: string) =>
    request<{ orders: Order[] }>(`/orders${qs({ status, ticker })}`),
  cancelOrder: (id: string) =>
    request<{ order: Order; balance: number }>(`/orders/${encodeURIComponent(id)}`, { method: "DELETE" }),
  portfolio: () => request<Portfolio>("/portfolio"),
  postComment: (slug: string, body: string) =>
    request<{ comment: Comment }>(`/events/${encodeURIComponent(slug)}/comments`, { method: "POST", json: { body } }),
  deleteComment: (id: string) => request<{ ok: true }>(`/comments/${encodeURIComponent(id)}`, { method: "DELETE" }),

  adminCreateEvent: (req: CreateEventRequest) =>
    request<{ event: EventDetail }>("/admin/events", { method: "POST", json: req }),
  adminClose: (ticker: string) =>
    request<{ market: MarketSummary }>(`/admin/markets/${encodeURIComponent(ticker)}/close`, { method: "POST" }),
  adminResolve: (ticker: string, result: Side) =>
    request<{ market: MarketSummary }>(`/admin/markets/${encodeURIComponent(ticker)}/resolve`, {
      method: "POST",
      json: { result },
    }),
  adminStats: () => request<AdminStats>("/admin/stats"),
  adminUpdateEvent: (slug: string, req: UpdateEventRequest) =>
    request<{ event: EventDetail }>(`/admin/events/${encodeURIComponent(slug)}`, { method: "PATCH", json: req }),
  adminAddMarket: (slug: string, req: AddMarketRequest) =>
    request<{ event: EventDetail }>(`/admin/events/${encodeURIComponent(slug)}/markets`, { method: "POST", json: req }),
  adminResolveEvent: (slug: string, winnerTicker: string) =>
    request<{ event: EventDetail }>(`/admin/events/${encodeURIComponent(slug)}/resolve`, {
      method: "POST",
      json: { winnerTicker } satisfies ResolveEventRequest,
    }),
  adminDeleteEvent: (slug: string) => request<{ ok: true }>(`/admin/events/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  adminUsers: (q?: string) => request<{ users: AdminUser[] }>(`/admin/users${qs({ q })}`),
  adminCredit: (id: string, req: CreditUserRequest) =>
    request<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(id)}/credit`, { method: "POST", json: req }),
  adminComments: () => request<{ comments: AdminComment[] }>("/admin/comments"),
};
