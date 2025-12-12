-- Add generated tsvector for keyword search and index for hybrid queries
ALTER TABLE "Chunk"
ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce("content", ''))
) STORED;

CREATE INDEX "Chunk_searchVector_idx" ON "Chunk" USING GIN ("searchVector");
