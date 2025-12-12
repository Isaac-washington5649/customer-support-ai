# ADR 0001: Vector Store Selection

- Status: Proposed
- Date: 2024-06-07

## Context
We need a vector store to power hybrid retrieval for chat personas. Options considered:
- **PostgreSQL + pgvector extension** deployed with the primary relational database.
- **Hosted vector database** (Pinecone/Weaviate/Qdrant Cloud) managed separately.

Evaluation criteria: operational overhead, latency close to application data, consistency with transactional metadata, ability to enforce workspace isolation (RLS), and cost for multi-tenant workloads.

## Decision
Choose **PostgreSQL with pgvector** co-located with the primary application database. Use RLS to enforce workspace isolation and shared connections via PgBouncer. Index embeddings with `ivfflat` and tune `lists` per table size. Keep keyword search via `tsvector` in the same database to enable hybrid queries.

## Consequences
- **Pros:** Single datastore simplifies transactions between chat messages, documents, and chunks; RLS and schemas protect tenants; cost-effective and portable across environments; backups cover both relational and vector data.
- **Cons:** Requires tuning autovacuum and `work_mem` for vector indexes; vertical scaling may be needed before sharding. If latency becomes an issue, we can add read replicas with pgvector or migrate heavy tenants to a dedicated vector cluster while keeping the schema compatible.
