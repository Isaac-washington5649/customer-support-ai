# ADR 0003: PostgreSQL Schemas for Multi-Tenant Data

- Status: Proposed
- Date: 2024-06-07

## Context
We need a relational model for users, workspaces, files, documents, chunks, chat sessions, and messages with strong isolation and auditability. Choices include a single public schema with tenant ids, per-tenant databases, or shared database with multiple schemas partitioned by domain.

## Decision
Use a **shared PostgreSQL database** with **domain-specific schemas** and **Row Level Security (RLS)** on tenant-scoped tables. Example schemas:
- `auth`: users, providers, sessions, memberships (user_id, workspace_id, role).
- `files`: files, folders (materialized via path), uploads, object references, quotas.
- `documents`: documents, chunks (with pgvector embeddings), provenance, tags.
- `chat`: chat_sessions, messages, tool_calls, feedback, exports.
- `audit`: audit_logs, rate_limit_counters.

Each table includes `workspace_id`, `created_at`, `updated_at`, soft delete (`deleted_at`) where appropriate, and metadata JSONB for extensibility. Foreign keys tie files → documents → chunks; chat messages include optional `file_id`/`document_id` references for provenance.

## Consequences
- **Pros:** Clear ownership boundaries and least-privilege grants per schema; simpler migrations than per-tenant databases; RLS policies keep multi-tenant safety while enabling cross-schema joins for analytics.
- **Cons:** Requires disciplined migration tooling and permissions; noisy-neighbor risk mitigated by per-workspace quotas and connection pooling. Horizontal sharding can be added later by moving large tenants to dedicated databases without changing application code.
