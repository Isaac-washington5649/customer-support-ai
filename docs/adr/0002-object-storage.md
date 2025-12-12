# ADR 0002: Object Storage for Files and Previews

- Status: Proposed
- Date: 2024-06-07

## Context
We ingest user uploads (PDF, HTML, DOCX, TXT, JSON, MD) and produce previews/exports. Options: local disk, cloud block storage, or S3-compatible object storage (e.g., AWS S3, R2, MinIO).

Key needs: durability, presigned upload/download, lifecycle policies for quotas, multi-region portability, and integration with ingestion workers.

## Decision
Adopt **S3-compatible object storage** with per-workspace prefixes. Use presigned URLs for direct-to-bucket uploads/downloads and server-side encryption. Store canonical uploads, normalized text, previews, and exports under distinct prefixes; include content hash in object keys to enable dedupe and cache reuse.

## Consequences
- **Pros:** Durable and cost-effective; works with cloud and self-hosted deployments; presigned URLs keep API stateless; lifecycle rules can expire previews and soft-deleted objects.
- **Cons:** Requires network access from workers; eventual consistency on list operations; additional latency compared to local disk (mitigated via CDN for downloads and chunked uploads).
