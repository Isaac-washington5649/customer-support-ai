-- Add upload session status enum
CREATE TYPE "UploadSessionStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED', 'ABORTED');

-- Add content hash to chunks for deduplication and embedding cache mapping
ALTER TABLE "Chunk"
ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE INDEX IF NOT EXISTS "Chunk_contentHash_idx" ON "Chunk"("contentHash");

-- Upload session tracking for resumable, chunked uploads
CREATE TABLE "UploadSession" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "mimeType" TEXT,
  "partSize" INTEGER NOT NULL,
  "size" BIGINT,
  "checksum" TEXT,
  "status" "UploadSessionStatus" NOT NULL DEFAULT 'PENDING',
  "parts" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadSession_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UploadSession_workspaceId_objectKey_key" ON "UploadSession"("workspaceId", "objectKey");
CREATE INDEX "UploadSession_workspaceId_idx" ON "UploadSession"("workspaceId");

-- Embedding cache keyed by content hash to avoid recomputation
CREATE TABLE "EmbeddingCache" (
  "id" TEXT PRIMARY KEY,
  "hash" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "tokenCount" INTEGER NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "embedding" VECTOR(1536) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "EmbeddingCache_hash_key" ON "EmbeddingCache"("hash");
