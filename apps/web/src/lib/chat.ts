import type { ChatSession, SessionExportFormat } from "../types/chat";

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function buildExportPayload(session: ChatSession, format: SessionExportFormat) {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push(`Mode: ${session.mode}`);
  lines.push("");
  session.messages.forEach((message) => {
    const prefix = message.role === "assistant" ? "Assistant" : "User";
    const content = format === "md" ? message.content : message.content.replace(/\n+/g, " ");
    lines.push(`${prefix} (${formatTime(message.createdAt)}):`);
    lines.push(content);
    if (message.citations?.length) {
      lines.push(`Citations: ${message.citations.join(", ")}`);
    }
    if (message.attachments?.length) {
      lines.push(`Attachments: ${message.attachments.map((a) => a.name).join(", ")}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

export function saveExport(session: ChatSession, format: SessionExportFormat) {
  const payload = buildExportPayload(session, format);
  const blob = new Blob([payload], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${session.title || "chat-session"}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
