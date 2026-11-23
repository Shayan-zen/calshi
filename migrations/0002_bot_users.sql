-- System bot accounts that provide liquidity (market maker) and background flow.
-- Created here so a fresh production DB works without running the demo seed.
INSERT OR IGNORE INTO users (id, email, name, avatar_url, balance, volume, is_bot, is_admin, created_at) VALUES
  ('bot-mm', 'bot@system', 'Market Maker', NULL, 1000000000, 0, 1, 0, 0),
  ('bot-flow', 'flow@system', 'Flow Trader', NULL, 1000000000, 0, 1, 0, 0);
INSERT OR IGNORE INTO meta (key, value) VALUES ('bot_last_run', '0');
