import type { Sql } from "postgres";

import { getSql } from "../postgres.js";

export interface IntegrationConnection {
  integrationType: string;
  provider: string;
  config: Record<string, unknown>;
}

interface IntegrationRow {
  integration_type: string;
  provider: string;
  config: Record<string, unknown>;
}

export class IntegrationRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async list(ownerTelegramId: string): Promise<IntegrationConnection[]> {
    const rows = await this.sql<IntegrationRow[]>`
      SELECT integration_type, provider, config
      FROM integration_connections
      WHERE owner_telegram_id = ${ownerTelegramId}
      ORDER BY integration_type ASC
    `;

    return rows.map((row) => ({
      integrationType: row.integration_type,
      provider: row.provider,
      config: row.config
    }));
  }

  async get(ownerTelegramId: string, integrationType: string): Promise<IntegrationConnection | null> {
    const rows = await this.sql<IntegrationRow[]>`
      SELECT integration_type, provider, config
      FROM integration_connections
      WHERE owner_telegram_id = ${ownerTelegramId}
        AND integration_type = ${integrationType}
      ORDER BY id ASC
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      integrationType: row.integration_type,
      provider: row.provider,
      config: row.config
    };
  }

  async upsert(
    ownerTelegramId: string,
    integrationType: string,
    provider: string,
    config: Record<string, unknown>
  ): Promise<void> {
    await this.sql`
      INSERT INTO integration_connections (owner_telegram_id, integration_type, provider, config)
      VALUES (${ownerTelegramId}, ${integrationType}, ${provider}, ${this.sql.json(config as never)})
      ON CONFLICT (owner_telegram_id, integration_type, provider)
      DO UPDATE SET
        config = EXCLUDED.config,
        updated_at = NOW()
    `;
  }
}
