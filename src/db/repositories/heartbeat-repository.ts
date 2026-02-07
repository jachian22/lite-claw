import type { Sql } from "postgres";

import { getSql } from "../postgres.js";

export type HeartbeatType = "morning_briefing" | "weekly_review";

export interface HeartbeatJob {
  jobType: HeartbeatType;
  scheduleCron: string;
  timezone: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface HeartbeatRow {
  job_type: HeartbeatType;
  schedule_cron: string;
  timezone: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export class HeartbeatRepository {
  constructor(private readonly sql: Sql = getSql()) {}

  async list(ownerTelegramId: string): Promise<HeartbeatJob[]> {
    const rows = await this.sql<HeartbeatRow[]>`
      SELECT job_type, schedule_cron, timezone, enabled, config
      FROM heartbeat_jobs
      WHERE owner_telegram_id = ${ownerTelegramId}
      ORDER BY job_type ASC
    `;

    return rows.map((row) => ({
      jobType: row.job_type,
      scheduleCron: row.schedule_cron,
      timezone: row.timezone,
      enabled: row.enabled,
      config: row.config
    }));
  }

  async getEnabledByType(jobType: HeartbeatType): Promise<Array<HeartbeatJob & { ownerTelegramId: string }>> {
    const rows = await this.sql<Array<HeartbeatRow & { owner_telegram_id: string }>>`
      SELECT owner_telegram_id, job_type, schedule_cron, timezone, enabled, config
      FROM heartbeat_jobs
      WHERE job_type = ${jobType}
        AND enabled = TRUE
    `;

    return rows.map((row) => ({
      ownerTelegramId: row.owner_telegram_id,
      jobType: row.job_type,
      scheduleCron: row.schedule_cron,
      timezone: row.timezone,
      enabled: row.enabled,
      config: row.config
    }));
  }

  async upsert(ownerTelegramId: string, job: HeartbeatJob): Promise<void> {
    await this.sql`
      INSERT INTO heartbeat_jobs (owner_telegram_id, job_type, schedule_cron, timezone, enabled, config)
      VALUES (
        ${ownerTelegramId},
        ${job.jobType},
        ${job.scheduleCron},
        ${job.timezone},
        ${job.enabled},
        ${this.sql.json(job.config as never)}
      )
      ON CONFLICT (owner_telegram_id, job_type)
      DO UPDATE SET
        schedule_cron = EXCLUDED.schedule_cron,
        timezone = EXCLUDED.timezone,
        enabled = EXCLUDED.enabled,
        config = EXCLUDED.config,
        updated_at = NOW()
    `;
  }
}
