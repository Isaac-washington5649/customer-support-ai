import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { Prisma, type PrismaClient } from "@prisma/client";
import { type S3Client } from "@aws-sdk/client-s3";
import {
  checksum,
  createS3Client,
  downloadObject,
  InMemoryUploadSessionStore,
  parseDocument,
  ResumableUploadManager,
  type ResumableUploadRecord,
  type UploadSessionStore,
  uploadBuffer,
  workspaceBucketName,
  type WorkspaceObjectLocator,
} from "@customer-support-ai/ingestion";
import { EmbeddingCacheService, type EmbeddingProvider } from "./embeddings/cache";

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
  uploadSessions?: UploadSessionStore;
  embeddingProvider?: EmbeddingProvider;
  embeddingCache?: EmbeddingCacheService;
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

class PrismaUploadSessionStore implements UploadSessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveWorkspaceId(workspace: string): Promise<string> {
    const found = await this.prisma.workspace.findUnique({ where: { slug: workspace } });
    if (!found) {
      throw new Error(`Workspace ${workspace} not found for upload session`);
    }
    return found.id;
  }

  async create(record: ResumableUploadRecord): Promise<void> {
    await this.prisma.uploadSession.create({
      data: {
        id: record.id,
        workspaceId: await this.resolveWorkspaceId(record.workspace),
        uploadId: record.uploadId,
        objectKey: record.objectKey,
        bucket: record.bucket,
        mimeType: record.mimeType,
        partSize: record.partSize,
        checksum: record.checksum,
        parts: record.parts,
        status: "PENDING",
        size: record.size ? BigInt(record.size) : null,
      },
    });
  }

  async update(record: ResumableUploadRecord): Promise<void> {
    await this.prisma.uploadSession.update({
      where: { id: record.id },
      data: {
        uploadId: record.uploadId,
        objectKey: record.objectKey,
        bucket: record.bucket,
        mimeType: record.mimeType,
        partSize: record.partSize,
        checksum: record.checksum,
        parts: record.parts,
        status: this.toStatus(record.status),
        size: record.size ? BigInt(record.size) : null,
      },
    });
  }

  async get(id: string): Promise<ResumableUploadRecord | null> {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id },
      include: { workspace: { select: { slug: true } } },
    });

    if (!session) return null;
    return {
      id: session.id,
      workspace: session.workspace.slug,
      uploadId: session.uploadId,
      objectKey: session.objectKey,
      bucket: session.bucket,
      mimeType: session.mimeType ?? undefined,
      partSize: session.partSize,
      checksum: session.checksum ?? undefined,
      status: this.fromStatus(session.status),
      parts: (session.parts as unknown as ResumableUploadRecord["parts"]) ?? [],
      size: session.size ? Number(session.size) : undefined,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    } satisfies ResumableUploadRecord;
  }

  private toStatus(status: ResumableUploadRecord["status"]): "PENDING" | "UPLOADING" | "COMPLETED" | "FAILED" | "ABORTED" {
    switch (status) {
      case "pending":
        return "PENDING";
      case "uploading":
        return "UPLOADING";
      case "completed":
        return "COMPLETED";
      case "aborted":
        return "ABORTED";
      case "failed":
      default:
        return "FAILED";
    }
  }

  private fromStatus(status: string): ResumableUploadRecord["status"] {
    switch (status) {
      case "PENDING":
        return "pending";
      case "UPLOADING":
        return "uploading";
      case "COMPLETED":
        return "completed";
      case "ABORTED":
        return "aborted";
      default:
        return "failed";
    }
  }
}

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

type ChunkRecord = {
  id: string;
  documentId: string;
  content: string;
  metadata?: Record<string, unknown>;
  tokenCount?: number;
  contentHash?: string;
};

async function persistChunks(
  deps: UploadDependencies,
  documentId: string,
  objectKey: string,
  chunkRecords: ChunkRecord[],
) {
  await deps.prisma.$transaction([
    deps.prisma.file.update({
      where: { objectKey },
      data: { status: "READY" },
    }),
    deps.prisma.chunk.createMany({
      data: chunkRecords.map(({ id, documentId: docId, content, metadata, tokenCount, contentHash }) => ({
        id,
        documentId: docId,
        content,
        metadata,
        tokenCount,
        contentHash,
      })),
    }),
    deps.prisma.document.update({
      where: { id: documentId },
      data: { status: "READY", tokens: chunkRecords.reduce((sum, chunk) => sum + (chunk.tokenCount ?? 0), 0) },
    }),
  ]);

  if (deps.embeddingProvider) {
    const cache = deps.embeddingCache ?? new EmbeddingCacheService(deps.prisma);
    for (const record of chunkRecords) {
      await cache.attachToChunk(record.id, record.content, deps.embeddingProvider, record.tokenCount ?? undefined);
    }
  }
}

const getUploadManager = (deps: UploadDependencies, store?: UploadSessionStore) =>
  new ResumableUploadManager(deps.s3, store ?? deps.uploadSessions ?? new InMemoryUploadSessionStore());

async function assertProjectedSize(
  deps: UploadDependencies,
  session: ResumableUploadRecord,
  additionalBytes: number,
): Promise<void> {
  const policies: Required<UploadPolicies> = { ...DEFAULT_POLICIES, ...deps.policies } as Required<UploadPolicies>;
  const projected = (session.size ?? 0) + additionalBytes;

  if (policies.maxBytes && projected > policies.maxBytes) {
    throw new Error(`File exceeds maximum size of ${policies.maxBytes} bytes`);
  }
}

export async function startResumableUpload(
  deps: UploadDependencies,
  context: UploadContext,
  options: { partSize?: number; checksum?: string } = {},
): Promise<{ session: ResumableUploadRecord; locator: WorkspaceObjectLocator }> {
  const bucket = workspaceBucketName(deps.bucketPrefix, context.workspaceSlug);
  const objectKey = `${context.workspaceSlug}/${Date.now()}-${context.filename}`;
  const sessionStore = deps.uploadSessions ?? new InMemoryUploadSessionStore();
  const manager = getUploadManager(deps, sessionStore);
  const session = await manager.start({
    bucket,
    objectKey,
    workspace: context.workspaceSlug,
    mimeType: context.mimeType,
    partSize: options.partSize,
    checksum: options.checksum,
  });

  const file = await deps.prisma.file.create({
    data: {
      workspace: { connect: { slug: context.workspaceSlug } },
      uploader: context.uploaderId ? { connect: { id: context.uploaderId } } : undefined,
      bucket,
      objectKey,
      size: 0,
      mimeType: context.mimeType,
      checksum: options.checksum,
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
    mode: context.mode,
  });

  return { session, locator: { bucket, objectKey, workspace: context.workspaceSlug } };
}

export async function uploadResumablePart(
  deps: UploadDependencies,
  sessionId: string,
  buffer: Buffer,
  context: UploadContext,
  partNumber?: number,
) {
  const sessionStore = deps.uploadSessions ?? new InMemoryUploadSessionStore();
  const manager = getUploadManager(deps, sessionStore);
  const session = await sessionStore.get(sessionId);

  if (!session) {
    throw new Error(`Upload session ${sessionId} not found`);
  }

  await assertProjectedSize(deps, session, buffer.byteLength);
  await deps.scan?.(buffer, context);

  const part = await manager.uploadChunk(sessionId, buffer, partNumber ?? session.parts.length + 1);

  await deps.prisma.file.update({
    where: { objectKey: session.objectKey },
    data: { size: Number(session.size ?? 0) + buffer.byteLength, status: "PROCESSING" },
  });

  return part;
}

export async function completeResumableUpload(
  deps: UploadDependencies,
  sessionId: string,
  context: UploadContext,
): Promise<WorkspaceObjectLocator> {
  const sessionStore = deps.uploadSessions ?? new InMemoryUploadSessionStore();
  const manager = getUploadManager(deps, sessionStore);
  const result = await manager.complete(sessionId);

  await deps.prisma.file.update({
    where: { objectKey: result.objectKey },
    data: { checksum: result.checksum, size: result.size, status: "PROCESSING" },
  });

  await deps.prisma.document.updateMany({
    where: { workspace: { slug: context.workspaceSlug }, sourceFile: { objectKey: result.objectKey } },
    data: { status: "EMBEDDING" },
  });

  await logAudit(deps, {
    kind: "upload",
    workspace: context.workspaceSlug,
    uploaderId: context.uploaderId,
    filename: context.filename,
    mimeType: context.mimeType,
    size: result.size,
    result: "accepted",
    mode: context.mode,
  });

  return result;
}

export async function ingestExistingObject(
  deps: UploadDependencies,
  locator: WorkspaceObjectLocator,
  context: UploadContext,
): Promise<{ chunksCreated: number }> {
  const start = performance.now();
  const { buffer, mimeType } = await downloadObject(deps.s3, locator);
  const documentRecord = await deps.prisma.document.findFirstOrThrow({
    where: { sourceFile: { objectKey: locator.objectKey }, workspace: { slug: context.workspaceSlug } },
  });

  const { chunks } = await parseDocument(buffer, {
    name: context.filename,
    size: context.size ?? buffer.byteLength,
    mimeType: context.mimeType ?? mimeType,
  });

  const chunkRecords = chunks.map((chunk) => ({
    id: randomUUID(),
    documentId: documentRecord.id,
    content: chunk.content,
    metadata: chunk.metadata,
    tokenCount: chunk.tokenEstimate,
    contentHash: checksum(Buffer.from(chunk.content)),
  }));

  await persistChunks(deps, documentRecord.id, locator.objectKey, chunkRecords);

  await logAudit(deps, {
    kind: "ingest",
    workspace: context.workspaceSlug,
    uploaderId: context.uploaderId,
    filename: context.filename,
    mimeType: context.mimeType ?? mimeType,
    size: context.size ?? buffer.byteLength,
    result: "accepted",
    durationMs: Math.round(performance.now() - start),
    mode: context.mode,
  });

  return { chunksCreated: chunkRecords.length };
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
  const chunkRecords = chunks.map((chunk) => ({
    id: randomUUID(),
    documentId: documentRecord.id,
    content: chunk.content,
    metadata: chunk.metadata,
    tokenCount: chunk.tokenEstimate,
    contentHash: checksum(Buffer.from(chunk.content)),
  }));

  await persistChunks(deps, documentRecord.id, locator.objectKey, chunkRecords);

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
  uploadSessions?: UploadSessionStore;
  embeddingProvider?: EmbeddingProvider;
  embeddingCache?: EmbeddingCacheService;
}): UploadDependencies {
  return {
    prisma: env.prisma,
    bucketPrefix: env.S3_BUCKET_PREFIX,
    region: env.S3_REGION,
    audit: env.audit,
    scan: env.scan ?? ((buffer) => scanBufferForThreats(buffer)),
    policies: env.policies,
    rateLimiter: env.rateLimiter,
    uploadSessions: env.uploadSessions ?? new PrismaUploadSessionStore(env.prisma),
    embeddingProvider: env.embeddingProvider,
    embeddingCache: env.embeddingCache,
    s3: createS3Client({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
    }),
  };
}
