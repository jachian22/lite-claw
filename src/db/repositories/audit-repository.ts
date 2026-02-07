import type { Sql } from "postgres";

import { getSql } from "../postgres.js";
import type { AuditLogEvent } from "../types.js";

export class AuditRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async log(event: AuditLogEvent, tx?: Sql): Promise<void> {
    const executor = tx ?? this.sql;
    const metadata = event.metadata as unknown as never;
    await executor`
      INSERT INTO audit_log (actor_telegram_id, event_type, metadata)
      VALUES (${event.actorTelegramId}, ${event.eventType}, ${executor.json(metadata)})
    `;
  }
}
