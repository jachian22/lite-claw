CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_owner_type_provider_idx
  ON integration_connections (owner_telegram_id, integration_type, provider);
