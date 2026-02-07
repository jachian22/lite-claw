import { beforeEach, describe, expect, test } from "vitest";

import { resetEnvForTests } from "../src/config/env.js";
import { IntegrationService } from "../src/services/integration-service.js";

function setEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.TELEGRAM_BOT_TOKEN = "token";
  process.env.OPENROUTER_API_KEY = "or-key";
  process.env.OWNER_CLAIM_CODE = "super-secret-code";
  process.env.OWNER_CLAIM_PEPPER = "pepper-pepper-pepper";
  process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/liteclaw";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-token";
  process.env.PUBLIC_BASE_URL = "https://liteclaw.example.com";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
  process.env.DEFAULT_WEATHER_LOCATION = "San Francisco, CA";
  process.env.OPENWEATHER_API_KEY = "weather-key";
  process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "calendar-token";
  process.env.GMAIL_ACCESS_TOKEN = "gmail-token";
  process.env.GOOGLE_CALENDAR_ID = "primary";
  process.env.HEARTBEAT_MAX_EMAILS = "5";
}

describe("IntegrationService", () => {
  beforeEach(() => {
    setEnv();
    resetEnvForTests();
  });

  test("formats status and writes weather config", async () => {
    const store = new Map<string, { provider: string; config: Record<string, unknown> }>();
    const repo = {
      list: async () =>
        Array.from(store.entries()).map(([integrationType, item]) => ({
          integrationType,
          provider: item.provider,
          config: item.config
        })),
      get: async (_userId: string, integrationType: string) => {
        const item = store.get(integrationType);
        return item
          ? {
              integrationType,
              provider: item.provider,
              config: item.config
            }
          : null;
      },
      upsert: async (
        _userId: string,
        integrationType: string,
        provider: string,
        config: Record<string, unknown>
      ) => {
        store.set(integrationType, { provider, config });
      }
    };

    const oauth = {
      isConfigured: () => true,
      createConnectUrl: async (_userId: string, kind: "calendar" | "gmail") =>
        `https://liteclaw.example.com/oauth/google/start?kind=${kind}`,
      revokeIntegrationTokens: async () => undefined
    };
    const service = new IntegrationService(repo, oauth, {
      isAllowed: async () => true
    });
    const configured = await service.handleCommand("1", "/integrations weather Seattle, WA");
    const status = await service.handleCommand("1", "/integrations");

    expect(configured).toContain("Seattle, WA");
    expect(status).toContain("Seattle, WA");
  });

  test("returns oauth connect URL", async () => {
    const repo = {
      list: async () => [],
      get: async () => null,
      upsert: async () => undefined
    };

    const oauth = {
      isConfigured: () => true,
      createConnectUrl: async (_userId: string, kind: "calendar" | "gmail") =>
        `https://liteclaw.example.com/oauth/google/start?kind=${kind}`,
      revokeIntegrationTokens: async () => undefined
    };
    const service = new IntegrationService(repo, oauth, {
      isAllowed: async () => true
    });

    const response = await service.handleCommand("1", "/integrations connect calendar");
    expect(response).toContain("https://liteclaw.example.com/oauth/google/start?kind=calendar");
  });

  test("rate limits oauth connect attempts", async () => {
    const repo = {
      list: async () => [],
      get: async () => null,
      upsert: async () => undefined
    };

    const oauth = {
      isConfigured: () => true,
      createConnectUrl: async (_userId: string, kind: "calendar" | "gmail") =>
        `https://liteclaw.example.com/oauth/google/start?kind=${kind}`,
      revokeIntegrationTokens: async () => undefined
    };

    const service = new IntegrationService(repo, oauth, {
      isAllowed: async () => false
    });

    const response = await service.handleCommand("1", "/integrations connect gmail");
    expect(response).toContain("Too many connect attempts");
  });

  test("disconnect revokes token and removes stored secrets", async () => {
    const store = new Map<string, { provider: string; config: Record<string, unknown> }>();
    store.set("gmail", {
      provider: "google",
      config: {
        enabled: true,
        tokenEncrypted: "ciphertext"
      }
    });

    let revoked = false;
    const repo = {
      list: async () => [],
      get: async (_userId: string, integrationType: string) => {
        const item = store.get(integrationType);
        return item
          ? {
              integrationType,
              provider: item.provider,
              config: item.config
            }
          : null;
      },
      upsert: async (
        _userId: string,
        integrationType: string,
        provider: string,
        config: Record<string, unknown>
      ) => {
        store.set(integrationType, { provider, config });
      }
    };

    const oauth = {
      isConfigured: () => true,
      createConnectUrl: async (_userId: string, kind: "calendar" | "gmail") =>
        `https://liteclaw.example.com/oauth/google/start?kind=${kind}`,
      revokeIntegrationTokens: async () => {
        revoked = true;
      }
    };

    const service = new IntegrationService(repo, oauth, {
      isAllowed: async () => true
    });

    const response = await service.handleCommand("1", "/integrations disconnect gmail");
    const updated = store.get("gmail")?.config ?? {};

    expect(revoked).toBe(true);
    expect(response).toContain("disconnected");
    expect(updated.enabled).toBe(false);
    expect(updated.tokenEncrypted).toBeUndefined();
  });
});
