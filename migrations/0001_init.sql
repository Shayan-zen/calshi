-- Pilani Predict schema. All money is INTEGER cents; prices are integer cents 1..99.
-- CHECK constraints are the concurrency safety net: the engine computes writes from a
-- (possibly stale) read and commits them in one atomic db.batch(); any guarded write that
-- conflicts with a concurrent change violates a CHECK, rolling back the whole batch.

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  balance     INTEGER NOT NULL CHECK (balance >= 0),
  volume      INTEGER NOT NULL DEFAULT 0 CHECK (volume >= 0),
  is_bot      INTEGER NOT NULL DEFAULT 0,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE events (
  slug                TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  category            TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  rules               TEXT NOT NULL DEFAULT '',
  icon                TEXT,
  image_url           TEXT,
  close_time          INTEGER NOT NULL,
  mutually_exclusive  INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL
);
CREATE INDEX idx_events_category ON events(category);

CREATE TABLE markets (
  ticker         TEXT PRIMARY KEY,
  event_slug     TEXT NOT NULL REFERENCES events(slug),
  title          TEXT NOT NULL,
  subtitle       TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','settled')),
  result         TEXT CHECK (result IS NULL OR result IN ('yes','no')),
  last_price     INTEGER CHECK (last_price IS NULL OR (last_price BETWEEN 0 AND 100)),
  fair_price     REAL NOT NULL DEFAULT 50,
  volume         INTEGER NOT NULL DEFAULT 0 CHECK (volume >= 0),
  open_interest  INTEGER NOT NULL DEFAULT 0 CHECK (open_interest >= 0),
  close_time     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  settled_at     INTEGER,
  bot_at         INTEGER NOT NULL DEFAULT 0,   -- last time the bot requoted this market
  last_point_at  INTEGER NOT NULL DEFAULT 0    -- last price_history point (for bot-driven throttling)
);
CREATE INDEX idx_markets_event ON markets(event_slug);
CREATE INDEX idx_markets_status_close ON markets(status, close_time);

-- One book per market in YES-price terms.
--   book_side 'bid' = buy YES @ p  or sell NO @ (100-p)
--   book_side 'ask' = sell YES @ p or buy NO  @ (100-p)
-- `price` is in terms of `side`; `yes_price` is the book price.
-- Buy orders reserve price*remaining cash; sell orders reserve `remaining` shares
-- (tracked in positions.*_reserved). Cancel sets remaining = 0.
CREATE TABLE orders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  ticker      TEXT NOT NULL REFERENCES markets(ticker),
  side        TEXT NOT NULL CHECK (side IN ('yes','no')),
  action      TEXT NOT NULL CHECK (action IN ('buy','sell')),
  type        TEXT NOT NULL CHECK (type IN ('market','limit')),
  price       INTEGER NOT NULL CHECK (price BETWEEN 1 AND 99),
  yes_price   INTEGER NOT NULL CHECK (yes_price BETWEEN 1 AND 99),
  book_side   TEXT NOT NULL CHECK (book_side IN ('bid','ask')),
  count       INTEGER NOT NULL CHECK (count >= 1),
  remaining   INTEGER NOT NULL CHECK (remaining >= 0),
  filled      INTEGER NOT NULL DEFAULT 0 CHECK (filled >= 0),
  status      TEXT NOT NULL CHECK (status IN ('open','filled','cancelled')),
  created_at  INTEGER NOT NULL,
  CHECK (filled + remaining <= count),
  CHECK (status = 'open' OR remaining = 0)
);
CREATE INDEX idx_orders_book ON orders(ticker, status, book_side, yes_price, created_at);
CREATE INDEX idx_orders_user ON orders(user_id, status, created_at);

CREATE TABLE positions (
  user_id       TEXT NOT NULL REFERENCES users(id),
  ticker        TEXT NOT NULL REFERENCES markets(ticker),
  yes_qty       INTEGER NOT NULL DEFAULT 0 CHECK (yes_qty >= 0),
  no_qty        INTEGER NOT NULL DEFAULT 0 CHECK (no_qty >= 0),
  yes_cost      INTEGER NOT NULL DEFAULT 0 CHECK (yes_cost >= 0),  -- total cost basis, cents
  no_cost       INTEGER NOT NULL DEFAULT 0 CHECK (no_cost >= 0),
  yes_reserved  INTEGER NOT NULL DEFAULT 0 CHECK (yes_reserved >= 0),  -- locked in resting sell orders
  no_reserved   INTEGER NOT NULL DEFAULT 0 CHECK (no_reserved >= 0),
  realized_pnl  INTEGER NOT NULL DEFAULT 0,
  version       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, ticker),
  CHECK (yes_reserved <= yes_qty),
  CHECK (no_reserved <= no_qty)
);
CREATE INDEX idx_positions_ticker ON positions(ticker);

CREATE TABLE settlements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  ticker      TEXT NOT NULL,
  side        TEXT NOT NULL CHECK (side IN ('yes','no')),
  qty         INTEGER NOT NULL,
  result      TEXT NOT NULL CHECK (result IN ('yes','no')),
  payout      INTEGER NOT NULL,
  pnl         INTEGER NOT NULL,
  settled_at  INTEGER NOT NULL
);
CREATE INDEX idx_settlements_user ON settlements(user_id, settled_at);

CREATE TABLE trades (
  id              TEXT PRIMARY KEY,
  ticker          TEXT NOT NULL,
  yes_price       INTEGER NOT NULL,
  qty             INTEGER NOT NULL CHECK (qty > 0),
  taker_side      TEXT NOT NULL CHECK (taker_side IN ('yes','no')),
  kind            TEXT NOT NULL,           -- transfer_yes | mint | burn | transfer_no
  taker_user_id   TEXT NOT NULL,
  maker_user_id   TEXT NOT NULL,
  taker_order_id  TEXT,
  maker_order_id  TEXT,
  both_bots       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_trades_ticker_time ON trades(ticker, created_at);
CREATE INDEX idx_trades_time ON trades(created_at);

CREATE TABLE price_history (
  ticker  TEXT NOT NULL,
  t       INTEGER NOT NULL,
  p       INTEGER NOT NULL
);
CREATE INDEX idx_price_history_ticker_t ON price_history(ticker, t);

CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  event_slug  TEXT NOT NULL REFERENCES events(slug),
  user_id     TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_comments_event ON comments(event_slug, created_at);

-- Never holds rows. Batches include `INSERT INTO guard (v) SELECT NULL WHERE NOT EXISTS (<expected state>)`
-- so that a stale read makes the NOT NULL constraint fail and the whole batch roll back.
CREATE TABLE guard (
  v INTEGER NOT NULL
);

CREATE TABLE meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT INTO meta (key, value) VALUES ('bot_last_run', '0');
