import { runHeartbeatWorker } from "./worker.js";
import { logger } from "../lib/logger.js";

void runHeartbeatWorker().catch((error) => {
  logger.error("Heartbeat worker failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
