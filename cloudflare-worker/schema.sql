CREATE TABLE IF NOT EXISTS state_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  chat_id TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  first_name TEXT,
  connected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_events (
  event_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
  ON notification_events(created_at);

-- v1.3.4: multi-recipient Telegram. Tabel lama tetap dipertahankan untuk migrasi kompatibel.
CREATE TABLE IF NOT EXISTS telegram_connections (
  chat_id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  first_name TEXT,
  connected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_connections_connected_at
  ON telegram_connections(connected_at);
