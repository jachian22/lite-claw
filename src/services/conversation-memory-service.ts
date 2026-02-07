import type { Redis } from "@upstash/redis";

import { getEnv } from "../config/env.js";
import { getRedis } from "../db/redis.js";

interface StoredMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ConversationMemoryService {
  constructor(private readonly redis: Redis = getRedis()) {}

  async append(userId: string, role: StoredMessage["role"], content: string): Promise<void> {
    const env = getEnv();
    const key = this.keyFor(userId);
    const value = JSON.stringify({ role, content } satisfies StoredMessage);

    await this.redis.rpush(key, value);
    await this.redis.ltrim(key, -env.CONVERSATION_WINDOW_SIZE, -1);
    await this.redis.expire(key, 60 * 60 * 24 * 14);
  }

  async read(userId: string): Promise<StoredMessage[]> {
    const rows = await this.redis.lrange<string>(this.keyFor(userId), 0, -1);
    return rows
      .map((raw) => {
        try {
          return JSON.parse(raw) as StoredMessage;
        } catch {
          return null;
        }
      })
      .filter((item): item is StoredMessage => item !== null);
  }

  private keyFor(userId: string): string {
    return `conversation:${userId}`;
  }
}
