export interface IngestionJob {
  workspaceSlug: string;
  objectKey: string;
  bucket: string;
  filename: string;
  size: number;
  mimeType?: string;
  uploaderId?: string;
}

export interface DeletionJob {
  workspaceSlug: string;
  documentId: string;
  deleteFile?: boolean;
  reason?: string;
}

export type QueueName = "ingestion" | "ingestion:dlq" | "deletion" | "deletion:dlq";
