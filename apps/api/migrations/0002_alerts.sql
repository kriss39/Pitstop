-- Telegram alerts: who to notify, which access key to watch, and what was already sent.
ALTER TABLE agents ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE agents ADD COLUMN access_key TEXT;
ALTER TABLE agents ADD COLUMN alert_state TEXT NOT NULL DEFAULT '{}';
