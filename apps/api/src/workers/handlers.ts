import { Worker } from "bullmq";

import {
  configureUploadDependencies,
  ingestExistingObject,
} from "../uploads";
import { prisma } from "../db/client";
import { env } from "../env";
import { deletionDlq, ingestionDlq, registerFailureHandler, workerOptions } from "./queues";
import type { DeletionJob, IngestionJob } from "./types";
import { deleteWorkspaceObject, workspaceBucketName } from "@customer-support-ai/ingestion";

const uploadDeps = configureUploadDependencies({
  S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
  S3_ENDPOINT: env.S3_ENDPOINT,
  S3_REGION: env.S3_REGION,
  S3_BUCKET_PREFIX: env.S3_BUCKET_PREFIX,
  prisma,
});

export const ingestionWorker = new Worker<IngestionJob>(
  "ingestion",
  async (job) => {
    await ingestExistingObject(
      uploadDeps,
      { bucket: job.data.bucket, objectKey: job.data.objectKey, workspace: job.data.workspaceSlug },
      {
        workspaceSlug: job.data.workspaceSlug,
        filename: job.data.filename,
        size: job.data.size,
        mimeType: job.data.mimeType,
        uploaderId: job.data.uploaderId,
      },
    );
  },
  workerOptions({ concurrency: env.INGESTION_CONCURRENCY }),
);

registerFailureHandler(ingestionWorker, ingestionDlq);

export const deletionWorker = new Worker<DeletionJob>(
  "deletion",
  async (job) => {
    const document = await prisma.document.findFirstOrThrow({
      where: { id: job.data.documentId, workspace: { slug: job.data.workspaceSlug } },
      include: { sourceFile: true },
    });

    await prisma.$transaction([
      prisma.chunk.deleteMany({ where: { documentId: document.id } }),
      prisma.documentFolder.deleteMany({ where: { documentId: document.id } }),
      prisma.documentTag.deleteMany({ where: { documentId: document.id } }),
      prisma.document.delete({ where: { id: document.id } }),
    ]);

    if (job.data.deleteFile && document.sourceFile) {
      await prisma.file.delete({ where: { id: document.sourceFileId! } });
      await deleteWorkspaceObject(uploadDeps.s3, {
        bucket: document.sourceFile.bucket,
        objectKey: document.sourceFile.objectKey,
      });
    }

    // Ensure the workspace bucket exists for downstream reprocessing
    const bucket = workspaceBucketName(env.S3_BUCKET_PREFIX, job.data.workspaceSlug);
    if (bucket !== job.data.bucket) {
      // eslint-disable-next-line no-console
      console.warn(
        `[deletion-worker] bucket mismatch for workspace ${job.data.workspaceSlug}; expected ${bucket}, got ${job.data.bucket}`,
      );
    }
  },
  workerOptions({ concurrency: env.DELETION_CONCURRENCY }),
);

registerFailureHandler(deletionWorker, deletionDlq);
