import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

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
  mode?: string;
}

export interface UploadDependencies {
  prisma: PrismaClient;
  s3: S3Client;
  bucketPrefix: string;
  region: string;
  audit?: (event: UploadAuditEvent) => Promise<void> | void;
  scan?: (buffer: Buffer, context: UploadContext) => Promise<void>;
  policies?: UploadPolicies;
  rateLimiter?: RateLimiter;
}

export interface UploadPolicies {
  maxBytes?: number;
  allowedMimeTypes?: string[];
  perUserPerMinute?: number;
  perModePerMinute?: number;
}

type UploadAuditEvent = {
  kind: "upload" | "ingest";
  workspace: string;
  uploaderId?: string;
  filename: string;
  mimeType?: string;
  size: number;
  mode?: string;
  durationMs?: number;
  result: "accepted" | "rejected" | "failed";
  reason?: string;
};

const DEFAULT_POLICIES: Required<Pick<UploadPolicies, "maxBytes" | "allowedMimeTypes" | "perUserPerMinute" | "perModePerMinute" >> = {
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: [
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/json",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  perUserPerMinute: 30,
  perModePerMinute: 60,
};

class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; reset: number }>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  assertWithinLimit(key: string, limit: number, windowMs: number) {
    const current = this.buckets.get(key);
    const now = this.now();
    const reset = now + windowMs;

    if (!current || current.reset < now) {
      this.buckets.set(key, { tokens: 1, reset });
      return;
    }

    if (current.tokens >= limit) {
      throw new Error(`Rate limit exceeded for ${key}`);
    }

    current.tokens += 1;
  }
}

const sharedRateLimiter = new RateLimiter();

async function validateUpload(deps: UploadDependencies, buffer: Buffer, context: UploadContext) {
  const policies: Required<UploadPolicies> = { ...DEFAULT_POLICIES, ...deps.policies };

  if (context.size > policies.maxBytes!) {
    await logAudit(deps, {
      kind: "upload",
      workspace: context.workspaceSlug,
      uploaderId: context.uploaderId,
      filename: context.filename,
      mimeType: context.mimeType,
      size: context.size,
      result: "rejected",
      reason: "file-too-large",
      mode: context.mode,
    });
    throw new Error(`File exceeds maximum size of ${policies.maxBytes} bytes`);
  }

  if (context.mimeType && !policies.allowedMimeTypes!.includes(context.mimeType)) {
    await logAudit(deps, {
      kind: "upload",
      workspace: context.workspaceSlug,
      uploaderId: context.uploaderId,
      filename: context.filename,
      mimeType: context.mimeType,
      size: context.size,
      result: "rejected",
      reason: "unsupported-type",
      mode: context.mode,
    });
    throw new Error(`Unsupported MIME type ${context.mimeType}`);
  }

  const limiter = deps.rateLimiter ?? sharedRateLimiter;
  try {
    if (context.uploaderId) {
      limiter.assertWithinLimit(`user:${context.uploaderId}`, policies.perUserPerMinute!, 60_000);
    }
    if (context.mode) {
      limiter.assertWithinLimit(`mode:${context.mode}`, policies.perModePerMinute!, 60_000);
    }
  } catch (error) {
    await logAudit(deps, {
      kind: "upload",
      workspace: context.workspaceSlug,
      uploaderId: context.uploaderId,
      filename: context.filename,
      mimeType: context.mimeType,
      size: context.size,
      result: "rejected",
      reason: (error as Error).message,
      mode: context.mode,
    });
    throw error;
  }

  await deps.scan?.(buffer, context);
}

async function logAudit(deps: UploadDependencies, event: UploadAuditEvent) {
  await deps.audit?.(event);
  // eslint-disable-next-line no-console
  console.info("[upload-audit]", JSON.stringify(event));
}

async function scanBufferForThreats(buffer: Buffer) {
  // Stub that can be replaced with a ClamAV or commercial scanner.
  if (!buffer || buffer.length === 0) return;
}

export async function recordUpload(
  deps: UploadDependencies,
  buffer: Buffer,
  context: UploadContext,
): Promise<WorkspaceObjectLocator> {
  const start = performance.now();
  await validateUpload(deps, buffer, context);

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

  await logAudit(deps, {
    kind: "upload",
    workspace: context.workspaceSlug,
    uploaderId: context.uploaderId,
    filename: context.filename,
    mimeType: context.mimeType,
    size: context.size,
    result: "accepted",
    durationMs: Math.round(performance.now() - start),
    mode: context.mode,
  });

  return { bucket, objectKey, workspace: context.workspaceSlug };
}

export async function ingestBuffer(
  deps: UploadDependencies,
  buffer: Buffer,
  context: UploadContext,
): Promise<{ chunksCreated: number }> {
  const start = performance.now();
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

  await logAudit(deps, {
    kind: "ingest",
    workspace: context.workspaceSlug,
    uploaderId: context.uploaderId,
    filename: context.filename,
    mimeType: context.mimeType,
    size: context.size,
    result: "accepted",
    durationMs: Math.round(performance.now() - start),
    mode: context.mode,
  });

  return { chunksCreated: chunks.length };
}

export function configureUploadDependencies(env: {
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET_PREFIX: string;
  prisma: PrismaClient;
  audit?: UploadDependencies["audit"];
  scan?: UploadDependencies["scan"];
  policies?: UploadPolicies;
  rateLimiter?: RateLimiter;
}): UploadDependencies {
  return {
    prisma: env.prisma,
    bucketPrefix: env.S3_BUCKET_PREFIX,
    region: env.S3_REGION,
    audit: env.audit,
    scan: env.scan ?? ((buffer) => scanBufferForThreats(buffer)),
    policies: env.policies,
    rateLimiter: env.rateLimiter,
    s3: createS3Client({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
    }),
  };
}
