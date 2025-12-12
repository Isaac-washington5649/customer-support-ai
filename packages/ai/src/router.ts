import type { ResolvedAgentProfile } from "./agents";
import type { AgentRegistry } from "./agents";
import type { RetrievedContext } from "./context";
import type { AgentRoutingRequest, ChatMessage, RoutedAgentPrompt } from "./messages";

const buildGuardrailMessage = (profile: ResolvedAgentProfile): ChatMessage => ({
  role: "system",
  content: `Follow these guardrails: ${profile.guardrails.join(" ")}`,
});

const buildPersonaMessage = (profile: ResolvedAgentProfile): ChatMessage => ({
  role: "system",
  content: `${profile.persona}\n${profile.systemPrompt}`,
});

const buildAdditionalInstructions = (profile: ResolvedAgentProfile): ChatMessage[] =>
  profile.additionalInstructions
    ? [
        {
          role: "system",
          content: profile.additionalInstructions,
        },
      ]
    : [];

const describeMetadata = (context: RetrievedContext): string | undefined => {
  const metadataParts: string[] = [];

  if (context.rank !== undefined) {
    metadataParts.push(`rank=${context.rank}`);
  }

  if (context.score !== undefined) {
    metadataParts.push(`score=${context.score.toFixed(3)}`);
  }

  if (context.metadata) {
    metadataParts.push(
      ...Object.entries(context.metadata).map(([key, value]) =>
        Array.isArray(value) ? `${key}=${value.join(", ")}` : `${key}=${value}`,
      ),
    );
  }

  return metadataParts.length ? `Metadata: ${metadataParts.join(" | ")}` : undefined;
};

const buildCitationLine = (context: RetrievedContext): string | undefined => {
  if (!context.citations?.length) {
    return undefined;
  }

  const formatted = context.citations.map((citation, index) => {
    const label = citation.title ?? citation.id;
    return `[${index + 1}] ${label}`;
  });

  return `Citations: ${formatted.join(" | ")}`;
};

const buildContextMessages = (contexts?: RetrievedContext[]): ChatMessage[] => {
  if (!contexts?.length) {
    return [];
  }

  return contexts.map((context, index) => {
    const metadataLine = describeMetadata(context);
    const citationLine = buildCitationLine(context);
    const lines = [`Context ${index + 1}: ${context.content}`];

    if (metadataLine) {
      lines.push(metadataLine);
    }

    if (citationLine) {
      lines.push(citationLine);
    }

    return {
      role: "system",
      content: lines.join("\n"),
      context: {
        retrievedContexts: [context],
      },
    } satisfies ChatMessage;
  });
};

export class AgentRouter {
  private readonly registry: AgentRegistry;

  constructor(registry: AgentRegistry) {
    this.registry = registry;
  }

  route(request: AgentRoutingRequest): { profile: ResolvedAgentProfile; prompt: RoutedAgentPrompt } {
    const profile = this.registry.resolve(request.mode, request.tenantId);

    const systemMessages: ChatMessage[] = [
      buildPersonaMessage(profile),
      buildGuardrailMessage(profile),
      ...buildAdditionalInstructions(profile),
      ...buildContextMessages(request.context?.retrievedContexts),
    ];

    const userMessages: ChatMessage[] = [
      {
        ...request.userMessage,
        context: request.context,
      },
    ];

    return {
      profile,
      prompt: { systemMessages, userMessages, tools: request.context?.tools },
    };
  }
}
