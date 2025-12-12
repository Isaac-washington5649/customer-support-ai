import type { AgentMode } from "./agents";
import type { PromptContext, ToolCallPreparation } from "./context";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  context?: PromptContext;
}

export interface AgentRoutingRequest {
  mode: AgentMode;
  tenantId?: string;
  userMessage: ChatMessage;
  context?: PromptContext;
}

export interface RoutedAgentPrompt {
  systemMessages: ChatMessage[];
  userMessages: ChatMessage[];
  tools?: ToolCallPreparation[];
}
