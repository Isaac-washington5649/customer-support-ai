export const DEFAULT_EMBEDDING_DIMENSION = 1536;

export interface EmbeddingChunk {
  id: string;
  content: string;
  embedding: number[];
  documentId: string;
  workspaceId: string;
}

export interface RerankResult {
  chunkId: string;
  score: number;
}

export const scorePlaceholder = (chunks: EmbeddingChunk[]): RerankResult[] =>
  chunks.map((chunk, index) => ({
    chunkId: chunk.id,
    score: 1 - index / chunks.length,
  }));

export * from "./agents";
export * from "./context";
export * from "./messages";
export * from "./openai-client";
export * from "./router";
