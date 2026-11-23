/**
 * API CONTRACT — single source of truth shared by the Worker (src/worker) and the client (src/client).
 * All money is integer CENTS. All prices are integer cents 1..99 (a contract pays 100¢ if it wins).
 * Timestamps are unix milliseconds (number). All endpoints are under /api and return JSON.
 * Errors: non-2xx with body { error: string }.
 * Auth: HttpOnly cookie "sid". Browsing is public; trading/commenting/portfolio require login (401 otherwise).
 */

export type Side = "yes" | "no";
export type Action = "buy" | "sell";
export type OrderType = "market" | "limit";
export type MarketStatus = "open" | "closed" | "settled";
export type OrderStatus = "open" | "filled" | "cancelled";
export type Range = "1d" | "1w" | "1m" | "all";
export type SortKey = "trending" | "new" | "closing" | "volume";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  balance: number; // cents, available (not locked in open buy orders)
  createdAt: number;
}

export interface MarketSummary {
  ticker: string; // e.g. "APOGEE27-HEADLINER-ARIJIT"
  eventSlug: string;
  title: string; // outcome label, e.g. "Arijit Singh" (or the event question for single-market events)
  subtitle: string | null;
  status: MarketStatus;
  result: Side | null; // set when settled
  yesPrice: number; // "chance" in cents: last trade price, falling back to mid of best bid/ask, then 50
  yesBid: number | null; // best bid for YES (cents)
  yesAsk: number | null; // best ask for YES (cents) == 100 - best NO bid
  noPrice: number; // 100 - yesPrice
  change24h: number; // yesPrice now minus yesPrice 24h ago (cents, can be negative)
  volume: number; // total contracts traded, all time
  volume24h: number;
  openInterest: number; // outstanding YES contracts
  closeTime: number;
}

export interface EventSummary {
  slug: string;
  title: string; // question, e.g. "Who will headline APOGEE 2027?"
  category: string; // e.g. "Politics", "Sports", "Campus", "Crypto", "Economics", "Culture", "Tech", "Climate"
  imageUrl: string | null; // optional; client renders a generated gradient/emoji tile when null
  icon: string | null; // single emoji fallback icon
  closeTime: number;
  mutuallyExclusive: boolean; // true for multi-outcome "who will win" events
  volume: number; // sum over markets
  markets: MarketSummary[]; // sorted by yesPrice desc
  commentCount: number;
}

export interface EventDetail extends EventSummary {
  description: string;
  rules: string; // resolution rules text
  createdAt: number;
}

export interface OrderbookLevel {
  price: number; // cents
  qty: number; // contracts
}

/** Kalshi-style book: both sides expressed as BIDS. A YES bid at p is equivalent to a NO ask at 100-p. */
export interface Orderbook {
  ticker: string;
  yes: OrderbookLevel[]; // bids to buy YES, sorted price desc
  no: OrderbookLevel[]; // bids to buy NO, sorted price desc
}

export interface PricePoint {
  t: number; // ms
  p: number; // yes price cents
}

export interface Trade {
  id: string;
  ticker: string;
  marketTitle: string;
  eventSlug: string;
  eventTitle: string;
  yesPrice: number; // execution price in YES terms
  qty: number;
  takerSide: Side; // the side the taker bought/was long after the trade ("yes" means taker bought YES or sold NO)
  takerName: string | null; // display name; null for anonymous/bot ("Market Maker")
  createdAt: number;
}

export interface Order {
  id: string;
  ticker: string;
  marketTitle: string;
  eventSlug: string;
  eventTitle: string;
  side: Side;
  action: Action;
  type: OrderType;
  price: number; // limit price in terms of `side` (cents)
  count: number; // original quantity
  remaining: number;
  filled: number;
  status: OrderStatus;
  createdAt: number;
}

export interface Fill {
  price: number; // in terms of the order's side
  qty: number;
}

export interface PlaceOrderRequest {
  ticker: string;
  side: Side;
  action: Action;
  type: OrderType; // market = immediate-or-cancel sweep (buy limit 99 / sell limit 1); limit = good-til-cancelled
  count: number; // integer >= 1, <= 100000
  price?: number; // required for limit, 1..99, in terms of `side`
}

export interface PlaceOrderResponse {
  order: Order;
  fills: Fill[];
  avgPrice: number | null; // volume-weighted fill price in terms of side
  balance: number; // user's new balance (cents)
}

export interface Position {
  ticker: string;
  marketTitle: string;
  eventSlug: string;
  eventTitle: string;
  marketStatus: MarketStatus;
  result: Side | null;
  side: Side; // the side held (a user never holds both: YES+NO pairs auto-redeem for 100¢)
  qty: number; // contracts held (includes ones locked in resting sell orders)
  avgPrice: number; // average cost per contract, cents (may be fractional)
  markPrice: number; // current price of the held side, cents
  value: number; // qty * markPrice, cents
  costBasis: number; // qty * avgPrice, cents
  pnl: number; // value - costBasis
}

export interface Portfolio {
  balance: number; // cash available
  lockedInOrders: number; // cash reserved by open buy orders
  positionsValue: number;
  totalValue: number; // balance + lockedInOrders + positionsValue
  allTimePnl: number; // totalValue - STARTING_BALANCE
  positions: Position[]; // only qty > 0, settled positions excluded
  settled: Array<{ ticker: string; marketTitle: string; eventSlug: string; eventTitle: string; side: Side; qty: number; result: Side; payout: number; pnl: number; settledAt: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  pnl: number; // cents (mark-to-market total value - starting balance)
  volume: number; // contracts traded
}

export interface Comment {
  id: string;
  eventSlug: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  body: string; // plain text, <= 2000 chars
  createdAt: number;
  canDelete: boolean; // author or admin
}

export interface Category {
  name: string;
  count: number; // open events
}

export interface CreateEventRequest {
  title: string;
  category: string;
  description: string;
  rules: string;
  icon?: string | null;
  imageUrl?: string | null;
  closeTime: number;
  mutuallyExclusive: boolean;
  markets: Array<{ title: string; subtitle?: string | null; initialPrice: number /* 1..99, bot quotes around it */ }>;
}

/** GET/POST/DELETE /api/admin/admins -> { admins: AdminEntry[] }. "owner" = from ADMIN_EMAILS secret (not removable). */
export interface AdminEntry {
  email: string;
  name: string | null; // null if they haven't signed in yet
  source: "owner" | "added";
  addedBy: string | null;
  createdAt: number | null;
}

export const STARTING_BALANCE = 100_000; // $1,000.00 play money

/**
 * ENDPOINTS
 *
 * Auth
 *   GET  /api/me                                   -> { user: User | null }
 *   GET  /api/auth/google?redirect=/path            -> 302 to Google (hd=pilani.bits-pilani.ac.in)
 *   GET  /api/auth/google/callback                  -> sets cookie, 302 to redirect (or /?auth_error=domain|failed)
 *   POST /api/auth/logout                           -> { ok: true }
 *   POST /api/auth/dev-login { email, name? }       -> { user }   (404 unless env DEV_LOGIN === "true"; same domain check)
 *
 * Browse (public)
 *   GET /api/categories                             -> Category[]
 *   GET /api/events?category=&q=&sort=&status=open|closed|settled|all&limit=&offset=  -> { events: EventSummary[], total: number }
 *   GET /api/events/:slug                           -> EventDetail
 *   GET /api/events/:slug/history?range=            -> { series: Array<{ ticker: string; title: string; points: PricePoint[] }> }
 *   GET /api/markets/:ticker                        -> { market: MarketSummary; event: EventSummary }
 *   GET /api/markets/:ticker/orderbook              -> Orderbook (top 10 levels each side)
 *   GET /api/markets/:ticker/history?range=         -> { points: PricePoint[] }
 *   GET /api/markets/:ticker/trades?limit=50        -> { trades: Trade[] }
 *   GET /api/activity?limit=30                      -> { trades: Trade[] }  (site-wide recent trades, excludes bot-vs-bot)
 *   GET /api/leaderboard?limit=50                   -> { entries: LeaderboardEntry[] }  (excludes bot)
 *   GET /api/events/:slug/comments                  -> { comments: Comment[] } newest first
 *
 * Authenticated
 *   POST   /api/orders PlaceOrderRequest            -> PlaceOrderResponse
 *   GET    /api/orders?status=open|all&ticker=      -> { orders: Order[] }
 *   DELETE /api/orders/:id                          -> { order: Order; balance: number }
 *   GET    /api/portfolio                           -> Portfolio
 *   POST   /api/events/:slug/comments { body }      -> { comment: Comment }
 *   DELETE /api/comments/:id                        -> { ok: true }
 *
 * Admin (user.isAdmin; email in env ADMIN_EMAILS, comma separated)
 *   POST  /api/admin/events CreateEventRequest      -> { event: EventDetail }
 *   POST  /api/admin/markets/:ticker/close          -> { market: MarketSummary }   (stop trading, cancel open orders + refund)
 *   POST  /api/admin/markets/:ticker/resolve { result: Side } -> { market: MarketSummary }  (settles: pays 100¢/winning contract, cancels orders)
 *   GET   /api/admin/stats                          -> { users: number; trades: number; volume: number; openMarkets: number }
 *   PATCH  /api/admin/events/:slug UpdateEventRequest       -> { event: EventDetail }  (closeTime also moves its open markets)
 *   POST   /api/admin/events/:slug/markets AddMarketRequest -> { event: EventDetail }  (adds an outcome)
 *   POST   /api/admin/events/:slug/resolve ResolveEventRequest -> { event: EventDetail }  (winner YES, every other outcome NO)
 *   DELETE /api/admin/events/:slug                          -> { ok: true }  (void: refund orders + cost basis, delete everything)
 *   GET    /api/admin/users?q=                              -> { users: AdminUser[] }
 *   POST   /api/admin/users/:id/credit CreditUserRequest    -> { user: AdminUser }
 *   GET    /api/admin/comments                              -> { comments: AdminComment[] }  (newest 100, all events)
 */

/** Every field optional; only the provided ones change. */
export interface UpdateEventRequest {
  title?: string;
  category?: string;
  description?: string;
  rules?: string;
  icon?: string | null;
  imageUrl?: string | null;
  closeTime?: number;
  mutuallyExclusive?: boolean;
}

export interface AddMarketRequest {
  title: string;
  subtitle?: string | null;
  initialPrice: number; // 1..99
}

export interface ResolveEventRequest {
  winnerTicker: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  balance: number; // cents
  totalValue: number; // balance + locked in orders + positions marked to market, cents
  volume: number; // contracts traded
  createdAt: number;
  isAdmin: boolean;
}

export interface CreditUserRequest {
  amount: number; // cents, non-zero; negative removes (balance must stay >= 0)
  reason?: string;
}

export interface AdminComment extends Comment {
  eventTitle: string;
}

export interface AdminStats {
  users: number;
  trades: number;
  volume: number;
  openMarkets: number;
}
