CREATE TABLE IF NOT EXISTS ownership_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  owner_telegram_id TEXT NOT NULL UNIQUE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_source TEXT NOT NULL DEFAULT 'claim_code',
  CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS claim_codes (
  id BIGSERIAL PRIMARY KEY,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  consumed_by_telegram_id TEXT,
  UNIQUE (code_hash)
);

CREATE TABLE IF NOT EXISTS whitelist (
  telegram_id TEXT PRIMARY KEY,
  added_by_telegram_id TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  telegram_id TEXT PRIMARY KEY,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  communication_style TEXT NOT NULL DEFAULT 'brief',
  communication_tone TEXT NOT NULL DEFAULT 'friendly',
  about TEXT,
  default_model TEXT NOT NULL DEFAULT 'anthropic/claude-3.5-haiku',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id BIGSERIAL PRIMARY KEY,
  owner_telegram_id TEXT NOT NULL REFERENCES user_profiles(telegram_id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_owner_type_provider_idx
  ON integration_connections (owner_telegram_id, integration_type, provider);

CREATE TABLE IF NOT EXISTS heartbeat_jobs (
  id BIGSERIAL PRIMARY KEY,
  owner_telegram_id TEXT NOT NULL REFERENCES user_profiles(telegram_id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_telegram_id, job_type)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_telegram_id TEXT,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
