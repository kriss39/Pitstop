-- Agents the watcher monitors. Only public Tempo addresses are stored.
CREATE TABLE IF NOT EXISTS agents (
  address TEXT PRIMARY KEY,
  name TEXT,
  min_balance_usd REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
