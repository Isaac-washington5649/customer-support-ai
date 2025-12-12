/* eslint-disable no-unused-vars */
import { performance } from "perf_hooks";

import type { ResolvedAgentProfile } from "../agents";
import type { RetrievedContext } from "../context";

export interface DocumentFixture {
  id: string;
  title: string;
  tags?: string[];
  folderPath?: string;
  mimeType?: string;
}

export interface SyntheticQuery {
  persona: ResolvedAgentProfile;
  query: string;
  expectedDocumentId: string;
  expectedTags: string[];
}

export interface RetrievalAdapter {
  retrieve: (_query: string, _persona: ResolvedAgentProfile) => Promise<RetrievedContext[]>;
}

export interface RagSampleResult {
  query: SyntheticQuery;
  retrieved: RetrievedContext[];
  hit: boolean;
  mrr: number;
  recallAt5: number;
  latencyMs: number;
}

export interface RagSummary {
  total: number;
  hitRate: number;
  meanReciprocalRank: number;
  recallAt5: number;
  avgLatencyMs: number;
}

export interface RagEvaluationReport {
  summary: RagSummary;
  samples: RagSampleResult[];
}

const buildQueryText = (persona: ResolvedAgentProfile, fixture: DocumentFixture): string => {
  const tags = fixture.tags?.length ? ` about ${fixture.tags.slice(0, 2).join(" and ")}` : "";
  const folder = fixture.folderPath ? ` stored under ${fixture.folderPath}` : "";
  const mime = fixture.mimeType ? ` (${fixture.mimeType})` : "";

  return `As ${persona.name}, answer a user asking for details on ${fixture.title}${mime}${tags}${folder}. Include source citations.`;
};

export class OfflineEvaluationHarness {
  private readonly personas: ResolvedAgentProfile[];
  private readonly retriever: RetrievalAdapter;

  constructor(personas: ResolvedAgentProfile[], retriever: RetrievalAdapter) {
    this.personas = personas;
    this.retriever = retriever;
  }

  generateSyntheticQueries(
    fixtures: DocumentFixture[],
    countPerPersona = 3,
  ): SyntheticQuery[] {
    if (!fixtures.length) {
      throw new Error("Document fixtures are required to synthesize evaluation queries.");
    }

    const queries: SyntheticQuery[] = [];

    this.personas.forEach((persona, personaIndex) => {
      for (let i = 0; i < countPerPersona; i += 1) {
        const fixture = fixtures[(personaIndex + i) % fixtures.length];
        queries.push({
          persona,
          query: buildQueryText(persona, fixture),
          expectedDocumentId: fixture.id,
          expectedTags: fixture.tags ?? [],
        });
      }
    });

    return queries;
  }

  async run(fixtures: DocumentFixture[], countPerPersona = 3): Promise<RagEvaluationReport> {
    const queries = this.generateSyntheticQueries(fixtures, countPerPersona);
    const samples: RagSampleResult[] = [];

    for (const query of queries) {
      const start = performance.now();
      const retrieved = await this.retriever.retrieve(query.query, query.persona);
      const latencyMs = performance.now() - start;

      const hitIndex = retrieved.findIndex(
        (context) => context.documentId === query.expectedDocumentId,
      );
      const hit = hitIndex !== -1;
      const mrr = hit ? 1 / (hitIndex + 1) : 0;
      const recallAt5 = hitIndex !== -1 && hitIndex < 5 ? 1 : 0;

      samples.push({
        query,
        retrieved,
        hit,
        mrr,
        recallAt5,
        latencyMs,
      });
    }

    const summary: RagSummary = {
      total: samples.length,
      hitRate:
        samples.length === 0
          ? 0
          : samples.filter((sample) => sample.hit).length / samples.length,
      meanReciprocalRank:
        samples.length === 0
          ? 0
          :
            samples.reduce((acc, sample) => acc + sample.mrr, 0) /
            Math.max(1, samples.length),
      recallAt5:
        samples.length === 0
          ? 0
          :
            samples.reduce((acc, sample) => acc + sample.recallAt5, 0) /
            Math.max(1, samples.length),
      avgLatencyMs:
        samples.length === 0
          ? 0
          : samples.reduce((acc, sample) => acc + sample.latencyMs, 0) / Math.max(1, samples.length),
    };

    return { summary, samples };
  }
}
