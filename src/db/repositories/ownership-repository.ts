import type { Sql } from "postgres";

import { getSql } from "../postgres.js";
import type { OwnerRow } from "../types.js";

export class OwnershipRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async getOwner(): Promise<OwnerRow | null> {
    const rows = await this.sql<OwnerRow[]>`
      SELECT owner_telegram_id, claimed_at::text
      FROM ownership_state
      WHERE id = 1
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async isOwnerConfigured(): Promise<boolean> {
    const owner = await this.getOwner();
    return owner !== null;
  }

  async getOwnerForUpdate(tx: Sql): Promise<{ owner_telegram_id: string } | null> {
    const rows = await tx<{ owner_telegram_id: string }[]>`
      SELECT owner_telegram_id
      FROM ownership_state
      WHERE id = 1
      LIMIT 1
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  async createOwner(tx: Sql, ownerTelegramId: string): Promise<void> {
    await tx`
      INSERT INTO ownership_state (id, owner_telegram_id)
      VALUES (1, ${ownerTelegramId})
    `;
  }
}
