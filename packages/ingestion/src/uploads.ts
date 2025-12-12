import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import { type WorkspaceObjectLocator } from "./types";
import { checksum } from "./utils";

export interface UploadResult extends WorkspaceObjectLocator {
  checksum: string;
  size: number;
  mimeType?: string;
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
