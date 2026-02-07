import type { Redis } from "@upstash/redis";
import type { Sql } from "postgres";

import type { AppEnv } from "../config/env.js";
import { getEnv } from "../config/env.js";
import { ClaimCodeRepository } from "../db/repositories/claim-code-repository.js";
import { AuditRepository } from "../db/repositories/audit-repository.js";
import { OwnershipRepository } from "../db/repositories/ownership-repository.js";
import { ProfileRepository } from "../db/repositories/profile-repository.js";
import { WhitelistRepository } from "../db/repositories/whitelist-repository.js";
import { getSql } from "../db/postgres.js";
import { getRedis } from "../db/redis.js";
import { hashSecret, verifySecret } from "../security/hash.js";
import { RateLimitService } from "./rate-limit-service.js";

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "too_many_attempts" | "already_claimed" | "invalid_code" | "claim_unavailable" };

interface OwnershipRepoLike {
  getOwner(): Promise<{ owner_telegram_id: string } | null>;
  isOwnerConfigured(): Promise<boolean>;
  getOwnerForUpdate(tx: Sql): Promise<{ owner_telegram_id: string } | null>;
  createOwner(tx: Sql, ownerTelegramId: string): Promise<void>;
}

interface ClaimRepoLike {
  seedIfMissing(hash: string): Promise<void>;
  getActiveForUpdate(tx: Sql): Promise<{ id: number; code_hash: string } | null>;
  consume(tx: Sql, id: number, byTelegramId: string): Promise<void>;
}

interface WhitelistRepoLike {
  isAllowed(telegramId: string): Promise<boolean>;
  add(tx: Sql, telegramId: string, addedByTelegramId: string): Promise<void>;
}

interface ProfileRepoLike {
  upsertInitialProfile(tx: Sql, telegramId: string): Promise<void>;
}

interface AuditRepoLike {
  log(
    event: {
      actorTelegramId: string | null;
      eventType: string;
      metadata: Record<string, unknown>;
    },
    tx?: Sql
  ): Promise<void>;
}

export class OwnershipService {
  private readonly env: AppEnv;
  private readonly rateLimiter: RateLimitService;

  constructor(
    private readonly sql: Sql = getSql(),
    private readonly redis: Redis = getRedis(),
    private readonly ownershipRepo: OwnershipRepoLike = new OwnershipRepository(sql),
    private readonly claimRepo: ClaimRepoLike = new ClaimCodeRepository(sql),
    private readonly whitelistRepo: WhitelistRepoLike = new WhitelistRepository(sql),
    private readonly profileRepo: ProfileRepoLike = new ProfileRepository(sql),
    private readonly auditRepo: AuditRepoLike = new AuditRepository(sql),
    env?: AppEnv
  ) {
    this.env = env ?? getEnv();
    this.rateLimiter = new RateLimitService(redis);
  }

  async bootstrapClaimCode(): Promise<void> {
    const owner = await this.ownershipRepo.getOwner();
    if (owner) {
      return;
    }

    const claimHash = hashSecret(this.env.OWNER_CLAIM_CODE, this.env.OWNER_CLAIM_PEPPER);
    await this.claimRepo.seedIfMissing(claimHash);
  }

  async isOwnerConfigured(): Promise<boolean> {
    return this.ownershipRepo.isOwnerConfigured();
  }

  async isAllowedUser(telegramId: string): Promise<boolean> {
    return this.whitelistRepo.isAllowed(telegramId);
  }

  async claimOwnership(telegramId: string, code: string): Promise<ClaimResult> {
    const allow = await this.rateLimiter.isAllowed(
      `claim:attempt:${telegramId}`,
      this.env.CLAIM_ATTEMPT_MAX,
      this.env.CLAIM_ATTEMPT_WINDOW_SECONDS
    );

    if (!allow) {
      return { ok: false, reason: "too_many_attempts" };
    }

    return this.sql.begin(async (tx) => {
      const trx = tx as unknown as Sql;
      const owner = await this.ownershipRepo.getOwnerForUpdate(trx);
      if (owner) {
        return { ok: false, reason: "already_claimed" } as const;
      }

      const claimCode = await this.claimRepo.getActiveForUpdate(trx);
      if (!claimCode) {
        return { ok: false, reason: "claim_unavailable" } as const;
      }

      if (!verifySecret(code, this.env.OWNER_CLAIM_PEPPER, claimCode.code_hash)) {
        await this.auditRepo.log(
          {
            actorTelegramId: telegramId,
            eventType: "claim_failed_invalid_code",
            metadata: { reason: "invalid_code" }
          },
          trx
        );
        return { ok: false, reason: "invalid_code" } as const;
      }

      await this.ownershipRepo.createOwner(trx, telegramId);
      await this.whitelistRepo.add(trx, telegramId, telegramId);
      await this.profileRepo.upsertInitialProfile(trx, telegramId);
      await this.claimRepo.consume(trx, claimCode.id, telegramId);
      await this.auditRepo.log(
        {
          actorTelegramId: telegramId,
          eventType: "claim_success",
          metadata: { source: "claim_code" }
        },
        trx
      );

      return { ok: true } as const;
    });
  }
}
