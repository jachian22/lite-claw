import { HeartbeatRepository, type HeartbeatType } from "../db/repositories/heartbeat-repository.js";
import { ProfileRepository } from "../db/repositories/profile-repository.js";

const DEFAULT_SCHEDULE: Record<HeartbeatType, string> = {
  morning_briefing: "0 7 * * *",
  weekly_review: "0 18 * * SUN"
};

const DEFAULT_TIMEZONE = "UTC";

interface HeartbeatRepoLike {
  list(ownerTelegramId: string): Promise<
    Array<{
      jobType: HeartbeatType;
      scheduleCron: string;
      timezone: string;
      enabled: boolean;
      config: Record<string, unknown>;
    }>
  >;
  upsert(
    ownerTelegramId: string,
    job: {
      jobType: HeartbeatType;
      scheduleCron: string;
      timezone: string;
      enabled: boolean;
      config: Record<string, unknown>;
    }
  ): Promise<void>;
}

interface ProfileRepoLike {
  getTimezone(telegramId: string): Promise<string | null>;
}

export class HeartbeatConfigService {
  constructor(
    private readonly repo: HeartbeatRepoLike = new HeartbeatRepository(),
    private readonly profileRepo: ProfileRepoLike = new ProfileRepository()
  ) {}

  async handleCommand(userId: string, text: string): Promise<string> {
    const parts = text.trim().split(/\s+/);

    if (parts.length === 1) {
      return this.list(userId);
    }

    const kind = parts[1]?.toLowerCase();
    const state = parts[2]?.toLowerCase();

    if (!kind || !state) {
      return this.helpText();
    }

    if (kind !== "morning" && kind !== "weekly") {
      return this.helpText();
    }

    if (state !== "on" && state !== "off") {
      return this.helpText();
    }

    const jobType: HeartbeatType = kind === "morning" ? "morning_briefing" : "weekly_review";
    const timezone = (await this.profileRepo.getTimezone(userId)) ?? DEFAULT_TIMEZONE;
    await this.repo.upsert(userId, {
      jobType,
      scheduleCron: DEFAULT_SCHEDULE[jobType],
      timezone,
      enabled: state === "on",
      config: {}
    });

    return `${kind} heartbeat ${state === "on" ? "enabled" : "disabled"}.`;
  }

  async list(userId: string): Promise<string> {
    const jobs = await this.repo.list(userId);
    const morning = jobs.find((job) => job.jobType === "morning_briefing");
    const weekly = jobs.find((job) => job.jobType === "weekly_review");

    return [
      "Heartbeats:",
      `- Morning briefing: ${morning?.enabled ? "enabled" : "disabled"} (${morning?.scheduleCron ?? DEFAULT_SCHEDULE.morning_briefing})`,
      `- Weekly review: ${weekly?.enabled ? "enabled" : "disabled"} (${weekly?.scheduleCron ?? DEFAULT_SCHEDULE.weekly_review})`,
      "",
      "Commands:",
      "/heartbeats",
      "/heartbeats morning on",
      "/heartbeats morning off",
      "/heartbeats weekly on",
      "/heartbeats weekly off"
    ].join("\n");
  }

  private helpText(): string {
    return [
      "Heartbeat commands:",
      "/heartbeats",
      "/heartbeats morning on|off",
      "/heartbeats weekly on|off"
    ].join("\n");
  }
}
