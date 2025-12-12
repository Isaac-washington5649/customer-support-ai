import { schedulers } from "./queues";
import { deletionWorker, ingestionWorker } from "./handlers";
import { startTelemetry, shutdownTelemetry } from "../telemetry";
import { logger } from "../logging";

// Keep schedulers alive
void schedulers;

void startTelemetry().then(() => {
  logger.info("Worker telemetry started");
});

const shutdown = async () => {
  logger.info("Shutting down background workers");
  await Promise.all([ingestionWorker.close(), deletionWorker.close()]);
  await shutdownTelemetry();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
