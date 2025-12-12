# Assistant Chat and Knowledge Store Design

## Overview
This document outlines the personas, UX flows, architecture, and accessibility requirements for the multi-persona assistant chat and knowledge store. It targets the apps/web front end, apps/api backend, packages/ai orchestration, packages/ingestion pipeline, and packages/ui primitives.

## Personas and Modes
We support four primary personas exposed as chat modes. Each mode has distinct tone, data access, and safety controls loaded via the agent registry.

| Mode | Audience | Voice & Constraints | Tooling | Guardrails |
| --- | --- | --- | --- | --- |
| Freshdesk | Customer support agents handling tickets | Friendly, concise, cites sources, proposes next steps | Knowledge search, file lookup, ticket context hooks | No PII in prompts, auto-redact emails in responses |
| Actor Slack | Individual talent asking questions in Slack | Casual, first person, short action items | Knowledge search, file lookup, persona memory | Blocks contract/legal advice; steers to casting director |
| Casting Director Slack | Casting directors coordinating with talent reps | Professional, directive, lists options with pros/cons | Knowledge search, file lookup, task queue scaffolding | Warns when data is stale; avoids irreversible edits |
| Talent Representative Slack | Talent managers coordinating offers | Formal, risk-aware, provides disclaimers | Knowledge search, file lookup, export | Flags sensitive terms and rate-limits outbound summaries |

### Persona Behavior
- **Message envelopes:** Each agent prepends a system summary of the request, includes the workspace scope, and appends safety reminders and citation requirements.
- **Routing:** Mode switcher selects agent template and model caps; knowledge search is scoped by workspace and ACL. Agents may request tools (knowledge search, file lookup, future task execution) via tool-calling scaffold.
- **Safety:** All personas include adversarial prompt filters, PII redaction, and citation requirements when knowledge store is consulted.

## Chat Flows
1. User selects a mode from the left navigation (default: Freshdesk).
2. Thread displays existing conversation; user composes message. Messages show states: drafting → sending → streaming → complete; failed state exposes "Retry" and "Regenerate".
3. Router loads persona template and dispatches to OpenAI streaming client with retries/timeouts. Tool calls fetch knowledge chunks with citations and file metadata.
4. Responses render with inline citations. Message actions: copy, regenerate, thumbs up/down, and view sources used.
5. Conversation metadata (title, mode, timestamps, files referenced) is persisted for search, rename, export (.md/.txt), and future retrieval.

## Knowledge Store Flows
1. Upload: user drags files/folders or uses upload button; files are streamed to object storage with resumable chunks.
2. Ingestion pipeline enqueues parse jobs, extracts text from PDF/HTML/DOCX/TXT/JSON/MD, creates document and chunk rows, embeds with pgvector, and attaches provenance (source file, page/section, hashes).
3. Search: hybrid vector + keyword with filters (folder, tag, mime). Reranking selects top N chunks for the agent context with metadata for citations.
4. Maintenance: delete/replace cleans up objects, document rows, chunks, vectors, and provenance; dedupe by content hash; quotas per workspace enforced.

## Wireframes
Textual wireframes show layout intent; final UI will use packages/ui primitives.

### Mode Switcher + History (Left Rail)
```
+------------------------------------------------+
| Workspace: Acme Casting          [Add Workspace]|
| Modes:                                            |
| > Freshdesk (active)                              |
|   Actor (Slack)                                   |
|   Casting Director (Slack)                        |
|   Talent Representative (Slack)                   |
|                                                  |
| Recent Conversations (search box)                |
| - Ticket #4521 follow-up [•••]                   |
| - Casting brief Q&A [•••]                        |
| - Talent offer draft [•••]                       |
| [New Chat]                                       |
+------------------------------------------------+
```

### Chat Thread + Message Actions (Center)
```
+-------------------------------------------------------------+
| [User] 10:02  "Summarize ticket #4521"                      |
|  - Actions: Copy | Edit title | Delete                      |
|  Status: Sending... / Streaming... / Failed (Retry)         |
|                                                             |
| [Assistant - Freshdesk] 10:03                                |
|  Content... [1][2]                                          |
|  Inline actions: Copy | Regenerate | 👍 | 👎 | View sources  |
+-------------------------------------------------------------+
```

### Upload / Progress
```
[Upload files] [Upload folder] [Paste text]
Drag files here
---------------------------------------------------
Name            Size   Status     Progress  Actions
contract.pdf    2.3MB  Uploading  45%       Cancel
notes.docx      800KB  Queued     -         Remove
scene.md        50KB   Processing spinner   View log
```

### File Browser (Tree + Grid)
```
Breadcrumbs: /Workspace Files / Casting Calls / 2024

Tree (ARIA tree):
> Workspace Files
  > Casting Calls
    - Feb
    - Mar
  > Talent Assets
    - Reels
    - Headshots

Grid (ARIA grid):
Name           Type     Tags        Updated    Status
[ ] brief.pdf  File     casting     2d ago     Indexed
[ ] reels/     Folder   video       1w ago     12 items
[ ] offer.docx File     legal,offer 1h ago     Processing
```

### Sources-Used Sidebar (Right Rail)
```
Sources
1. brief.pdf (p.2)  • relevance 0.82  • preview
2. contract.docx (§3)  • relevance 0.77  • open
3. faq.md (#shipping)  • relevance 0.70  • copy citation
```

## Accessibility Specifications
- **Focus order:** Left navigation (mode switcher → conversation search → conversation list → new chat), main editor (composer → send), message actions (copy → regenerate → thumbs up → thumbs down → view sources), right rail (sources list items). Upload dialog focus: trigger → file chooser → progress rows → close.
- **Keyboard upload flow:** `Tab` to upload button, `Space/Enter` to open chooser, select files, `Esc` cancels, `Enter` confirms. Drag-and-drop target is reachable via `Tab` and uses `Enter` to open chooser as alternative. Progress table rows expose `Delete`/`Cancel` via `Enter` and announce status updates.
- **ARIA roles:** Tree uses `role="tree"` on container, `role="treeitem"` on nodes with `aria-expanded`; keyboard arrows navigate. Grid uses `role="grid"` with `aria-colcount`/`aria-rowcount`; rows use `role="row"`, cells `role="gridcell"`, headers `role="columnheader"`. Upload progress table uses `role="table"` with `aria-live="polite"` on status cells. Chat list uses `role="list"`/`role="listitem"`; message actions grouped via `role="group"`.

## Architecture and Service Boundaries
- **apps/web (Next.js):** UI shells (split panes), chat thread, mode switcher, file browser, and export/search experiences. Uses packages/ui for shared components and consumes apps/api via tRPC/REST.
- **apps/api:** Authenticated API for chat sessions, messages, file metadata, search, export, and ingestion triggers. Enforces workspace ACLs and rate limits; emits audit logs and metrics.
- **packages/ai:** Agent registry with persona templates and safety envelopes; router selects agents per mode; OpenAI client handles streaming, retries, and tracing.
- **packages/ingestion:** Upload handling, parsers, chunking, embedding, dedupe, cleanup, and provenance tracking. Publishes ingestion events and status for UI.
- **packages/ui:** Reusable primitives (panels, tree/grid, progress, toast, badge) with accessibility baked in.

## Data Model Overview
- **Users:** id, email, name, auth provider, role, audit metadata.
- **Workspaces:** id, name, slug, quotas, feature flags; many-to-many user memberships with roles (admin/agent/viewer).
- **Files:** id, workspace_id, folder_path, mime, size, checksum, status, object_key, created_at, updated_at, deleted_at.
- **Documents:** id, file_id, workspace_id, title, language, source_url, version, processing_state.
- **Chunks:** id, document_id, embedding vector, text, start_offset, end_offset, page/section, hash, metadata (tags, mime, folder), citations provenance.
- **Chat Sessions:** id, workspace_id, mode, title, created_by, renamed_at, exported_at, last_message_at.
- **Messages:** id, session_id, sender (user/agent/tool), state (sending/streaming/failed/completed), body, tool_calls, citations, rating, created_at.
- **Audit Logs:** id, workspace_id, actor_id, action, subject_type/id, metadata, timestamp.

## Storage, Env, and Secrets
- **Database:** PostgreSQL with pgvector for embeddings; RLS for workspace isolation; schema separated by domain (auth, files, documents, chat).
- **Object Storage:** S3-compatible bucket for uploads, previews, and exports with per-workspace prefixes.
- **Env management:** `.env.local` (not committed) validated via `@t3-oss/env-nextjs` for web and API, shared `env.mjs` module for packages; ingestion workers read `.env` via `dotenv`.
- **Secrets:** Managed via platform secret store (e.g., Vercel/Env vars); rotation playbook: dual-write new keys, deploy with feature flag gating, revoke old keys after validation; avoid logging secrets and scrub from tracing spans.

