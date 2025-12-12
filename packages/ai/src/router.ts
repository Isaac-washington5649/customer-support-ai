import type { ResolvedAgentProfile } from "./agents";
import { AgentRegistry } from "./agents";
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

const buildContextMessages = (contexts?: RetrievedContext[]): ChatMessage[] => {
  if (!contexts?.length) {
    return [];
  }

  return contexts.map((context, index) => ({
    role: "system",
    content: `Context ${index + 1}: ${context.content}`,
    context: {
      retrievedContexts: [context],
    },
  }));
};

export class AgentRouter {
  constructor(private readonly registry: AgentRegistry) {}

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
