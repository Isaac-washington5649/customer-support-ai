# Customer Support AI

Monorepo for the customer-support AI stack. The workspace now separates the Next.js frontend and API while sharing UI, ingestion, and AI helpers through packages.

## Project layout
- `apps/web`: Next.js app router frontend.
- `apps/api`: API layer with Prisma schema, migrations, and storage bootstrap.
- `packages/ui`: Shared React components.
- `packages/ingestion`: S3-compatible storage helpers (bucket naming, ACL enforcement).
- `packages/ai`: Shared AI utilities and embedding metadata.

## Environment configuration
Typed environment validation is handled with [`@t3-oss/env-nextjs`](https://github.com/t3-oss/t3-env/tree/next) for the web app and [`@t3-oss/env-core`](https://github.com/t3-oss/t3-env/tree/main/packages/core) for the API. Variables are loaded via `dotenv` and validated on startup to avoid missing or malformed configuration.

1. Copy `.env.example` to `.env` and fill in the values for both apps.
2. Web runtime variables live in `apps/web/src/env.ts` and must be prefixed with `NEXT_PUBLIC_` to be exposed to the client.
3. API runtime variables are declared in `apps/api/src/env.ts` and include database and storage configuration.

### Secrets rotation
- Prefer short-lived credentials (IAM roles, OIDC-issued tokens) for CI and production instead of long-lived keys.
- Store secrets in a managed vault (e.g., AWS Secrets Manager or HashiCorp Vault) and inject them at deploy time rather than committing to `.env`.
- Rotate database passwords and storage keys on a schedule; keep two valid credentials during rotation and update the env files/secret stores in lockstep with application restarts.
- Update the `.env` values locally using `.env.example` as the contract, then regenerate Prisma clients with `npm run dev:api` when database URLs change.

## Development
Install dependencies from the repo root (npm workspaces will install for all packages):

```bash
npm install
```

Run the frontend and API independently:

```bash
npm run dev:web   # starts Next.js in apps/web
npm run dev:api   # runs the API bootstrap using env and Prisma
npm run lint      # lints all workspaces
```

## Database and migrations
Postgres with the `pgvector` extension backs embeddings and content storage.

- Prisma schema lives at `apps/api/prisma/schema.prisma` and defines users, workspaces, files, documents, chunks, chat sessions, messages, folders/tags, and quotas.
- A starter migration with pgvector and IVFFLAT indexing lives in `apps/api/prisma/migrations/000_init/migration.sql`.
- Seed placeholder: `apps/api/prisma/seed.ts`.

Common commands (from repo root):

```bash
npm run prisma:generate --workspace api  # generate client after env updates
npm run prisma:migrate --workspace api   # run migrations in dev (uses DATABASE_URL)
```

## Object storage
The ingestion package provides S3 helpers to keep tenant buckets consistent:

- Bucket names follow `<prefix>-<workspace>` using `workspaceBucketName`.
- `ensureWorkspaceBucket` creates the bucket (if missing) and applies the desired ACL.
- Configure endpoint/region/credentials via the API env vars (`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PREFIX`).

## Deployment
- Deployment analysis and decisions: [`docs/deployment/ANALYSIS.md`](docs/deployment/ANALYSIS.md) and [`docs/deployment/DECISIONS.md`](docs/deployment/DECISIONS.md)
- Step-by-step rollout guide: [`docs/deployment/DEPLOYMENT.md`](docs/deployment/DEPLOYMENT.md)
- Secrets and rollback procedures: [`docs/deployment/SECRETS.md`](docs/deployment/SECRETS.md) and [`docs/deployment/ROLLBACK.md`](docs/deployment/ROLLBACK.md)
