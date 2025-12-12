export type FileKind = "pdf" | "html" | "docx" | "txt" | "json" | "markdown" | "unknown";

export interface FileMetadata {
  name: string;
  mimeType?: string;
  size: number;
  lastModified?: Date;
  checksum?: string;
  kind: FileKind;
}

export interface ParsedDocument {
  text: string;
  metadata: FileMetadata;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  tokenEstimate: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkingOptions {
  maxCharacters?: number;
  overlap?: number;
}

export interface WorkspaceObjectLocator {
  workspace: string;
  objectKey: string;
  bucket: string;
}
