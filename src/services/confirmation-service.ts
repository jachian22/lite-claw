import { randomInt } from "node:crypto";

import type { Redis } from "@upstash/redis";

import { getEnv } from "../config/env.js";
import { getRedis } from "../db/redis.js";

export interface PendingConfirmation {
  nonce: string;
  tool: string;
  payload: Record<string, unknown>;
}

export class ConfirmationService {
  constructor(private readonly redis: Redis = getRedis()) {}

  async create(userId: string, tool: string, payload: Record<string, unknown>): Promise<PendingConfirmation> {
    const env = getEnv();
    const nonce = String(randomInt(100000, 999999));
    const key = this.keyFor(userId);

    const value: PendingConfirmation = { nonce, tool, payload };
    await this.redis.set(key, value, { ex: env.CONFIRMATION_TTL_SECONDS });
    return value;
  }

  async get(userId: string): Promise<PendingConfirmation | null> {
    const value = await this.redis.get<PendingConfirmation>(this.keyFor(userId));
    return value ?? null;
  }

  async consume(userId: string): Promise<void> {
    await this.redis.del(this.keyFor(userId));
  }

  private keyFor(userId: string): string {
    return `confirm:${userId}`;
  }
}
