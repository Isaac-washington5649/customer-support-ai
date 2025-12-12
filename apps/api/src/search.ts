import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export interface HybridSearchFilters {
  workspaceId: string;
  folderIds?: string[];
  tagLabels?: string[];
  mimeTypes?: string[];
}

export interface HybridSearchParams {
  query: string;
  embedding: number[];
  filters: HybridSearchFilters;
  vectorK?: number;
  keywordK?: number;
  keywordBoost?: number;
  limit?: number;
}

export interface HybridSearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  mimeType: string | null;
  folderIds: string[];
  tags: string[];
  score: number;
  rank: number;
  source: "vector" | "keyword";
}

const DEFAULT_VECTOR_K = 24;
const DEFAULT_KEYWORD_K = 24;
const DEFAULT_LIMIT = 12;
const DEFAULT_KEYWORD_BOOST = 0.35;

const toArraySql = (values?: string[]): Prisma.Sql => {
  if (!values?.length) {
    return Prisma.sql`NULL::text[]`;
  }

  return Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`;
};

export class HybridSearchService {
  private readonly client: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.client = prisma;
  }

  async search(params: HybridSearchParams): Promise<HybridSearchResult[]> {
    const vectorK = params.vectorK ?? DEFAULT_VECTOR_K;
    const keywordK = params.keywordK ?? DEFAULT_KEYWORD_K;
    const limit = params.limit ?? DEFAULT_LIMIT;
    const keywordBoost = params.keywordBoost ?? DEFAULT_KEYWORD_BOOST;

    if (!params.embedding.length) {
      throw new Error("Embedding is required for hybrid search.");
    }

    const embeddingVector = Prisma.sql`[${Prisma.join(params.embedding)}]`;
    const folderIds = toArraySql(params.filters.folderIds);
    const tagLabels = toArraySql(params.filters.tagLabels);
    const mimeTypes = toArraySql(params.filters.mimeTypes);

    const rows = await this.client.$queryRaw<HybridSearchResult[]>`
      WITH doc_meta AS (
        SELECT
          d.id                        AS document_id,
          d.title                     AS document_title,
          d."workspaceId"            AS workspace_id,
          f."mimeType"               AS mime_type,
          COALESCE(array_agg(DISTINCT df."folderId"), ARRAY[]::text[]) AS folder_ids,
          COALESCE(array_agg(DISTINCT t.label), ARRAY[]::text[])        AS tags
        FROM "Document" d
        LEFT JOIN "File" f ON f.id = d."sourceFileId"
        LEFT JOIN "DocumentFolder" df ON df."documentId" = d.id
        LEFT JOIN "DocumentTag" dt ON dt."documentId" = d.id
        LEFT JOIN "Tag" t ON t.id = dt."tagId"
        GROUP BY d.id, d.title, d."workspaceId", f."mimeType"
      ),
      vector_matches AS (
        SELECT
          c.id AS chunk_id,
          c."documentId" AS document_id,
          dm.document_title,
          dm.mime_type,
          dm.folder_ids,
          dm.tags,
          c.content,
          (1 - (c.embedding <=> ${embeddingVector}::vector)) AS vector_score
        FROM "Chunk" c
        JOIN doc_meta dm ON dm.document_id = c."documentId"
        WHERE dm.workspace_id = ${params.filters.workspaceId}
          AND (${folderIds} IS NULL OR (dm.folder_ids && ${folderIds}))
          AND (${tagLabels} IS NULL OR (dm.tags && ${tagLabels}))
          AND (${mimeTypes} IS NULL OR dm.mime_type = ANY(${mimeTypes}))
        ORDER BY vector_score DESC
        LIMIT ${vectorK}
      ),
      keyword_matches AS (
        SELECT
          c.id AS chunk_id,
          c."documentId" AS document_id,
          dm.document_title,
          dm.mime_type,
          dm.folder_ids,
          dm.tags,
          c.content,
          ts_rank_cd(c."searchVector", plainto_tsquery('english', ${params.query})) AS keyword_score
        FROM "Chunk" c
        JOIN doc_meta dm ON dm.document_id = c."documentId"
        WHERE dm.workspace_id = ${params.filters.workspaceId}
          AND (${folderIds} IS NULL OR (dm.folder_ids && ${folderIds}))
          AND (${tagLabels} IS NULL OR (dm.tags && ${tagLabels}))
          AND (${mimeTypes} IS NULL OR dm.mime_type = ANY(${mimeTypes}))
          AND c."searchVector" @@ plainto_tsquery('english', ${params.query})
        ORDER BY keyword_score DESC
        LIMIT ${keywordK}
      ),
      combined AS (
        SELECT *, vector_score AS raw_score, 'vector'::text AS source FROM vector_matches
        UNION ALL
        SELECT *, keyword_score * ${keywordBoost} AS raw_score, 'keyword'::text AS source FROM keyword_matches
      ),
      ranked AS (
        SELECT
          chunk_id,
          document_id,
          document_title,
          mime_type,
          folder_ids,
          tags,
          content,
          source,
          raw_score,
          DENSE_RANK() OVER (ORDER BY raw_score DESC) AS rank,
          CASE
            WHEN MAX(raw_score) OVER () > 0 THEN raw_score / MAX(raw_score) OVER ()
            ELSE 0
          END AS score
        FROM combined
      )
      SELECT
        chunk_id       AS "chunkId",
        document_id    AS "documentId",
        document_title AS "documentTitle",
        content,
        mime_type      AS "mimeType",
        folder_ids     AS "folderIds",
        tags,
        score,
        rank,
        source
      FROM ranked
      ORDER BY raw_score DESC
      LIMIT ${limit};
    `;

    return rows.map((row) => ({
      ...row,
      folderIds: row.folderIds ?? [],
      tags: row.tags ?? [],
    }));
  }
}
