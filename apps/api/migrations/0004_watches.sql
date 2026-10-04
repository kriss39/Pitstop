-- One row per (Telegram chat, agent wallet), so nobody can take over or silence another
-- chat's alerts by sending /watch for the same wallet.
CREATE TABLE IF NOT EXISTS watches (
  chat_id TEXT NOT NULL,
  address TEXT NOT NULL,
  access_key TEXT,
  token TEXT NOT NULL DEFAULT 'USDCe',
  min_balance_usd REAL NOT NULL DEFAULT 1,
  alert_state TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (chat_id, address)
);

INSERT OR IGNORE INTO watches (chat_id, address, access_key, token, min_balance_usd, alert_state)
  SELECT telegram_chat_id, address, access_key, token, min_balance_usd, alert_state FROM agents WHERE telegram_chat_id IS NOT NULL;
