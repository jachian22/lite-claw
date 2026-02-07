import type { Redis } from "@upstash/redis";

export class RateLimitService {
  constructor(private readonly redis: Redis) {}

  async isAllowed(key: string, maxAttempts: number, windowSeconds: number): Promise<boolean> {
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    return attempts <= maxAttempts;
  }
}
