import { runMigrations } from "../db/migrations.js";
import { closeSql } from "../db/postgres.js";
import { IntegrationRepository } from "../db/repositories/integration-repository.js";
import { logger } from "../lib/logger.js";
import { OAuthServer } from "../oauth/server.js";
import { AgentService } from "../services/agent-service.js";
import { HeartbeatConfigService } from "../services/heartbeat-config-service.js";
import { IntegrationService } from "../services/integration-service.js";
import { OwnershipService } from "../services/ownership-service.js";
import { GoogleOAuthService } from "../services/google-oauth-service.js";
import { TelegramClient } from "../telegram/telegram-client.js";
import { TelegramPoller } from "../telegram/poller.js";
import { UpdateRouter } from "../telegram/update-router.js";

export async function runRuntime(): Promise<void> {
  await runMigrations();

  const ownership = new OwnershipService();
  await ownership.bootstrapClaimCode();
  const oauth = new GoogleOAuthService();

  const telegramClient = new TelegramClient();
  const agent = new AgentService();
  const integrations = new IntegrationService(new IntegrationRepository(), oauth);
  const heartbeats = new HeartbeatConfigService();
  const router = new UpdateRouter(telegramClient, ownership, agent, integrations, heartbeats);
  const poller = new TelegramPoller(telegramClient, router);
  const oauthServer = new OAuthServer(oauth, telegramClient);
  oauthServer.start();

  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down worker");
    poller.stop();
    await oauthServer.stop();
    await closeSql();
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await poller.run();
}
