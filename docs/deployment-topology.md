# Deployment topology

The platform is split into API and worker processes so uploads, ingestion, and deletions can be processed concurrently without blocking user-facing traffic.

## Core services

- **API (`apps/api`)**
  - Connects to Postgres for chat sessions, documents, and ingestion metadata.
  - Relies on S3-compatible object storage for uploaded source files.
  - Exposes streaming chat responses via the shared OpenAI client helpers.
- **Workers (`npm run worker --workspace api`)**
  - BullMQ workers backed by Redis (`REDIS_URL`) for ingestion and deletion queues.
  - Ingestion workers download objects from S3 and chunk, embed, and finalize documents.
  - Deletion workers remove chunks/documents and optionally purge the backing object, pushing failures into DLQs.
- **Redis**
  - Required for BullMQ queues, schedulers, and DLQ routing. Configure the prefix with `QUEUE_PREFIX` to isolate environments.
- **Postgres**
  - Stores documents, chunks (with `contentHash` and embeddings), upload sessions, and embedding cache entries.
- **Object storage (S3-compatible)**
  - Buckets are namespaced per workspace; multipart uploads are used for large files with resumable sessions persisted in Postgres.

## Recommended process layout

| Component | Scaling guidance | Notes |
| --- | --- | --- |
| API server | Horizontal pods/containers behind a load balancer | Should be stateless; relies on Redis/Postgres/S3. |
| Ingestion workers | At least one replica per environment; tune with `INGESTION_CONCURRENCY` | Handles parsing, chunking, embedding, and status updates. |
| Deletion workers | Scale separately from ingestion; tune with `DELETION_CONCURRENCY` | Removes chunks/documents and optional file purges. |
| Redis | Single instance or managed cluster | Powers BullMQ queues, schedulers, and DLQs. |
| Postgres | Managed service with pgvector extension | Stores all structured metadata and embedding caches. |
| S3-compatible storage | Managed bucket service | Used for uploads and resumable multipart sessions. |

## Operational notes

- DLQs (`ingestion:dlq`, `deletion:dlq`) capture failed jobs; monitor and replay as needed.
- Embeddings are cached by `contentHash` and can be reused across workspaces when identical chunks appear.
- Multipart uploads are tracked in the `UploadSession` table and can be resumed as long as the session record exists.
