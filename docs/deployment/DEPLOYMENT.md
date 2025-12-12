# Deployment guide

This guide assumes Fly.io for production and Docker Compose for local parity. It reuses the shared workspace tooling (npm workspaces).

## Prerequisites
- Node.js 20 (`.nvmrc` is provided).
- Docker + Docker Compose.
- Fly CLI (`flyctl`) authenticated with `FLY_API_TOKEN` (for local/manual deploys).
- Access to managed PostgreSQL (pgvector enabled), Redis, and S3-compatible storage.

## Environment setup
1. Copy `.env.example` to `.env` and update values for your environment.
2. For local Compose, keep defaults for Postgres/Redis/MinIO unless you have existing services.
3. Generate Prisma client after any env/database URL change: `npm run prisma:generate --workspace api`.

## Local development (Compose)
1. Build and start the stack:
   ```bash
   cp .env.example .env
   docker compose up --build
   ```
2. Web UI is available on `http://localhost:3000`; API/worker use the same image with Redis/Postgres/MinIO backing them.
3. To stop and clean volumes: `docker compose down -v`.

## Production deployment (Fly.io)
### App mappings
- **Web**: `${FLY_WEB_APP}` using `apps/web/Dockerfile` (serves Next.js).
- **API**: `${FLY_API_APP}` using `apps/api/Dockerfile` (bootstrap + future API surface).
- **Worker**: `${FLY_WORKER_APP}` using the same API image with the `worker` process/command.

### GitHub Actions pipelines
- `CI` (updated) runs lint, type-check, unit, build, and Playwright E2E.
- `Deploy` workflow (on `main`) builds and deploys web/api/worker to Fly using `FLY_API_TOKEN` and app names from secrets.
- `Preview` workflow (pull requests) builds images and deploys temporary Fly preview apps suffixed with the PR number.

### Manual Fly deploy
If you need to deploy manually (or bootstrap apps before CI deploys):
```bash
# Web
flyctl deploy --config apps/web/fly.toml --remote-only --build-target web --app $FLY_WEB_APP

# API
flyctl deploy --config apps/api/fly.toml --remote-only --build-target api --app $FLY_API_APP

# Worker (same image, worker process)
flyctl deploy --config apps/api/fly.worker.toml --remote-only --build-target api --app $FLY_WORKER_APP
```
Ensure secrets are set per `SECRETS.md` before deploying. Run database migrations using `npm run prisma:deploy --workspace api` against the production database after each schema change (ideally as a release command or a gated manual step).

## Health checks and monitoring
- Web containers expose port `3000`; Fly uses TCP checks and HTTP ports 80/443. Add application-level `/healthz` in Next.js or upstream if needed.
- API/worker images support OTLP export; configure `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`.
- Logs are structured via the provided logger; stream them with `flyctl logs -a <app>`.

## Release ordering
1. Apply database migrations (`npm run prisma:deploy --workspace api`) before rolling out API/worker changes.
2. Deploy API and worker images (they share the same build) once migrations are complete.
3. Deploy the web app after backend endpoints are live.
