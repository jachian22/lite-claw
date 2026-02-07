import { describe, expect, test } from "vitest";
import type { Redis } from "@upstash/redis";
import type { Sql } from "postgres";

import type { AppEnv } from "../src/config/env.js";
import { hashSecret } from "../src/security/hash.js";
import { OwnershipService } from "../src/services/ownership-service.js";

type Tx = Sql;

class FakeRedis {
  private readonly counters = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(): Promise<number> {
    return 1;
  }
}

class FakeSql {
  private locked = false;

  async begin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    while (this.locked) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.locked = true;
    try {
      return await fn({} as Tx);
    } finally {
      this.locked = false;
    }
  }
}

interface State {
  owner: string | null;
  claimHash: string;
  consumed: boolean;
  whitelist: Set<string>;
}

function buildService(state: State): OwnershipService {
  const sql = new FakeSql() as unknown as Sql;
  const redis = new FakeRedis() as unknown as Redis;

  const ownershipRepo = {
    getOwner: async () =>
      state.owner
        ? {
            owner_telegram_id: state.owner,
            claimed_at: new Date().toISOString()
          }
        : null,
    isOwnerConfigured: async () => state.owner !== null,
    getOwnerForUpdate: async () =>
      state.owner
        ? {
            owner_telegram_id: state.owner
          }
        : null,
    createOwner: async (_tx: Tx, ownerTelegramId: string) => {
      state.owner = ownerTelegramId;
    }
  };

  const claimRepo = {
    seedIfMissing: async () => undefined,
    getActiveForUpdate: async () =>
      state.consumed
        ? null
        : {
            id: 1,
            code_hash: state.claimHash,
            consumed_at: null,
            consumed_by_telegram_id: null
          },
    consume: async () => {
      state.consumed = true;
    }
  };

  const whitelistRepo = {
    isAllowed: async (telegramId: string) => state.whitelist.has(telegramId),
    add: async (_tx: Tx, telegramId: string) => {
      state.whitelist.add(telegramId);
    }
  };

  const profileRepo = {
    upsertInitialProfile: async () => undefined
  };

  const auditRepo = {
    log: async () => undefined
  };

  const env: AppEnv = {
    NODE_ENV: "test",
    TELEGRAM_BOT_TOKEN: "token",
    OPENROUTER_API_KEY: "key",
    OWNER_CLAIM_CODE: "super-secret-code",
    OWNER_CLAIM_PEPPER: "pepper-pepper-pepper",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/liteclaw",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
    DEFAULT_MODEL: "anthropic/claude-3.5-haiku",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64url"),
    OAUTH_HTTP_PORT: 3000,
    OAUTH_CONNECT_ATTEMPT_WINDOW_SECONDS: 300,
    OAUTH_CONNECT_ATTEMPT_MAX: 10,
    DEFAULT_WEATHER_LOCATION: "San Francisco, CA",
    GOOGLE_CALENDAR_ID: "primary",
    HEARTBEAT_MAX_EMAILS: 5,
    POLL_TIMEOUT_SECONDS: 30,
    POLL_RETRY_MS: 1000,
    CONFIRMATION_TTL_SECONDS: 300,
    CONVERSATION_WINDOW_SIZE: 20,
    CLAIM_ATTEMPT_WINDOW_SECONDS: 300,
    CLAIM_ATTEMPT_MAX: 3
  };

  return new OwnershipService(
    sql,
    redis,
    ownershipRepo,
    claimRepo,
    whitelistRepo,
    profileRepo,
    auditRepo,
    env
  );
}

describe("OwnershipService", () => {
  test("claims ownership with valid code and whitelists owner", async () => {
    const state: State = {
      owner: null,
      claimHash: hashSecret("abc12345", "pepper-pepper-pepper"),
      consumed: false,
      whitelist: new Set()
    };

    const service = buildService(state);
    const result = await service.claimOwnership("111", "abc12345");

    expect(result).toEqual({ ok: true });
    expect(state.owner).toBe("111");
    expect(state.whitelist.has("111")).toBe(true);
    expect(state.consumed).toBe(true);
  });

  test("rejects invalid claim code", async () => {
    const state: State = {
      owner: null,
      claimHash: hashSecret("abc12345", "pepper-pepper-pepper"),
      consumed: false,
      whitelist: new Set()
    };

    const service = buildService(state);
    const result = await service.claimOwnership("111", "wrong-code");

    expect(result).toEqual({ ok: false, reason: "invalid_code" });
    expect(state.owner).toBeNull();
  });

  test("blocks replay after claim is complete", async () => {
    const state: State = {
      owner: null,
      claimHash: hashSecret("abc12345", "pepper-pepper-pepper"),
      consumed: false,
      whitelist: new Set()
    };

    const service = buildService(state);
    const first = await service.claimOwnership("111", "abc12345");
    const second = await service.claimOwnership("222", "abc12345");

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, reason: "already_claimed" });
    expect(state.owner).toBe("111");
  });

  test("rate-limits repeated bad attempts", async () => {
    const state: State = {
      owner: null,
      claimHash: hashSecret("abc12345", "pepper-pepper-pepper"),
      consumed: false,
      whitelist: new Set()
    };

    const service = buildService(state);

    await service.claimOwnership("111", "x1");
    await service.claimOwnership("111", "x2");
    await service.claimOwnership("111", "x3");
    const fourth = await service.claimOwnership("111", "x4");

    expect(fourth).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  test("concurrent claim race allows only one winner", async () => {
    const state: State = {
      owner: null,
      claimHash: hashSecret("abc12345", "pepper-pepper-pepper"),
      consumed: false,
      whitelist: new Set()
    };

    const service = buildService(state);

    const [a, b] = await Promise.all([
      service.claimOwnership("111", "abc12345"),
      service.claimOwnership("222", "abc12345")
    ]);

    const successes = [a, b].filter((result) => result.ok);
    const failures = [a, b].filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as { reason: string }).reason).toBe("already_claimed");
  });
});
