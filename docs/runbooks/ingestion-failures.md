# Runbook: Ingestion Failures

## Symptoms
- Files remain in the upload queue without landing in storage.
- Vector counts lag behind file totals in the workspace dashboard.
- Ingestion API (`/ingest` or `/upload`) returns 5xx or long tail 429s.

## Quick triage checklist
1. Confirm S3-compatible storage is reachable:
   - `aws s3 ls s3://$S3_BUCKET_PREFIX-$WORKSPACE --endpoint-url $S3_ENDPOINT`.
   - Look for throttling or credential errors in the API logs.
2. Check the API worker health:
   - `kubectl get pods -l app=api` and inspect restarts.
   - Tail logs: `kubectl logs -l app=api -f --since=30m | rg "ingest"`.
3. Validate database connectivity:
   - `psql $DATABASE_URL -c "select now();"`.
   - Confirm `pgvector` extension exists: `psql $DATABASE_URL -c "\dx pgvector"`.
4. Inspect the ingestion queue backlog:
   - If using SQS: `aws sqs get-queue-attributes --queue-url $QUEUE --attribute-name ApproximateNumberOfMessages`.
   - If using Postgres jobs, check `jobs` table for stuck rows.

## Common fixes
- **Credential expiration:** rotate `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, restart API deployment, and re-run the job.
- **Schema mismatch:** regenerate Prisma client after schema changes: `npm run prisma:generate --workspace api`.
- **Oversized payloads:** enforce per-file limits in the gateway; re-run uploads in smaller batches.
- **Stalled worker:** recycle pods to unblock: `kubectl rollout restart deploy/api`.

## Verification steps
- Re-upload a small PDF and confirm the document and chunk counts increase in the workspace view.
- Run the vector count sanity query:
  ```sql
  select workspace_id, count(*) as chunks from chunks group by 1 order by 2 desc;
  ```
- Validate that the file metadata appears in `apps/api/prisma/schema.prisma` fields and that citations are emitted in chat responses.

## Rollback / escalation
- If a migration caused the regression, roll back the latest migration and redeploy the previous API image.
- Escalate to the data platform owner when queue depth grows for >30 minutes or ingestion fails for multiple tenants.
