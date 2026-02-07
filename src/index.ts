import { runRuntime } from "./app/runtime.js";
import { logger } from "./lib/logger.js";

void runRuntime().catch((error) => {
  logger.error("Fatal runtime error", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
