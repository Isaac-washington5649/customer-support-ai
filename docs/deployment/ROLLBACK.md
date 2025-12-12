# Rollback plan

## Application rollback (Fly.io)
1. Identify the last healthy Fly release:
   ```bash
   flyctl releases -a <app-name>
   ```
2. Roll back the web/API/worker apps to the chosen version:
   ```bash
   flyctl releases rollback -a $FLY_WEB_APP <version>
   flyctl releases rollback -a $FLY_API_APP <version>
   flyctl releases rollback -a $FLY_WORKER_APP <version>
   ```
3. Monitor logs and health after rollback: `flyctl logs -a <app>`.

## Database migrations
- Prisma deploys are one-way. If a migration caused issues:
  1. Revert the code to the prior commit.
  2. Restore the database from the most recent snapshot/backup for the affected environment.
  3. Redeploy the previous application images.
- Consider adding down-migrations only after validating they are safe for your dataset.

## Object storage and queues
- Failed ingestion/deletion jobs land in DLQs (`ingestion:dlq`, `deletion:dlq`). After rollback, drain or re-run them once the system is stable.
- If a bad deploy created incorrect buckets/objects, clean them by workspace prefix using the ingestion helpers.

## Validation checklist
- Verify API/worker connectivity to Postgres/Redis/S3 after rollback.
- Confirm Next.js frontend renders and points to the correct API URL.
- Ensure OTEL exporters (if enabled) are not spamming collectors with stale config.
