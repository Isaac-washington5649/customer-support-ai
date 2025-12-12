import { env } from "./env";
import { prisma } from "./db/client";
import {
  createS3Client,
  ensureWorkspaceBucket,
  workspaceBucketName,
} from "@customer-support-ai/ingestion";
import { logger } from "./logging";
import { shutdownTelemetry, startTelemetry } from "./telemetry";

const s3 = createS3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
});

async function bootstrap() {
  await startTelemetry();
  await prisma.$connect();

  const defaultBucket = workspaceBucketName(env.S3_BUCKET_PREFIX, "bootstrap");
  await ensureWorkspaceBucket(s3, {
    bucket: defaultBucket,
    acl: "private",
    region: env.S3_REGION,
  });

  logger.info("API bootstrap complete", {
    database: env.DATABASE_URL,
    bucket: defaultBucket,
    environment: env.NODE_ENV,
  });
}

void bootstrap().catch((error) => {
  logger.error("API bootstrap failed", { error: (error as Error).message });
  void shutdownTelemetry();
  process.exit(1);
});

process.on("SIGTERM", () => void shutdownTelemetry());
process.on("SIGINT", () => void shutdownTelemetry());
