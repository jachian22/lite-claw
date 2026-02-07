import { describe, expect, test } from "vitest";

import { HeartbeatConfigService } from "../src/services/heartbeat-config-service.js";

describe("HeartbeatConfigService", () => {
  test("enables morning heartbeat", async () => {
    const jobs = new Map<string, { enabled: boolean; scheduleCron: string; timezone: string; config: Record<string, unknown> }>();

    const repo = {
      list: async () =>
        Array.from(jobs.entries()).map(([jobType, job]) => ({
          jobType: jobType as "morning_briefing" | "weekly_review",
          ...job
        })),
      upsert: async (
        _userId: string,
        job: {
          jobType: "morning_briefing" | "weekly_review";
          scheduleCron: string;
          timezone: string;
          enabled: boolean;
          config: Record<string, unknown>;
        }
      ) => {
        jobs.set(job.jobType, {
          enabled: job.enabled,
          scheduleCron: job.scheduleCron,
          timezone: job.timezone,
          config: job.config
        });
      }
    };

    const service = new HeartbeatConfigService(repo, {
      getTimezone: async () => "America/Los_Angeles"
    });
    const response = await service.handleCommand("1", "/heartbeats morning on");

    expect(response).toContain("enabled");
    expect(jobs.get("morning_briefing")?.enabled).toBe(true);
    expect(jobs.get("morning_briefing")?.timezone).toBe("America/Los_Angeles");
  });
});
