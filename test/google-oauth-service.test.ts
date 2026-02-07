import { describe, expect, test } from "vitest";
import type { Redis } from "@upstash/redis";

import type { AppEnv } from "../src/config/env.js";
import { GoogleOAuthService } from "../src/services/google-oauth-service.js";

class FakeRedis {
  private readonly data = new Map<string, unknown>();

  async set(key: string, value: unknown): Promise<string> {
    this.data.set(key, value);
    return "OK";
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.data.delete(key);
    return existed ? 1 : 0;
  }
}

function buildEnv(): AppEnv {
  return {
    NODE_ENV: "test",
    TELEGRAM_BOT_TOKEN: "token",
    OPENROUTER_API_KEY: "or-key",
    OWNER_CLAIM_CODE: "super-secret-code",
    OWNER_CLAIM_PEPPER: "pepper-pepper-pepper",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/liteclaw",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "redis-token",
    DEFAULT_MODEL: "anthropic/claude-3.5-haiku",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    PUBLIC_BASE_URL: "https://liteclaw.example.com",
    OAUTH_HTTP_PORT: 3000,
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "https://liteclaw.example.com/oauth/google/callback",
    OAUTH_CONNECT_ATTEMPT_WINDOW_SECONDS: 300,
    OAUTH_CONNECT_ATTEMPT_MAX: 10,
    OPENWEATHER_API_KEY: "weather-key",
    DEFAULT_WEATHER_LOCATION: "San Francisco, CA",
    GOOGLE_CALENDAR_ACCESS_TOKEN: undefined,
    GOOGLE_CALENDAR_ID: "primary",
    GMAIL_ACCESS_TOKEN: undefined,
    HEARTBEAT_JOB_TYPE: undefined,
    HEARTBEAT_MAX_EMAILS: 5,
    POLL_TIMEOUT_SECONDS: 30,
    POLL_RETRY_MS: 1000,
    CONFIRMATION_TTL_SECONDS: 300,
    CONVERSATION_WINDOW_SIZE: 20,
    CLAIM_ATTEMPT_WINDOW_SECONDS: 300,
    CLAIM_ATTEMPT_MAX: 5
  };
}

describe("GoogleOAuthService", () => {
  test("generates auth url and enforces one-time callback state", async () => {
    const redis = new FakeRedis();
    const store = new Map<string, Record<string, unknown>>();

    const repo = {
      get: async (_userId: string, kind: string) => {
        const config = store.get(kind);
        return config ? { integrationType: kind, provider: "google", config } : null;
      },
      upsert: async (_userId: string, kind: string, _provider: string, config: Record<string, unknown>) => {
        store.set(kind, config);
      }
    };

    const fetcher = async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const body =
        init?.body instanceof URLSearchParams
          ? init.body.toString()
          : typeof init?.body === "string"
            ? init.body
            : "";
      if (body.includes("grant_type=authorization_code")) {
        return new Response(
          JSON.stringify({
            access_token: "access-one",
            refresh_token: "refresh-one",
            expires_in: 0,
            token_type: "Bearer"
          }),
          { status: 200 }
        );
      }

      if (body.includes("grant_type=refresh_token")) {
        return new Response(JSON.stringify({ access_token: "access-two", expires_in: 3600 }), {
          status: 200
        });
      }

      const inputUrl =
        typeof _input === "string"
          ? _input
          : _input instanceof URL
            ? _input.toString()
            : "";

      if (inputUrl.includes("/revoke")) {
        return new Response("", { status: 200 });
      }

      return new Response("", { status: 400 });
    };

    const service = new GoogleOAuthService(repo, redis as unknown as Redis, buildEnv(), fetcher);

    const connectUrl = await service.createConnectUrl("user-1", "calendar");
    const state = new URL(connectUrl).searchParams.get("state");
    expect(state).toBeTruthy();

    const authUrl = await service.buildAuthUrlForState(state ?? "");
    expect(authUrl).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(authUrl).toContain("code_challenge_method=S256");

    await service.handleOAuthCallback(state ?? "", "auth-code");

    const stored = store.get("calendar") ?? {};
    expect(typeof stored.tokenEncrypted).toBe("string");
    expect(stored.token).toBeUndefined();

    await expect(service.handleOAuthCallback(state ?? "", "auth-code")).rejects.toThrow();

    const refreshed = await service.getValidAccessToken("user-1", "calendar");
    expect(refreshed).toBe("access-two");

    await expect(service.revokeIntegrationTokens("user-1", "calendar")).resolves.toBeUndefined();
  });
});
