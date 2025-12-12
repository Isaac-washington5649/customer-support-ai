import type { PromptContext, RetrievedContext } from "@customer-support-ai/ai";
import type { HybridSearchResult } from "./search";

export interface RetrievalPipelineOptions {
  maxContexts?: number;
  reasoning?: string;
}

export const mergeHybridResults = (
  results: HybridSearchResult[],
  maxContexts: number,
): HybridSearchResult[] => {
  const deduped = new Map<string, HybridSearchResult>();

  for (const result of results) {
    const existing = deduped.get(result.chunkId);
    if (!existing || result.score > existing.score) {
      deduped.set(result.chunkId, result);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxContexts);
};

export const buildRetrievedContexts = (
  results: HybridSearchResult[],
  options: RetrievalPipelineOptions = {},
): RetrievedContext[] => {
  const maxContexts = options.maxContexts ?? results.length;
  const topResults = mergeHybridResults(results, maxContexts);

  return topResults.map((result, index) => ({
    id: result.chunkId,
    chunkId: result.chunkId,
    documentId: result.documentId,
    rank: index + 1,
    score: result.score,
    content: result.content,
    reasoning: options.reasoning,
    metadata: {
      source: result.source,
      mimeType: result.mimeType ?? "unknown",
      folderIds: result.folderIds,
      tags: result.tags,
      documentTitle: result.documentTitle,
    },
    citations: [
      {
        id: result.documentId,
        chunkId: result.chunkId,
        documentId: result.documentId,
        title: result.documentTitle,
        snippet: result.content.slice(0, 240),
        mimeType: result.mimeType ?? undefined,
        folderIds: result.folderIds,
        tags: result.tags,
        score: result.score,
        rank: index + 1,
        sourceType: "kb",
      },
    ],
  }));
};

export const buildPromptContext = (
  results: HybridSearchResult[],
  options: RetrievalPipelineOptions = {},
): PromptContext => ({
  retrievedContexts: buildRetrievedContexts(results, options),
  metadata: {
    reranked: "hybrid",
    maxContexts: String(options.maxContexts ?? results.length),
  },
});
