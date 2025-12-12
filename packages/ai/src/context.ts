export interface Citation {
  id: string;
  title?: string;
  url?: string;
  snippet?: string;
  sourceType?: "kb" | "ticket" | "release_note" | "other";
}

export interface RetrievedContext {
  content: string;
  citations: Citation[];
  reasoning?: string;
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
