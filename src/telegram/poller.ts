import { getEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { OffsetStoreService } from "../services/offset-store-service.js";
import { UpdateDedupeService } from "../services/update-dedupe-service.js";
import { TelegramClient } from "./telegram-client.js";
import { UpdateRouter } from "./update-router.js";

export class TelegramPoller {
  private readonly env = getEnv();
  private readonly dedupe = new UpdateDedupeService();
  private readonly offsets = new OffsetStoreService();
  private shouldStop = false;

  constructor(
    private readonly client: TelegramClient,
    private readonly router: UpdateRouter
  ) {}

  stop(): void {
    this.shouldStop = true;
  }

  async run(): Promise<void> {
    let offset = await this.offsets.getOffset();
    logger.info("Starting Telegram long poll worker", { offset });

    while (!this.shouldStop) {
      try {
        const updates = await this.client.getUpdates(offset, this.env.POLL_TIMEOUT_SECONDS);

        for (const update of updates) {
          if (!(await this.dedupe.shouldProcess(update.update_id))) {
            offset = Math.max(offset, update.update_id + 1);
            await this.offsets.setOffset(offset);
            continue;
          }

          await this.router.route(update);
          offset = Math.max(offset, update.update_id + 1);
          await this.offsets.setOffset(offset);
        }
      } catch (error) {
        logger.error("Polling loop failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        await sleep(this.env.POLL_RETRY_MS);
      }
    }

    logger.info("Telegram poller stopped");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
