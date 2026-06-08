import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createApiServer } from "./server.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const api = createApiServer(config, logger);

api.start().catch((error) => {
  logger.error("API server failed to start", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
