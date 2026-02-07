import { getEnv } from "../config/env.js";
import type { IntegrationConnection } from "../db/repositories/integration-repository.js";
import { IntegrationRepository } from "../db/repositories/integration-repository.js";
import { getRedis } from "../db/redis.js";
import { GoogleOAuthService } from "./google-oauth-service.js";
import { RateLimitService } from "./rate-limit-service.js";

type IntegrationType = "weather" | "calendar" | "gmail";

interface IntegrationRepoLike {
  list(ownerTelegramId: string): Promise<IntegrationConnection[]>;
  get(ownerTelegramId: string, integrationType: string): Promise<IntegrationConnection | null>;
  upsert(
    ownerTelegramId: string,
    integrationType: string,
    provider: string,
    config: Record<string, unknown>
  ): Promise<void>;
}

interface GoogleOAuthLike {
  isConfigured(): boolean;
  createConnectUrl(userId: string, kind: "calendar" | "gmail"): Promise<string>;
  revokeIntegrationTokens(userId: string, kind: "calendar" | "gmail"): Promise<void>;
}

interface RateLimiterLike {
  isAllowed(key: string, maxAttempts: number, windowSeconds: number): Promise<boolean>;
}

export class IntegrationService {
  private readonly env = getEnv();

  constructor(
    private readonly repo: IntegrationRepoLike = new IntegrationRepository(),
    private readonly oauth: GoogleOAuthLike = new GoogleOAuthService(),
    private readonly rateLimiter: RateLimiterLike = new RateLimitService(getRedis())
  ) {}

  async handleCommand(userId: string, text: string): Promise<string> {
    const parts = text.trim().split(/\s+/);

    if (parts.length === 1) {
      return this.formatStatus(userId);
    }

    const subcommand = parts[1]?.toLowerCase();
    if (!subcommand) {
      return this.helpText();
    }

    if (subcommand === "weather") {
      const location = parts.slice(2).join(" ").trim();
      if (!location) {
        return "Usage: /integrations weather <location>";
      }

      await this.repo.upsert(userId, "weather", "openweather", { location });
      return `Weather integration configured for: ${location}`;
    }

    if (subcommand === "calendar") {
      if (parts.length === 2) {
        return "Usage: /integrations calendar <calendarId> (example: primary)";
      }

      const calendarId = parts.slice(2).join(" ").trim();
      if (!calendarId) {
        return "Usage: /integrations calendar <calendarId> (example: primary)";
      }

      await this.repo.upsert(userId, "calendar", "google", { calendarId });
      return `Google Calendar integration enabled (calendar: ${calendarId}).`;
    }

    if (subcommand === "gmail") {
      const existing = await this.repo.get(userId, "gmail");
      if (!hasOAuthToken(existing?.config)) {
        return "Gmail is not connected yet. Use: /integrations connect gmail";
      }

      await this.repo.upsert(userId, "gmail", "google", {
        ...(existing?.config ?? {}),
        enabled: true
      });
      return "Gmail integration enabled.";
    }

    if (subcommand === "connect") {
      const target = parts[2]?.toLowerCase();
      if (target !== "calendar" && target !== "gmail") {
        return "Usage: /integrations connect <calendar|gmail>";
      }

      const allowed = await this.rateLimiter.isAllowed(
        `oauth:connect:${userId}`,
        this.env.OAUTH_CONNECT_ATTEMPT_MAX,
        this.env.OAUTH_CONNECT_ATTEMPT_WINDOW_SECONDS
      );
      if (!allowed) {
        return "Too many connect attempts. Try again later.";
      }

      if (!this.oauth.isConfigured()) {
        return "OAuth is not configured on this deployment. Set Google OAuth + TOKEN_ENCRYPTION_KEY env vars first.";
      }

      const url = await this.oauth.createConnectUrl(userId, target);
      return `Connect Google ${target}:\n${url}`;
    }

    if (subcommand === "disconnect") {
      const target = parts[2]?.toLowerCase();
      if (target !== "calendar" && target !== "gmail") {
        return "Usage: /integrations disconnect <calendar|gmail>";
      }

      const existing = await this.repo.get(userId, target);
      if (!existing) {
        return `Google ${target} is already disconnected.`;
      }

      try {
        await this.oauth.revokeIntegrationTokens(userId, target);
      } catch {
        // Continue local disconnect even if revoke endpoint fails.
      }

      await this.repo.upsert(userId, target, "google", stripOAuthSecretFields({
        ...existing.config,
        enabled: false
      }));

      return `Google ${target} disconnected.`;
    }

    if (subcommand === "disable") {
      const type = parts[2]?.toLowerCase() as IntegrationType | undefined;
      if (!type || !["weather", "calendar", "gmail"].includes(type)) {
        return "Usage: /integrations disable <weather|calendar|gmail>";
      }

      await this.repo.upsert(userId, type, type === "weather" ? "openweather" : "google", { enabled: false });
      return `Disabled ${type} integration.`;
    }

    return this.helpText();
  }

  async getWeatherLocation(userId: string): Promise<string> {
    const env = getEnv();
    const integration = await this.repo.get(userId, "weather");
    const fromConfig = integration?.config.location;
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      return fromConfig;
    }

    return env.DEFAULT_WEATHER_LOCATION;
  }

  async getCalendarId(userId: string): Promise<string> {
    const env = getEnv();
    const integration = await this.repo.get(userId, "calendar");
    const fromConfig = integration?.config.calendarId;
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      return fromConfig;
    }

    return env.GOOGLE_CALENDAR_ID;
  }

  async isGmailEnabled(userId: string): Promise<boolean> {
    const integration = await this.repo.get(userId, "gmail");
    if (!integration) {
      return false;
    }

    const enabled = integration.config.enabled;
    return enabled !== false;
  }

  private async formatStatus(userId: string): Promise<string> {
    const env = getEnv();
    const all = await this.repo.list(userId);

    const weather = all.find((item) => item.integrationType === "weather");
    const calendar = all.find((item) => item.integrationType === "calendar");
    const gmail = all.find((item) => item.integrationType === "gmail");

    const weatherLocation = (weather?.config.location as string | undefined) ?? env.DEFAULT_WEATHER_LOCATION;
    const calendarId = (calendar?.config.calendarId as string | undefined) ?? env.GOOGLE_CALENDAR_ID;
    const calendarConnected = hasOAuthToken(calendar?.config) || Boolean(env.GOOGLE_CALENDAR_ACCESS_TOKEN);
    const gmailConnected = hasOAuthToken(gmail?.config) || Boolean(env.GMAIL_ACCESS_TOKEN);
    const gmailEnabled = gmail ? gmail.config.enabled !== false : gmailConnected;

    const statusLines = [
      "Integrations:",
      `- Weather: ${env.OPENWEATHER_API_KEY ? `configured (${weatherLocation})` : "missing OPENWEATHER_API_KEY"}`,
      `- Google Calendar: ${calendarConnected ? `connected (${calendarId})` : "not connected (/integrations connect calendar)"}`,
      `- Gmail: ${gmailConnected ? (gmailEnabled ? "connected" : "disabled") : "not connected (/integrations connect gmail)"}`,
      "",
      "Commands:",
      "/integrations weather <location>",
      "/integrations calendar <calendarId>",
      "/integrations connect <calendar|gmail>",
      "/integrations disconnect <calendar|gmail>",
      "/integrations gmail",
      "/integrations disable <weather|calendar|gmail>"
    ];

    return statusLines.join("\n");
  }

  private helpText(): string {
    return [
      "Integration commands:",
      "/integrations",
      "/integrations weather <location>",
      "/integrations calendar <calendarId>",
      "/integrations connect <calendar|gmail>",
      "/integrations disconnect <calendar|gmail>",
      "/integrations gmail",
      "/integrations disable <weather|calendar|gmail>"
    ].join("\n");
  }
}

function hasOAuthToken(config?: Record<string, unknown>): boolean {
  if (!config) {
    return false;
  }

  if (typeof config.tokenEncrypted === "string" && config.tokenEncrypted.length > 0) {
    return true;
  }

  const token = config.token as Record<string, unknown> | undefined;
  return Boolean(token && typeof token.accessToken === "string" && token.accessToken.length > 0);
}

function stripOAuthSecretFields(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  delete next.token;
  delete next.tokenEncrypted;
  return next;
}
