import type { Redis } from "@upstash/redis";

import { getRedis } from "../db/redis.js";

export class UpdateDedupeService {
  constructor(private readonly redis: Redis = getRedis()) {}

  async shouldProcess(updateId: number): Promise<boolean> {
    const key = `telegram:update:${updateId}`;
    const result = await this.redis.set(key, "1", { ex: 60 * 60 * 24, nx: true });
    return result === "OK";
  }
}
