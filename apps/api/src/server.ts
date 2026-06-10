import { pathToFileURL } from "node:url";
import app from "./app.js";

export {
  app,
  createApiServer,
  createApp,
  createDefaultDependencies,
  createRequestHandler
} from "./app.js";
export type {
  ApiDependencies,
  BmsWebhookPayload,
  DispatchSentinelApp,
  HealthResponse
} from "./app.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(app.config.port, app.config.host);
}
