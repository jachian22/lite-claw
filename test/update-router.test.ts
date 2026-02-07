import { describe, expect, test } from "vitest";

import { UpdateRouter } from "../src/telegram/update-router.js";
import type { TelegramUpdate } from "../src/telegram/types.js";

function buildUpdate(text: string, userId = 123): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: Date.now(),
      text,
      chat: { id: userId, type: "private" },
      from: { id: userId }
    }
  };
}

describe("UpdateRouter", () => {
  test("prompts for claim when unclaimed", async () => {
    const sent: string[] = [];

    const router = new UpdateRouter(
      {
        sendMessage: async (_chatId: string, text: string) => {
          sent.push(text);
        }
      },
      {
        isOwnerConfigured: async () => false,
        claimOwnership: async () => ({ ok: false as const, reason: "invalid_code" }),
        isAllowedUser: async () => false
      },
      {
        handleMessage: async () => ""
      },
      {
        handleCommand: async () => ""
      },
      {
        handleCommand: async () => ""
      }
    );

    await router.route(buildUpdate("/start"));

    expect(sent[0]).toContain("Use: /claim");
  });

  test("silently ignores non-whitelisted users after claim", async () => {
    const sent: string[] = [];

    const router = new UpdateRouter(
      {
        sendMessage: async (_chatId: string, text: string) => {
          sent.push(text);
        }
      },
      {
        isOwnerConfigured: async () => true,
        claimOwnership: async () => ({ ok: false as const, reason: "already_claimed" }),
        isAllowedUser: async () => false
      },
      {
        handleMessage: async () => "should not run"
      },
      {
        handleCommand: async () => ""
      },
      {
        handleCommand: async () => ""
      }
    );

    await router.route(buildUpdate("hello"));
    expect(sent).toHaveLength(0);
  });

  test("routes /integrations command to integration service", async () => {
    const sent: string[] = [];

    const router = new UpdateRouter(
      {
        sendMessage: async (_chatId: string, text: string) => {
          sent.push(text);
        }
      },
      {
        isOwnerConfigured: async () => true,
        claimOwnership: async () => ({ ok: false as const, reason: "already_claimed" }),
        isAllowedUser: async () => true
      },
      {
        handleMessage: async () => "agent"
      },
      {
        handleCommand: async () => "integration-status"
      },
      {
        handleCommand: async () => "heartbeat-status"
      }
    );

    await router.route(buildUpdate("/integrations"));
    expect(sent[0]).toBe("integration-status");
  });
});
