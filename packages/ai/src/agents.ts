import { FeatureFlagRegistry } from "./feature-flags";

export type AgentMode = "assistant" | "coach" | "critic" | "researcher";

export interface AgentProfile {
  mode: AgentMode;
  name: string;
  persona: string;
  systemPrompt: string;
  guardrails: string[];
  promptVariants?: Record<string, AgentPromptVariant>;
  defaultTools?: string[];
  experimentalTools?: string[];
  model: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface TenantAgentOverrides {
  systemPrompt?: string;
  persona?: string;
  guardrails?: string[];
  additionalInstructions?: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface TenantScopedOverrides {
  tenantId: string;
  overrides: Partial<Record<AgentMode, TenantAgentOverrides>>;
}

export interface ResolvedAgentProfile extends AgentProfile {
  tenantId?: string;
  additionalInstructions?: string;
  promptVariant?: string;
  enabledTools?: string[];
}

export interface AgentPromptVariant {
  persona: string;
  systemPrompt: string;
  guardrails?: string[];
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
    promptVariants: {
      concise_v2: {
        persona:
          "A concise but empathetic support partner who grounds every reply in documented facts and next best actions.",
        systemPrompt:
          "Guide customers efficiently. Show numbered steps, cite knowledge articles when used, and always propose a concrete next action such as sharing a link or creating a ticket.",
      },
    },
    defaultTools: ["search_kb", "create_ticket"],
    experimentalTools: ["summarize_conversation", "collect_feedback"],
    model: "gpt-4o-mini",
    maxOutputTokens: 800,
    temperature: 0.3,
  },
  coach: {
    mode: "coach",
    name: "Customer Success Coach",
    persona:
      "A proactive success coach focused on guiding users to successful outcomes and product adoption.",
    systemPrompt:
      "You help users adopt the product effectively. Offer step-by-step guidance, best practices, and proactive suggestions.",
    guardrails: baseGuardrails,
    promptVariants: {
      adoption_playbook: {
        persona:
          "A motivational onboarding coach who personalizes guidance by customer segment and highlights success metrics.",
        systemPrompt:
          "Share numbered playbooks with time-to-value estimates, surface adoption risks, and suggest check-ins only when value is clear.",
      },
    },
    defaultTools: ["send_nps", "schedule_checkin"],
    experimentalTools: ["health_score_lookup"],
    model: "gpt-4o-mini",
    maxOutputTokens: 600,
    temperature: 0.5,
  },
  critic: {
    mode: "critic",
    name: "Response Quality Critic",
    persona:
      "A meticulous reviewer ensuring responses are accurate, safe, and aligned with policy.",
    systemPrompt:
      "You review draft responses for clarity, accuracy, and safety. Suggest concrete edits and cite policies when relevant.",
    guardrails: baseGuardrails,
    promptVariants: {
      policy_forward: {
        persona:
          "A compliance-minded reviewer that insists every recommendation is auditable and policy-aligned.",
        systemPrompt:
          "Highlight blocking risks first, then required wording changes. Link every required change to the supporting policy snippet.",
      },
    },
    defaultTools: ["policy_lookup"],
    experimentalTools: ["rewrite_with_policy"],
    model: "gpt-4o-mini",
    maxOutputTokens: 400,
    temperature: 0.2,
  },
  researcher: {
    mode: "researcher",
    name: "Product Research Analyst",
    persona:
      "An investigator who digs into product documentation and changelogs to provide detailed findings.",
    systemPrompt:
      "You gather and summarize information from knowledge bases and changelogs. Present findings with citations and next steps.",
    guardrails: baseGuardrails,
    promptVariants: {
      changelog_first: {
        persona:
          "An analyst who prioritizes recency, change impact, and regression risks when summarizing product updates.",
        systemPrompt:
          "Lead with what changed, when, and who is affected. Flag risky regressions and propose test or mitigation steps with citations.",
      },
    },
    defaultTools: ["search_kb", "search_release_notes"],
    experimentalTools: ["summarize_changelog", "trend_analyzer"],
    model: "gpt-4o-mini",
    maxOutputTokens: 900,
    temperature: 0.4,
  },
};

export class AgentRegistry {
  private readonly defaults: Record<AgentMode, AgentProfile>;
  private readonly tenantOverrides: Map<string, Partial<Record<AgentMode, TenantAgentOverrides>>> =
    new Map();
  private readonly featureFlags: FeatureFlagRegistry;

  constructor(
    defaultProfiles: Record<AgentMode, AgentProfile> = DEFAULT_AGENT_PROFILES,
    featureFlags: FeatureFlagRegistry = new FeatureFlagRegistry(),
  ) {
    this.defaults = defaultProfiles;
    this.featureFlags = featureFlags;
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
    const promptVariantKey = this.featureFlags.getPersonaPromptVariant(mode, tenantId);
    const promptVariant =
      promptVariantKey && baseProfile.promptVariants
        ? baseProfile.promptVariants[promptVariantKey]
        : undefined;

    const experimentalTools = this.featureFlags.getEnabledExperimentalTools(
      mode,
      tenantId,
      baseProfile.experimentalTools,
    );
    const enabledTools = [
      ...(baseProfile.defaultTools ?? []),
      ...experimentalTools,
    ];

    return {
      ...baseProfile,
      tenantId,
      systemPrompt: overrides?.systemPrompt ?? promptVariant?.systemPrompt ?? baseProfile.systemPrompt,
      guardrails: overrides?.guardrails ?? promptVariant?.guardrails ?? baseProfile.guardrails,
      persona: overrides?.persona ?? promptVariant?.persona ?? baseProfile.persona,
      promptVariant: promptVariantKey,
      enabledTools,
      experimentalTools,
      additionalInstructions: overrides?.additionalInstructions,
      model: overrides?.model ?? baseProfile.model,
      maxOutputTokens: overrides?.maxOutputTokens ?? baseProfile.maxOutputTokens,
      temperature: overrides?.temperature ?? baseProfile.temperature,
    };
  }
}
