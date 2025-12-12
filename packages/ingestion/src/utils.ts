import { createHash } from "node:crypto";

import { type FileKind } from "./types";

export function fileKindFromName(name: string, mimeType?: string): FileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".html") || lower.endsWith(".htm") || mimeType === "text/html") return "html";
  if (lower.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return "docx";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".json") || mimeType === "application/json") return "json";
  if (lower.endsWith(".txt") || mimeType?.startsWith("text/")) return "txt";
  return "unknown";
}

export function checksum(buffer: Buffer, algorithm: "sha256" | "md5" = "sha256") {
  return createHash(algorithm).update(buffer).digest("hex");
}
