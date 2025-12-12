# Deployment analysis

## Repository layout
- **Apps**: `apps/web` (Next.js 16, App Router) and `apps/api` (TypeScript services, Prisma, BullMQ workers). Shared packages live under `packages/` (`ui`, `ai`, `ingestion`).
- **Workflows**: existing CI at `.github/workflows/ci.yml` runs lint/unit/e2e with Playwright.
- **Docs**: architecture and ops context already documented in `README.md` and `docs/deployment-topology.md`.

## Tech stack and tooling
- **Package manager**: npm workspaces (no lockfile committed yet; `npm ci` preferred once a lockfile is present).
- **Languages**: TypeScript across all workspaces with ESLint/Prettier and Vitest/Playwright for testing.
- **Frontend**: Next.js 16 (output set to `standalone` for container builds) with env validation via `@t3-oss/env-nextjs`.
- **Backend**: Prisma + PostgreSQL (pgvector), BullMQ workers on Redis, S3-compatible storage helpers, telemetry hooks (`@opentelemetry/*`).
- **Runtime expectations**:
  - API/worker need PostgreSQL, Redis, and S3-compatible storage.
  - Optional OTLP endpoint for traces/metrics.

## Environment variables
- **Web** (`apps/web/src/env.ts`): `NODE_ENV`, `API_SECRET`, `NEXT_PUBLIC_API_URL`.
- **API** (`apps/api/src/env.ts`): `NODE_ENV`, `PORT`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PREFIX`, `REDIS_URL`, `QUEUE_PREFIX`, `INGESTION_CONCURRENCY`, `DELETION_CONCURRENCY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`.

## External dependencies
- **PostgreSQL** with pgvector extension.
- **Redis** for BullMQ.
- **S3-compatible storage** (MinIO/S3), using path-style access by default.
- **Telemetry** (optional): OTLP collector endpoint.

## Existing deployment-related assets
- CI workflow covering lint/tests/E2E (`.github/workflows/ci.yml`).
- Architectural/deployment context: `docs/deployment-topology.md` and `README.md` (environment validation, migration notes).

## Gaps identified
- No `.env.example` committed.
- No Dockerfiles or compose for local parity.
- No deployment docs (analysis/decisions/steps), rollback, or secrets guide.
- CI uses `npm install` and lacks type-check/build stages; no deploy/preview pipelines.
- No platform config (Fly/Vercel/etc.) or health-check guidance yet.
