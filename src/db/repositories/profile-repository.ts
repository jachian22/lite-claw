import type { Sql } from "postgres";

import { getEnv } from "../../config/env.js";
import { getSql } from "../postgres.js";

interface ProfileTimezoneRow {
  timezone: string;
}

export class ProfileRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async upsertInitialProfile(tx: Sql, telegramId: string): Promise<void> {
    const env = getEnv();
    await tx`
      INSERT INTO user_profiles (telegram_id, default_model)
      VALUES (${telegramId}, ${env.DEFAULT_MODEL})
      ON CONFLICT (telegram_id) DO NOTHING
    `;
  }

  async getTimezone(telegramId: string): Promise<string | null> {
    const rows = await this.sql<ProfileTimezoneRow[]>`
      SELECT timezone
      FROM user_profiles
      WHERE telegram_id = ${telegramId}
      LIMIT 1
    `;

    return rows[0]?.timezone ?? null;
  }
}
