export interface Citation {
  id: string;
  title?: string;
  url?: string;
  snippet?: string;
  sourceType?: "kb" | "ticket" | "release_note" | "other";
  documentId?: string;
  chunkId?: string;
  workspaceId?: string;
  mimeType?: string;
  folderIds?: string[];
  tags?: string[];
  score?: number;
  rank?: number;
}

export interface RetrievedContext {
  id?: string;
  chunkId?: string;
  documentId?: string;
  content: string;
  citations: Citation[];
  reasoning?: string;
  metadata?: Record<string, string | number | string[]>;
  score?: number;
  rank?: number;
  highlightTerms?: string[];
}

export interface ToolCallPreparation {
  name: string;
  description: string;
  parameters: Record<string, unknown> | unknown;
}

export interface PromptContext {
  retrievedContexts?: RetrievedContext[];
  tools?: ToolCallPreparation[];
  metadata?: Record<string, string>;
}

export interface InlineCitation {
  marker: string;
  citation: Citation;
  contextIndex: number;
}

export const buildInlineCitations = (contexts: RetrievedContext[]): InlineCitation[] => {
  const markers: InlineCitation[] = [];

  contexts.forEach((context, contextIndex) => {
    context.citations?.forEach((citation) => {
      markers.push({
        marker: `[${markers.length + 1}]`,
        citation,
        contextIndex,
      });
    });
  });

  return markers;
};
