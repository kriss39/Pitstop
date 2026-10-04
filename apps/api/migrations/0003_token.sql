-- Token the watched access key is scoped to (limits are per token).
ALTER TABLE agents ADD COLUMN token TEXT NOT NULL DEFAULT 'USDCe';
