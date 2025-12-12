import { env } from "./env";
import { prisma } from "./db/client";
import {
  createS3Client,
  ensureWorkspaceBucket,
  workspaceBucketName,
} from "@customer-support-ai/ingestion";

const s3 = createS3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
});

async function bootstrap() {
  await prisma.$connect();

  const defaultBucket = workspaceBucketName(env.S3_BUCKET_PREFIX, "bootstrap");
  await ensureWorkspaceBucket(s3, {
    bucket: defaultBucket,
    acl: "private",
    region: env.S3_REGION,
  });

  console.info(
    `[api] using database at ${env.DATABASE_URL} and bucket ${defaultBucket} (env: ${env.NODE_ENV})`,
  );
}

void bootstrap().catch((error) => {
  console.error("API bootstrap failed", error);
  process.exit(1);
});
