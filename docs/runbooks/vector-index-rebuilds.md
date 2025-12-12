# Runbook: Vector Index Rebuilds

Use this when vector recall degrades or after large backfills.

## Preconditions
- Database connectivity verified and cluster has >=2x the current vector table size in free disk space.
- Maintenance window agreed with stakeholders; chat latency may spike.

## Steps
1. **Take a backup:**
   - `pg_dump $DATABASE_URL -Fc -f vector-backup.dump`.
   - Snapshot object storage buckets if required by policy.
2. **Quiesce writers:**
   - Pause ingestion workers or disable the ingestion queue fan-out.
   - Put the API in read-only mode if your deployment supports it.
3. **Rebuild indexes:**
   - Connect with psql and run:
   ```sql
   set maintenance_work_mem='1GB';
   drop index if exists "chunks_embedding_idx";
   create index concurrently "chunks_embedding_idx" on "chunks" using ivfflat ("embedding" vector_cosine_ops) with (lists = 200);
   ```
   - Adjust `lists` based on table size (e.g., 100 for dev, 400+ for production >10M rows).
4. **Validate search quality:**
   - Run sample queries via the API retrieval test harness: `npm run test --workspace api -- retrieval.test.ts`.
   - Compare top-5 recall for a handful of golden queries before/after.
5. **Resume writers:**
   - Re-enable ingestion workers and run a smoke upload.

## Rollback
- Restore the backup: `pg_restore -d $DATABASE_URL vector-backup.dump`.
- Recreate the previous index configuration if a new `lists` value performed worse.

## Operational notes
- Avoid concurrent `VACUUM FULL` or `ANALYZE` jobs during rebuilds to keep IO stable.
- Monitor CPU and IO saturation; pause the rebuild if replication lag grows or p99 latency exceeds SLOs.
