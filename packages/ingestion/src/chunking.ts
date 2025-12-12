import { randomUUID } from "node:crypto";

import { type ChunkingOptions, type DocumentChunk, type FileMetadata } from "./types";

const DEFAULT_MAX_CHARACTERS = 2000;
const DEFAULT_OVERLAP = 200;

export function chunkText(text: string, metadata: FileMetadata, options: ChunkingOptions = {}): DocumentChunk[] {
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;

  const chunks: DocumentChunk[] = [];
  let index = 0;
  for (let start = 0; start < text.length; start += maxCharacters - overlap) {
    const end = Math.min(start + maxCharacters, text.length);
    const content = text.slice(start, end);
    chunks.push({
      id: randomUUID(),
      documentId: "pending",
      content,
      index,
      tokenEstimate: Math.ceil(content.length / 4),
      metadata: { source: metadata.name, range: [start, end] },
    });
    index += 1;
    if (end === text.length) break;
  }

  return chunks;
}
