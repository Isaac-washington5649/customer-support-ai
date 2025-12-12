/* eslint-disable no-unused-vars */
import { JSDOM } from "jsdom";

import { type ChunkingOptions, type FileMetadata, type ParsedDocument } from "./types";
import { chunkText } from "./chunking";
import { fileKindFromName } from "./utils";

async function safeImport<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    console.warn("[ingestion] optional parser unavailable", error);
    return null;
  }
}

export function extractMetadata(input: {
  name: string;
  mimeType?: string;
  size: number;
  lastModified?: number;
  checksum?: string;
}): FileMetadata {
  return {
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    lastModified: input.lastModified ? new Date(input.lastModified) : undefined,
    checksum: input.checksum,
    kind: fileKindFromName(input.name, input.mimeType),
  };
}

export async function parseToText(buffer: Buffer, metadata: FileMetadata): Promise<string> {
  switch (metadata.kind) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "html":
      return parseHtml(buffer.toString("utf8"));
    case "json":
      return JSON.stringify(JSON.parse(buffer.toString("utf8")), null, 2);
    case "markdown":
    case "txt":
      return buffer.toString("utf8");
    default:
      return buffer.toString("utf8");
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
    const pdf = await safeImport(() => import("pdf-parse"));
    if (pdf && "default" in pdf) {
      const result = await (
        pdf as unknown as {
          default: (_buffer: Buffer) => Promise<{ text: string }>;
        }
      ).default(buffer);
      return result.text;
    }
  return "Unable to parse PDF in this environment.";
}

async function parseDocx(buffer: Buffer): Promise<string> {
    const mammoth = await safeImport(() => import("mammoth"));
    if (mammoth && "extractRawText" in mammoth) {
      const result = await (
        mammoth as unknown as {
          extractRawText: (_options: { buffer: Buffer }) => Promise<{ value: string }>;
        }
      ).extractRawText({
        buffer,
      });
      return result.value;
    }
  return "Unable to parse DOCX in this environment.";
}

function parseHtml(content: string): string {
  const dom = new JSDOM(content);
  return dom.window.document.body.textContent || "";
}

export async function parseDocument(
  buffer: Buffer,
  file: Parameters<typeof extractMetadata>[0],
  options: ChunkingOptions = {},
): Promise<{ document: ParsedDocument; chunks: ReturnType<typeof chunkText> }> {
  const metadata = extractMetadata(file);
  const text = await parseToText(buffer, metadata);
  const document: ParsedDocument = { text, metadata };
  const chunks = chunkText(text, metadata, options);

  return { document, chunks };
}
