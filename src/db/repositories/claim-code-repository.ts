import type { Sql } from "postgres";

import { getSql } from "../postgres.js";
import type { ClaimCodeRow } from "../types.js";

export class ClaimCodeRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async seedIfMissing(hash: string): Promise<void> {
    const existing = await this.sql<ClaimCodeRow[]>`
      SELECT id, code_hash, consumed_at::text, consumed_by_telegram_id
      FROM claim_codes
      ORDER BY id ASC
      LIMIT 1
    `;

    if (existing.length > 0) {
      return;
    }

    await this.sql`
      INSERT INTO claim_codes (code_hash)
      VALUES (${hash})
    `;
  }

  async getActiveForUpdate(tx: Sql): Promise<ClaimCodeRow | null> {
    const rows = await tx<ClaimCodeRow[]>`
      SELECT id, code_hash, consumed_at::text, consumed_by_telegram_id
      FROM claim_codes
      WHERE consumed_at IS NULL
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  async consume(tx: Sql, id: number, byTelegramId: string): Promise<void> {
    await tx`
      UPDATE claim_codes
      SET consumed_at = NOW(), consumed_by_telegram_id = ${byTelegramId}
      WHERE id = ${id}
    `;
  }
}
