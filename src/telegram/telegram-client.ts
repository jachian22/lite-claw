import { getEnv } from "../config/env.js";
import type { TelegramResponse, TelegramUpdate } from "./types.js";

export class TelegramClient {
  private readonly baseUrl: string;

  constructor() {
    const env = getEnv();
    this.baseUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  }

  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    const payload = {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message"]
    };

    const response = await fetch(`${this.baseUrl}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const body = (await response.json()) as TelegramResponse<TelegramUpdate[]>;
    if (!body.ok) {
      throw new Error(`Telegram getUpdates failed: ${body.description ?? "unknown"}`);
    }

    return body.result ?? [];
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });

    const body = (await response.json()) as TelegramResponse<unknown>;
    if (!body.ok) {
      throw new Error(`Telegram sendMessage failed: ${body.description ?? "unknown"}`);
    }
  }
}
