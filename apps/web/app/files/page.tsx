"use client";

import { useMemo, useState } from "react";
import { Button } from "@customer-support-ai/ui";

import Link from "next/link";

type FileStatus = "pending" | "processing" | "ready" | "failed";
type ViewMode = "grid" | "table";

type FileNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  mimeType?: string;
  size?: number;
  status?: FileStatus;
  parentId?: string | null;
  children?: FileNode[];
  badge?: string;
};

const sampleFiles: FileNode[] = [
  {
    id: "root",
    name: "Workspace",
    type: "folder",
    parentId: null,
    children: [
      {
        id: "policies",
        name: "Policies",
        type: "folder",
        parentId: "root",
        children: [
          {
            id: "return.pdf",
            name: "Return-Policy.pdf",
            type: "file",
            mimeType: "application/pdf",
            size: 280000,
            status: "ready",
            badge: "v2",
          },
          {
            id: "warranty.pdf",
            name: "Warranty.html",
            type: "file",
            mimeType: "text/html",
            size: 102000,
            status: "processing",
          },
        ],
      },
      {
        id: "rma",
        name: "RMA",
        type: "folder",
        parentId: "root",
        children: [
          {
            id: "workflow.md",
            name: "Workflow.md",
            type: "file",
            mimeType: "text/markdown",
            size: 6000,
            status: "ready",
            badge: "fresh",
          },
        ],
      },
      {
        id: "uploads",
        name: "Uploads",
        type: "folder",
        parentId: "root",
        children: [
          {
            id: "transcript.json",
            name: "Call-Transcript.json",
            type: "file",
            mimeType: "application/json",
            size: 42000,
            status: "failed",
          },
        ],
      },
    ],
  },
];

const quota = { used: 3.1, limit: 5 };

function humanFileSize(size?: number) {
  if (!size) return "-";
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, i)).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][i]}`;
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenFiles(node.children) : [])]);
}

function findPath(nodes: FileNode[], id: string): FileNode[] {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const path: FileNode[] = [];
  let current: FileNode | undefined = map.get(id);
  while (current) {
    path.unshift(current);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return path;
}

function Breadcrumbs({ currentId, onNavigate }: { currentId: string; onNavigate: (id: string) => void }) {
  const path = useMemo(() => findPath(flattenFiles(sampleFiles), currentId), [currentId]);
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
      {path.map((node, index) => (
        <div key={node.id} className="flex items-center gap-2">
          {index > 0 ? <span className="text-gray-400">/</span> : null}
          <button className="hover:text-blue-600" onClick={() => onNavigate(node.id)}>
            {node.name}
          </button>
        </div>
      ))}
    </nav>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const styles: Record<FileStatus, string> = {
    pending: "bg-amber-100 text-amber-800",
    processing: "bg-blue-100 text-blue-800",
    ready: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}

function FileGrid({ files, onSelect }: { files: FileNode[]; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {files.map((file) => (
        <button
          key={file.id}
          onClick={() => onSelect(file.id)}
          className="flex h-32 flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="truncate text-sm font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{file.mimeType}</p>
            </div>
            {file.status ? <StatusBadge status={file.status} /> : null}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{humanFileSize(file.size)}</span>
            {file.badge ? (
              <span className="rounded bg-gray-900 px-2 py-1 text-[10px] font-semibold uppercase text-white">{file.badge}</span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}

function FileTable({ files, onToggle, selectedIds }: { files: FileNode[]; onToggle: (id: string) => void; selectedIds: Set<string> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Select</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Size</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {files.map((file) => (
            <tr key={file.id} className="hover:bg-blue-50/50">
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(file.id)}
                  onChange={() => onToggle(file.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-gray-900">{file.name}</div>
                {file.badge ? <div className="text-xs text-gray-500">Badge: {file.badge}</div> : null}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{file.mimeType || "-"}</td>
              <td className="px-4 py-3">{file.status ? <StatusBadge status={file.status} /> : null}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{humanFileSize(file.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FilesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [currentFolder, setCurrentFolder] = useState("root");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allFiles = useMemo(() => flattenFiles(sampleFiles), []);
  const currentChildren = useMemo(
    () => allFiles.filter((file) => file.parentId === currentFolder),
    [allFiles, currentFolder],
  );

  const visible = useMemo(() => {
    const filtered = currentChildren.filter((file) => file.name.toLowerCase().includes(search.toLowerCase()));
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [currentChildren, search]);

  const selectedIds = selected;

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const names = Array.from(event.dataTransfer.files).map((file) => file.name);
    alert(`Queued uploads for ${names.join(", ")}`);
  };

  const handleToggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Knowledge base</p>
            <h1 className="text-2xl font-bold text-gray-900">Content library</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1">
              <span>Storage</span>
              <span className="font-semibold text-gray-900">{quota.used} / {quota.limit} GB</span>
            </div>
            <Button variant="primary">New folder</Button>
            <Button variant="secondary">Upload</Button>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-600">Manage documents, monitor ingestion, and explore previews across every workspace folder.</p>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-8 py-6">
        <div
          className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-600 shadow-sm"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          Drag & drop files to upload or <span className="font-semibold text-blue-600">browse</span> to select. Uploads will enqueue ingestion and show status per file.
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Breadcrumbs currentId={currentFolder} onNavigate={setCurrentFolder} />
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search file names"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
            <Button variant="ghost" onClick={() => setViewMode(viewMode === "table" ? "grid" : "table")}>Toggle {viewMode === "table" ? "grid" : "table"}</Button>
            <Button variant="ghost" disabled={selectedIds.size === 0}>Download selected</Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:col-span-3">
            <h3 className="text-sm font-semibold text-gray-700">Folders</h3>
            <div className="space-y-1">
              {allFiles
                .filter((file) => file.type === "folder")
                .map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setCurrentFolder(folder.id)}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                      folder.id === currentFolder ? "bg-blue-100 text-blue-800" : "text-gray-700"
                    }`}
                  >
                    <span>{folder.name}</span>
                    <span className="text-xs text-gray-500">{folder.children?.length || 0}</span>
                  </button>
                ))}
            </div>
          </aside>

          <section className="col-span-12 space-y-4 lg:col-span-9">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{visible.length} items</span>
                <span className="rounded bg-gray-100 px-2 py-1">Multi-select enabled</span>
                <span className="rounded bg-gray-100 px-2 py-1">Sorted by name</span>
              </div>
              <Link href="#" className="text-blue-600 hover:underline">
                View ingestion queue
              </Link>
            </div>

            {viewMode === "grid" ? (
              <FileGrid files={visible.filter((file) => file.type === "file")} onSelect={handleToggleSelection} />
            ) : (
              <FileTable files={visible.filter((file) => file.type === "file")} onToggle={handleToggleSelection} selectedIds={selectedIds} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
