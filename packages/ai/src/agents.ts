export type AgentMode = "assistant" | "coach" | "critic" | "researcher";

export interface AgentProfile {
  mode: AgentMode;
  name: string;
  persona: string;
  systemPrompt: string;
  guardrails: string[];
  defaultTools?: string[];
}

export interface TenantAgentOverrides {
  systemPrompt?: string;
  persona?: string;
  guardrails?: string[];
  additionalInstructions?: string;
}

export interface TenantScopedOverrides {
  tenantId: string;
  overrides: Partial<Record<AgentMode, TenantAgentOverrides>>;
}

export interface ResolvedAgentProfile extends AgentProfile {
  tenantId?: string;
  additionalInstructions?: string;
}

const baseGuardrails: string[] = [
  "Do not provide medical, legal, or financial advice.",
  "Adhere to the customer's privacy and never reveal sensitive data.",
  "Refuse to fabricate citations or invent product capabilities.",
  "De-escalate conversations and remain courteous at all times.",
];

export const DEFAULT_AGENT_PROFILES: Record<AgentMode, AgentProfile> = {
  assistant: {
    mode: "assistant",
    name: "Helpful Support Assistant",
    persona:
      "A calm and knowledgeable support specialist who answers succinctly and clearly.",
    systemPrompt:
      "You are a frontline support assistant for a SaaS product. Provide concise answers and anticipate follow-up questions.",
    guardrails: baseGuardrails,
    defaultTools: ["search_kb", "create_ticket"],
  },
  coach: {
    mode: "coach",
    name: "Customer Success Coach",
    persona:
      "A proactive success coach focused on guiding users to successful outcomes and product adoption.",
    systemPrompt:
      "You help users adopt the product effectively. Offer step-by-step guidance, best practices, and proactive suggestions.",
    guardrails: baseGuardrails,
    defaultTools: ["send_nps", "schedule_checkin"],
  },
  critic: {
    mode: "critic",
    name: "Response Quality Critic",
    persona:
      "A meticulous reviewer ensuring responses are accurate, safe, and aligned with policy.",
    systemPrompt:
      "You review draft responses for clarity, accuracy, and safety. Suggest concrete edits and cite policies when relevant.",
    guardrails: baseGuardrails,
    defaultTools: ["policy_lookup"],
  },
  researcher: {
    mode: "researcher",
    name: "Product Research Analyst",
    persona:
      "An investigator who digs into product documentation and changelogs to provide detailed findings.",
    systemPrompt:
      "You gather and summarize information from knowledge bases and changelogs. Present findings with citations and next steps.",
    guardrails: baseGuardrails,
    defaultTools: ["search_kb", "search_release_notes"],
  },
};

export class AgentRegistry {
  private readonly defaults: Record<AgentMode, AgentProfile>;
  private readonly tenantOverrides: Map<string, Partial<Record<AgentMode, TenantAgentOverrides>>> =
    new Map();

  constructor(defaultProfiles: Record<AgentMode, AgentProfile> = DEFAULT_AGENT_PROFILES) {
    this.defaults = defaultProfiles;
  }

  registerTenantOverrides({ tenantId, overrides }: TenantScopedOverrides): void {
    this.tenantOverrides.set(tenantId, overrides);
  }

  resolve(mode: AgentMode, tenantId?: string): ResolvedAgentProfile {
    const baseProfile = this.defaults[mode];

    if (!baseProfile) {
      throw new Error(`Unknown agent mode: ${mode}`);
    }
    const tenantProfile = tenantId ? this.tenantOverrides.get(tenantId) : undefined;
    const overrides = tenantProfile?.[mode];

    return {
      ...baseProfile,
      tenantId,
      systemPrompt: overrides?.systemPrompt ?? baseProfile.systemPrompt,
      guardrails: overrides?.guardrails ?? baseProfile.guardrails,
      persona: overrides?.persona ?? baseProfile.persona,
      additionalInstructions: overrides?.additionalInstructions,
    };
  }
}
