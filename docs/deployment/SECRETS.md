# Secrets and configuration

## Storage locations
- **GitHub Actions**: store CI/CD-only secrets (Fly tokens, preview app names) under repository secrets.
- **Fly.io**: set runtime secrets per app via `flyctl secrets set` or the Fly dashboard.

## Required secrets
| Key | Where | Description |
| --- | --- | --- |
| `FLY_API_TOKEN` | GitHub Actions | Deploy token with access to all Fly apps. |
| `FLY_WEB_APP` | GitHub Actions/Fly | App name for the web frontend. |
| `FLY_API_APP` | GitHub Actions/Fly | App name for the API service. |
| `FLY_WORKER_APP` | GitHub Actions/Fly | App name for the worker service (shares API image). |
| `DATABASE_URL` | Fly (API/worker) | Postgres URL with `pgvector` enabled. |
| `DIRECT_DATABASE_URL` | Fly (API/worker) | Direct connection string for migrations (optional, often same as `DATABASE_URL`). |
| `S3_ENDPOINT` | Fly (API/worker) | S3-compatible endpoint (AWS S3 or MinIO). |
| `S3_REGION` | Fly (API/worker) | Region for S3 endpoint. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Fly (API/worker) | Credentials for object storage. Prefer short-lived keys or OIDC to STS. |
| `S3_BUCKET_PREFIX` | Fly (API/worker) | Prefix for per-workspace buckets. |
| `REDIS_URL` | Fly (API/worker) | Redis connection string for BullMQ. |
| `QUEUE_PREFIX` | Fly (API/worker) | Queue namespace to isolate environments. |
| `INGESTION_CONCURRENCY` / `DELETION_CONCURRENCY` | Fly (worker) | Worker concurrency tuning. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAME` | Fly (all) | Optional telemetry export config. |
| `API_SECRET` | Fly (web) | Shared secret for API calls from Next.js. |
| `NEXT_PUBLIC_API_URL` | Fly (web) | Public URL of the API gateway. |

## Handling
- Never commit `.env` files; use `.env.example` as the contract.
- Rotate database and storage credentials regularly. Support dual-credential rotation where both old/new keys are valid during rollout.
- For GitHub Actions, scope the Fly token to deployment only; revoke and recreate on compromise.
