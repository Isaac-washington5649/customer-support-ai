/* eslint-disable no-unused-vars */
import type { PromptContext, ToolCallPreparation } from "./context";
import type { ChatMessage } from "./messages";

export interface Logger {
  debug?: (...args: [message: string, metadata?: Record<string, unknown>]) => void;
  info?: (...args: [message: string, metadata?: Record<string, unknown>]) => void;
  error?: (...args: [message: string, metadata?: Record<string, unknown>]) => void;
}

export interface TraceSpan {
  end: (...args: [error?: unknown]) => void;
}

export interface Tracer {
  startSpan: (...args: [name: string, attributes?: Record<string, unknown>]) => TraceSpan;
}

export interface OpenAIClientConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  logger?: Logger;
  tracer?: Tracer;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  stream?: boolean;
  tools?: ToolCallPreparation[];
  toolChoice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  context?: PromptContext;
}

export interface ChatCompletionResponse {
  id: string;
  message: ChatMessage;
  finishReason?: string;
  created?: number;
  model?: string;
  usage?: Record<string, unknown>;
  rawResponse?: unknown;
}

export interface StreamingChatChunk {
  delta: string;
  raw?: unknown;
  finishReason?: string | null;
}

export interface StreamingChatCompletion {
  stream: AsyncGenerator<StreamingChatChunk, void, unknown>;
  finalMessage: Promise<ChatCompletionResponse>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class OpenAIChatClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly config: OpenAIClientConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.maxRetries = config.maxRetries ?? 2;
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse | StreamingChatCompletion> {
    if (request.stream) {
      return this.streamChatCompletion(request);
    }

    return this.singleChatCompletion(request);
  }

  private async singleChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.executeWithRetry(request, false);
    const payload = await response.json();

    this.config.logger?.info?.("openai.chat.complete", {
      model: request.model ?? this.config.model,
      usage: payload.usage,
    });

    const [choice] = payload.choices ?? [];

    return {
      id: payload.id,
      created: payload.created,
      model: payload.model,
      finishReason: choice?.finish_reason,
      usage: payload.usage,
      message: choice?.message ?? { role: "assistant", content: "" },
      rawResponse: payload,
    };
  }

  private streamChatCompletion(request: ChatCompletionRequest): StreamingChatCompletion {
    const response = await this.executeWithRetry(request, true);
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Streaming response did not include a readable body.");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let content = "";
    let finishReason: string | undefined;
    let model = request.model ?? this.config.model;
    let created = Math.floor(Date.now() / 1000);
    let id = `stream-${Date.now()}`;

    let resolveFinal!: (value: ChatCompletionResponse) => void;
    const finalMessage = new Promise<ChatCompletionResponse>((resolve) => {
      resolveFinal = resolve;
    });

    const stream = (async function* (this: OpenAIChatClient) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data:")) continue;

          const data = line.replace(/^data:\s*/, "");
          if (data === "[DONE]") {
            break;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch (error) {
            this.config.logger?.error?.("openai.stream.parse_error", { error });
            continue;
          }

          const [choice] = parsed.choices ?? [];
          const delta = choice?.delta?.content ?? "";
          if (delta) {
            content += delta;
          }

          id = parsed.id ?? id;
          model = parsed.model ?? model;
          created = parsed.created ?? created;
          finishReason = choice?.finish_reason ?? undefined;

          yield {
            delta,
            raw: parsed,
            finishReason: choice?.finish_reason ?? null,
          } satisfies StreamingChatChunk;
        }
      }

      resolveFinal({
        id,
        created,
        model,
        finishReason,
        message: { role: "assistant", content },
      });
    }).bind(this)();

    return { stream, finalMessage } satisfies StreamingChatCompletion;
  }

  private async executeWithRetry(request: ChatCompletionRequest, stream: boolean): Promise<Response> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const span = this.config.tracer?.startSpan("openai.chat", {
        attempt,
        stream,
      });

      try {
        const response = await this.performRequest(request, stream);
        span?.end();

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`OpenAI error ${response.status}: ${body}`);
        }

        return response;
      } catch (error) {
        span?.end(error);
        lastError = error;
        this.config.logger?.error?.("openai.chat.error", { attempt, error });

        if (attempt === this.maxRetries) {
          throw error;
        }

        await sleep(2 ** attempt * 250);
      }

      attempt += 1;
    }

    throw lastError ?? new Error("Unknown OpenAI client error");
  }

  private async performRequest(request: ChatCompletionRequest, stream: boolean): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}/chat/completions`;
    const model = request.model ?? this.config.model;

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
        name: message.name,
      })),
      temperature: request.temperature,
      stream,
    };

    if (request.tools?.length) {
      payload.tools = request.tools;
      payload.tool_choice = request.toolChoice ?? "auto";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    this.config.logger?.debug?.("openai.chat.request", {
      model,
      stream,
      hasTools: Boolean(request.tools?.length),
      contextMetadata: request.context?.metadata,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}
