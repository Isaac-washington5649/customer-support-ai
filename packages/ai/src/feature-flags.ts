import type { AgentMode } from "./agents";

export interface FeatureFlagSnapshot {
  personaPromptVariants?: Partial<Record<AgentMode, string>>;
  experimentalTools?: Partial<Record<AgentMode, string[]>>;
}

export class FeatureFlagRegistry {
  private readonly defaults: FeatureFlagSnapshot;
  private readonly tenantFlags: Map<string, FeatureFlagSnapshot> = new Map();

  constructor(defaultFlags: FeatureFlagSnapshot = {}) {
    this.defaults = defaultFlags;
  }

  registerTenantFlags(tenantId: string, flags: FeatureFlagSnapshot): void {
    this.tenantFlags.set(tenantId, flags);
  }

  resolve(tenantId?: string): FeatureFlagSnapshot {
    const tenantOverrides = tenantId ? this.tenantFlags.get(tenantId) : undefined;

    return {
      personaPromptVariants: {
        ...(this.defaults.personaPromptVariants ?? {}),
        ...(tenantOverrides?.personaPromptVariants ?? {}),
      },
      experimentalTools: {
        ...(this.defaults.experimentalTools ?? {}),
        ...(tenantOverrides?.experimentalTools ?? {}),
      },
    } satisfies FeatureFlagSnapshot;
  }

  getPersonaPromptVariant(mode: AgentMode, tenantId?: string): string | undefined {
    const snapshot = this.resolve(tenantId);
    return snapshot.personaPromptVariants?.[mode];
  }

  getEnabledExperimentalTools(
    mode: AgentMode,
    tenantId?: string,
    availableTools: string[] = [],
  ): string[] {
    const snapshot = this.resolve(tenantId);
    const enabled = snapshot.experimentalTools?.[mode] ?? [];

    if (!enabled.length || !availableTools.length) {
      return [];
    }

    const allowList = new Set(enabled);
    return availableTools.filter((tool) => allowList.has(tool));
  }
}
