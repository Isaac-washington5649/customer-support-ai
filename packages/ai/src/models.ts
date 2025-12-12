import { DEFAULT_AGENT_PROFILES, type AgentMode } from "./agents";

export interface ModelConfig {
  model: string;
  maxOutputTokens: number;
  temperature?: number;
}

export const modeModelConfig = (mode: AgentMode): ModelConfig => {
  const profile = DEFAULT_AGENT_PROFILES[mode];
  if (!profile) {
    throw new Error(`Unknown agent mode ${mode}`);
  }
  return {
    model: profile.model,
    maxOutputTokens: profile.maxOutputTokens,
    temperature: profile.temperature,
  };
};
