export type ToolCallKind = "knowledge" | "file" | "task";

export type ToolCall = {
  id: string;
  type: ToolCallKind;
  request: string;
  response?: string;
  status: "pending" | "running" | "complete" | "failed";
};

export type Attachment = { name: string; type: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  state: "idle" | "sending" | "streaming" | "failed";
  citations?: string[];
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
};

export type ChatSession = {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type SessionExportFormat = "md" | "txt";
