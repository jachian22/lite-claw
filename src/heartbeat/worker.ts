import { runMigrations } from "../db/migrations.js";
import { HeartbeatRepository, type HeartbeatType } from "../db/repositories/heartbeat-repository.js";
import { getRedis } from "../db/redis.js";
import { closeSql } from "../db/postgres.js";
import { getEnv } from "../config/env.js";
import { heartbeatSlotKey, shouldRunCronNow } from "../lib/cron-lite.js";
import { logger } from "../lib/logger.js";
import { TelegramClient } from "../telegram/telegram-client.js";
import { BriefingService } from "./briefing-service.js";

export async function runHeartbeatWorker(): Promise<void> {
  const env = getEnv();
  const jobType = env.HEARTBEAT_JOB_TYPE;
  if (!jobType) {
    throw new Error("Missing HEARTBEAT_JOB_TYPE. Use morning_briefing or weekly_review.");
  }

  await runMigrations();

  const repository = new HeartbeatRepository();
  const telegram = new TelegramClient();
  const briefings = new BriefingService();

  await runForJobType(repository, telegram, briefings, jobType);
  await closeSql();
}

async function runForJobType(
  repository: HeartbeatRepository,
  telegram: TelegramClient,
  briefings: BriefingService,
  jobType: HeartbeatType
): Promise<void> {
  const redis = getRedis();
  const now = new Date();
  const jobs = await repository.getEnabledByType(jobType);
  logger.info("Running heartbeat worker", { jobType, jobs: jobs.length });

  let sent = 0;
  let skippedNotDue = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const job of jobs) {
    const dueNow = shouldRunCronNow(job.scheduleCron, job.timezone, now);
    if (!dueNow) {
      skippedNotDue += 1;
      continue;
    }

    const dedupeKey = heartbeatSlotKey(jobType, job.ownerTelegramId, job.timezone, now);
    const reserved = await redis.set(dedupeKey, "1", { nx: true, ex: 60 * 60 * 2 });
    if (reserved !== "OK") {
      skippedDuplicate += 1;
      continue;
    }

    try {
      const message = await briefings.build(job.ownerTelegramId, jobType);
      await telegram.sendMessage(job.ownerTelegramId, message);
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error("Failed to send heartbeat", {
        userId: job.ownerTelegramId,
        jobType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info("Heartbeat worker completed", {
    jobType,
    sent,
    skippedNotDue,
    skippedDuplicate,
    failed
  });
}
