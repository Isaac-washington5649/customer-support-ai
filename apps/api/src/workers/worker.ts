import { schedulers } from "./queues";
import { deletionWorker, ingestionWorker } from "./handlers";

// Keep schedulers alive
void schedulers;

const shutdown = async () => {
  // eslint-disable-next-line no-console
  console.info("[worker] shutting down background workers");
  await Promise.all([ingestionWorker.close(), deletionWorker.close()]);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
