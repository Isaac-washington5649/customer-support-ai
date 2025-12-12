import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
  type CompletedPart,
  type S3Client,
} from "@aws-sdk/client-s3";
import { type Readable } from "node:stream";

import { type WorkspaceObjectLocator } from "./types";
import { checksum } from "./utils";

export interface UploadResult extends WorkspaceObjectLocator {
  checksum: string;
  size: number;
  mimeType?: string;
}

export interface UploadPartRecord {
  partNumber: number;
  size: number;
  etag: string;
  checksum: string;
}

export interface ResumableUploadRecord extends WorkspaceObjectLocator {
  id: string;
  uploadId: string;
  mimeType?: string;
  partSize: number;
  size?: number;
  checksum?: string;
  status: "pending" | "uploading" | "completed" | "aborted" | "failed";
  parts: UploadPartRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadSessionStore {
  create(record: ResumableUploadRecord): Promise<void>;
  update(record: ResumableUploadRecord): Promise<void>;
  get(id: string): Promise<ResumableUploadRecord | null>;
}

export class InMemoryUploadSessionStore implements UploadSessionStore {
  private readonly sessions = new Map<string, ResumableUploadRecord>();

  async create(record: ResumableUploadRecord): Promise<void> {
    this.sessions.set(record.id, record);
  }

  async update(record: ResumableUploadRecord): Promise<void> {
    this.sessions.set(record.id, record);
  }

  async get(id: string): Promise<ResumableUploadRecord | null> {
    return this.sessions.get(id) ?? null;
  }
}

export async function uploadBuffer(
  client: S3Client,
  buffer: Buffer,
  options: WorkspaceObjectLocator & { mimeType?: string; metadata?: Record<string, string> },
): Promise<UploadResult> {
  await client.send(
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: options.objectKey,
      Body: buffer,
      ContentType: options.mimeType,
      Metadata: options.metadata,
    }),
  );

  return {
    bucket: options.bucket,
    objectKey: options.objectKey,
    workspace: options.workspace,
    checksum: checksum(buffer),
    size: buffer.byteLength,
    mimeType: options.mimeType,
  };
}

const streamToBuffer = async (stream?: Readable | ReadableStream): Promise<Buffer> => {
  if (!stream) return Buffer.alloc(0);

  if (typeof (stream as Readable).on === "function") {
    const nodeStream = stream as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of nodeStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const reader = (stream as ReadableStream).getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};

export async function downloadObject(
  client: S3Client,
  locator: WorkspaceObjectLocator,
): Promise<{ buffer: Buffer; mimeType?: string }> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: locator.bucket,
      Key: locator.objectKey,
    }),
  );

  const buffer = await streamToBuffer(response.Body as ReadableStream | undefined);
  return { buffer, mimeType: response.ContentType };
}

export class ResumableUploadManager {
  constructor(private readonly client: S3Client, private readonly store: UploadSessionStore) {}

  async start(
    options: WorkspaceObjectLocator & { mimeType?: string; partSize?: number; checksum?: string },
  ): Promise<ResumableUploadRecord> {
    const partSize = options.partSize ?? 5 * 1024 * 1024;
    const create = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: options.bucket,
        Key: options.objectKey,
        ContentType: options.mimeType,
      }),
    );

    const record: ResumableUploadRecord = {
      id: `${options.workspace}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      workspace: options.workspace,
      objectKey: options.objectKey,
      bucket: options.bucket,
      mimeType: options.mimeType,
      uploadId: create.UploadId ?? "",
      partSize,
      checksum: options.checksum,
      status: "pending",
      parts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.store.create(record);
    return record;
  }

  async uploadChunk(
    sessionId: string,
    buffer: Buffer,
    partNumber: number,
  ): Promise<UploadPartRecord> {
    const session = await this.requireSession(sessionId);

    const response = await this.client.send(
      new UploadPartCommand({
        Bucket: session.bucket,
        Key: session.objectKey,
        UploadId: session.uploadId,
        PartNumber: partNumber,
        Body: buffer,
      }),
    );

    const part: UploadPartRecord = {
      partNumber,
      size: buffer.byteLength,
      etag: response.ETag ?? "",
      checksum: checksum(buffer),
    };

    const updated: ResumableUploadRecord = {
      ...session,
      status: "uploading",
      size: (session.size ?? 0) + buffer.byteLength,
      updatedAt: new Date(),
      parts: [...session.parts.filter((p) => p.partNumber !== partNumber), part],
    };

    await this.store.update(updated);
    return part;
  }

  async complete(sessionId: string): Promise<UploadResult> {
    const session = await this.requireSession(sessionId);
    const sortedParts = session.parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map<CompletedPart>((part) => ({ ETag: part.etag, PartNumber: part.partNumber }));

    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: session.bucket,
        Key: session.objectKey,
        UploadId: session.uploadId,
        MultipartUpload: { Parts: sortedParts },
      }),
    );

    const completeRecord: ResumableUploadRecord = {
      ...session,
      status: "completed",
      updatedAt: new Date(),
    };
    await this.store.update(completeRecord);

    const digest = session.checksum ?? checksum(Buffer.from(sortedParts.map((p) => p.ETag).join("")));

    return {
      bucket: session.bucket,
      objectKey: session.objectKey,
      workspace: session.workspace,
      checksum: digest,
      size: session.size ?? sortedParts.reduce((total, part) => total + (part.ETag?.length ?? 0), 0),
      mimeType: session.mimeType,
    } satisfies UploadResult;
  }

  async abort(sessionId: string): Promise<void> {
    const session = await this.requireSession(sessionId);
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: session.bucket,
        Key: session.objectKey,
        UploadId: session.uploadId,
      }),
    );

    await this.store.update({ ...session, status: "aborted", updatedAt: new Date() });
  }

  private async requireSession(id: string): Promise<ResumableUploadRecord> {
    const session = await this.store.get(id);
    if (!session) {
      throw new Error(`Upload session ${id} not found`);
    }
    return session;
  }
}
