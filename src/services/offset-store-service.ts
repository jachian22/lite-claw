import type { Redis } from "@upstash/redis";

import { getRedis } from "../db/redis.js";

const OFFSET_KEY = "telegram:offset";

export class OffsetStoreService {
  constructor(private readonly redis: Redis = getRedis()) {}

  async getOffset(): Promise<number> {
    const value = await this.redis.get<number | string>(OFFSET_KEY);
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  async setOffset(offset: number): Promise<void> {
    await this.redis.set(OFFSET_KEY, String(offset));
  }
}
