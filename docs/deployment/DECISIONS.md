# Deployment decisions

## Target platform
**Choice: Fly.io with Docker images per service (web, API, worker) plus Redis/Postgres/S3 managed services.**

### Rationale
- The repo is a multi-service workspace (Next.js frontend + TypeScript API + BullMQ workers) that shares packages; Docker-based deployments keep versions in lockstep.
- Fly supports multiple process groups and managed Postgres/Redis while allowing custom S3 endpoints; aligns with the topology already described in `docs/deployment-topology.md`.
- Next.js output is configured for `standalone`, making image-based deploys straightforward without extra runtime tooling.
- Avoid introducing a new platform when no prior provider was defined; Docker also preserves local/prod parity via `docker-compose`.

### Trade-offs
- Requires image builds for each deploy (slower than Vercel for pure Next.js, but necessary to co-deploy API/workers).
- Secrets/configuration must be synchronized across three Fly apps (web/api/worker); documented in `SECRETS.md`.
- Fly Machines deployments rely on stable migrations ordering; we document deployment sequencing and rollback to mitigate risk.
