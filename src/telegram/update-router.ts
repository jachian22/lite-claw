import { logger } from "../lib/logger.js";
import type { ClaimResult } from "../services/ownership-service.js";
import type { TelegramUpdate } from "./types.js";

interface TelegramClientLike {
  sendMessage(chatId: string, text: string): Promise<void>;
}

interface OwnershipServiceLike {
  isOwnerConfigured(): Promise<boolean>;
  isAllowedUser(telegramId: string): Promise<boolean>;
  claimOwnership(telegramId: string, code: string): Promise<ClaimResult>;
}

interface AgentServiceLike {
  handleMessage(userId: string, text: string): Promise<string>;
}

interface IntegrationServiceLike {
  handleCommand(userId: string, text: string): Promise<string>;
}

interface HeartbeatConfigServiceLike {
  handleCommand(userId: string, text: string): Promise<string>;
}

export class UpdateRouter {
  constructor(
    private readonly telegramClient: TelegramClientLike,
    private readonly ownershipService: OwnershipServiceLike,
    private readonly agentService: AgentServiceLike,
    private readonly integrationService: IntegrationServiceLike,
    private readonly heartbeatService: HeartbeatConfigServiceLike
  ) {}

  async route(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    const text = message?.text?.trim();
    const chatId = message?.chat?.id;
    const userId = message?.from?.id;

    if (!message || !text || !chatId || !userId) {
      return;
    }

    if (message.chat.type !== "private") {
      return;
    }

    const userIdStr = String(userId);
    const chatIdStr = String(chatId);
    const isOwnerConfigured = await this.ownershipService.isOwnerConfigured();

    if (!isOwnerConfigured) {
      await this.handleUnclaimedState(chatIdStr, userIdStr, text);
      return;
    }

    const isAllowed = await this.ownershipService.isAllowedUser(userIdStr);
    if (!isAllowed) {
      logger.warn("Ignored message from non-whitelisted user", { userId: userIdStr });
      return;
    }

    if (text === "/start") {
      await this.telegramClient.sendMessage(
        chatIdStr,
        "Assistant is online. Use /help to view available commands."
      );
      return;
    }

    if (text === "/help") {
      await this.telegramClient.sendMessage(
        chatIdStr,
        [
          "Available commands:",
          "/help",
          "/integrations",
          "/heartbeats",
          "Reply with a normal message for assistant responses.",
          "For write actions you must confirm with YES <code>."
        ].join("\n")
      );
      return;
    }

    if (text.startsWith("/integrations")) {
      const response = await this.integrationService.handleCommand(userIdStr, text);
      await this.telegramClient.sendMessage(chatIdStr, response);
      return;
    }

    if (text.startsWith("/heartbeats")) {
      const response = await this.heartbeatService.handleCommand(userIdStr, text);
      await this.telegramClient.sendMessage(chatIdStr, response);
      return;
    }

    const response = await this.agentService.handleMessage(userIdStr, text);
    await this.telegramClient.sendMessage(chatIdStr, response);
  }

  private async handleUnclaimedState(chatId: string, userId: string, text: string): Promise<void> {
    const claimMatch = text.match(/^\/claim\s+(.+)$/i);
    if (claimMatch) {
      const rawCode = claimMatch[1];
      if (!rawCode) {
        await this.telegramClient.sendMessage(chatId, "Invalid claim command. Use /claim <code>.");
        return;
      }

      const code = rawCode.trim();
      const result = await this.ownershipService.claimOwnership(userId, code);

      if (result.ok) {
        await this.telegramClient.sendMessage(
          chatId,
          "Claim successful. You are now the owner and have been added to the whitelist."
        );
        return;
      }

      if (result.reason === "too_many_attempts") {
        await this.telegramClient.sendMessage(chatId, "Too many claim attempts. Try again later.");
        return;
      }

      if (result.reason === "already_claimed") {
        await this.telegramClient.sendMessage(chatId, "Ownership already claimed.");
        return;
      }

      if (result.reason === "claim_unavailable") {
        await this.telegramClient.sendMessage(chatId, "Claim code is not available. Check deployment config.");
        return;
      }

      await this.telegramClient.sendMessage(chatId, "Invalid claim code.");
      return;
    }

    if (text === "/start") {
      await this.telegramClient.sendMessage(
        chatId,
        [
          "Setup required before this assistant can run.",
          `Your Telegram ID: ${userId}`,
          "Use: /claim <your-secret-claim-code>"
        ].join("\n")
      );
      return;
    }

    await this.telegramClient.sendMessage(chatId, "This bot is not claimed yet. Use /claim <code>.");
  }
}
