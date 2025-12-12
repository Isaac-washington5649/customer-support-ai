import { describe, expect, it } from "vitest";
import { buildPromptContext, mergeHybridResults } from "./retrieval";
import type { HybridSearchResult } from "./search";

const baseResult = (id: string, score: number, source: "vector" | "keyword" = "vector") => ({
  chunkId: id,
  documentId: `doc-${id}`,
  documentTitle: `Document ${id}`,
  content: `Content ${id}`,
  mimeType: "text/plain",
  folderIds: [],
  tags: [],
  score,
  rank: 0,
  source,
});

describe("mergeHybridResults", () => {
  it("deduplicates results by chunk and keeps higher score", () => {
    const results: HybridSearchResult[] = [
      baseResult("a", 0.4),
      baseResult("a", 0.9, "keyword"),
      baseResult("b", 0.7),
    ];

    const merged = mergeHybridResults(results, 5);

    expect(merged).toHaveLength(2);
    expect(merged[0].chunkId).toBe("a");
    expect(merged[0].score).toBe(0.9);
  });
});

describe("buildPromptContext", () => {
  it("creates prompt context with reranked metadata", () => {
    const results: HybridSearchResult[] = [baseResult("a", 0.8), baseResult("b", 0.6)];

    const context = buildPromptContext(results, { maxContexts: 1 });

    expect(context.retrievedContexts).toHaveLength(1);
    expect(context.retrievedContexts[0].metadata?.documentTitle).toBe("Document a");
    expect(context.metadata?.reranked).toBe("hybrid");
  });
});
