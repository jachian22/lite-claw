import type { Sql } from "postgres";

import { getSql } from "../postgres.js";

interface WhitelistRow {
  telegram_id: string;
}

export class WhitelistRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async isAllowed(telegramId: string): Promise<boolean> {
    const rows = await this.sql<WhitelistRow[]>`
      SELECT telegram_id
      FROM whitelist
      WHERE telegram_id = ${telegramId}
      LIMIT 1
    `;

    return rows.length > 0;
  }

  async add(tx: Sql, telegramId: string, addedByTelegramId: string): Promise<void> {
    await tx`
      INSERT INTO whitelist (telegram_id, added_by_telegram_id)
      VALUES (${telegramId}, ${addedByTelegramId})
      ON CONFLICT (telegram_id) DO NOTHING
    `;
  }
}
