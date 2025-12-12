import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { checksum } from "@customer-support-ai/ingestion";

export interface EmbeddingProviderResult {
  embedding: number[];
  tokenCount: number;
  model: string;
}

export interface EmbeddingProvider {
  readonly model: string;
  embed(content: string): Promise<EmbeddingProviderResult>;
}

export interface CachedEmbedding {
  hash: string;
  embedding: number[];
  tokenCount: number;
  model: string;
  cached: boolean;
}

export class EmbeddingCacheService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(content: string, provider: EmbeddingProvider): Promise<CachedEmbedding> {
    const hash = checksum(Buffer.from(content));
    const existing = await this.prisma.embeddingCache.findUnique({ where: { hash } });

    if (existing) {
      return {
        hash,
        embedding: (existing.embedding as unknown as number[]) ?? [],
        tokenCount: existing.tokenCount,
        model: existing.model,
        cached: true,
      } satisfies CachedEmbedding;
    }

    const result = await provider.embed(content);

    const vector = Prisma.sql`[${Prisma.join(result.embedding)}]`;
    await this.prisma.$executeRaw`INSERT INTO "EmbeddingCache" (id, hash, model, "tokenCount", dimensions, embedding)
      VALUES (${randomUUID()}, ${hash}, ${result.model}, ${result.tokenCount}, ${result.embedding.length}, ${vector}::vector)
      ON CONFLICT (hash) DO NOTHING;`;

    return {
      hash,
      embedding: result.embedding,
      tokenCount: result.tokenCount,
      model: result.model,
      cached: false,
    } satisfies CachedEmbedding;
  }

  async attachToChunk(
    chunkId: string,
    content: string,
    provider: EmbeddingProvider,
    tokenFallback?: number,
  ): Promise<CachedEmbedding> {
    const record = await this.getOrCreate(content, provider);
    const vector = Prisma.sql`[${Prisma.join(record.embedding)}]`;

    await this.prisma.$executeRaw`UPDATE "Chunk" SET embedding = ${vector}::vector, "tokenCount" = ${
      record.tokenCount || tokenFallback || null
    }, "contentHash" = ${record.hash} WHERE id = ${chunkId};`;

    return record;
  }
}
