import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@prisma/client";
import { type S3Client } from "@aws-sdk/client-s3";
import {
  checksum,
  createS3Client,
  parseDocument,
  uploadBuffer,
  workspaceBucketName,
  type WorkspaceObjectLocator,
} from "@customer-support-ai/ingestion";

export interface UploadContext {
  workspaceSlug: string;
  uploaderId?: string;
  mimeType?: string;
  size: number;
  filename: string;
}

export interface UploadDependencies {
  prisma: PrismaClient;
  s3: S3Client;
  bucketPrefix: string;
  region: string;
}

export async function recordUpload(
  deps: UploadDependencies,
  buffer: Buffer,
  context: UploadContext,
): Promise<WorkspaceObjectLocator> {
  const digest = checksum(buffer);
  const existing = await deps.prisma.file.findFirst({
    where: { checksum: digest, workspace: { slug: context.workspaceSlug } },
  });

  if (existing) {
    return { bucket: existing.bucket, objectKey: existing.objectKey, workspace: context.workspaceSlug };
  }

  const bucket = workspaceBucketName(deps.bucketPrefix, context.workspaceSlug);
  const objectKey = `${context.workspaceSlug}/${Date.now()}-${context.filename}`;
  await uploadBuffer(deps.s3, buffer, { bucket, objectKey, workspace: context.workspaceSlug, mimeType: context.mimeType });

  const file = await deps.prisma.file.create({
    data: {
      workspace: { connect: { slug: context.workspaceSlug } },
      uploader: context.uploaderId ? { connect: { id: context.uploaderId } } : undefined,
      bucket,
      objectKey,
      size: context.size,
      mimeType: context.mimeType,
      checksum: digest,
      status: "PENDING",
    },
  });

  await deps.prisma.document.create({
    data: {
      workspace: { connect: { slug: context.workspaceSlug } },
      sourceFile: { connect: { id: file.id } },
      title: context.filename,
      status: "PENDING",
    },
  });

  return { bucket, objectKey, workspace: context.workspaceSlug };
}

export async function ingestBuffer(
  deps: UploadDependencies,
  buffer: Buffer,
  context: UploadContext,
): Promise<{ chunksCreated: number }> {
  const locator = await recordUpload(deps, buffer, context);
  const documentRecord = await deps.prisma.document.findFirstOrThrow({
    where: { sourceFile: { objectKey: locator.objectKey }, workspace: { slug: context.workspaceSlug } },
  });

  const { chunks } = await parseDocument(buffer, {
    name: context.filename,
    size: context.size,
    mimeType: context.mimeType,
  });

  await deps.prisma.$transaction([
    deps.prisma.file.update({
      where: { objectKey: locator.objectKey },
      data: { status: "READY" },
    }),
    deps.prisma.chunk.createMany({
      data: chunks.map((chunk) => ({
        id: randomUUID(),
        documentId: documentRecord.id,
        content: chunk.content,
        metadata: chunk.metadata,
        tokenCount: chunk.tokenEstimate,
      })),
    }),
    deps.prisma.document.update({
      where: { id: documentRecord.id },
      data: { status: "READY" },
    }),
  ]);

  return { chunksCreated: chunks.length };
}

export function configureUploadDependencies(env: {
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET_PREFIX: string;
  prisma: PrismaClient;
}): UploadDependencies {
  return {
    prisma: env.prisma,
    bucketPrefix: env.S3_BUCKET_PREFIX,
    region: env.S3_REGION,
    s3: createS3Client({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
    }),
  };
}
