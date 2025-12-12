# Admin Guide

This guide covers workspace permissions, quotas, and governance knobs.

## Roles and permissions
- **Workspace admin:** Manages user invites, quota policies, and feature flags per tenant.
- **Agent author:** Can edit persona overrides and approve prompt variants for rollout.
- **Support agent:** Uses chat and knowledge store with read-only access to ingestion settings.

## Quotas
- Configure per-tenant limits in the API config:
  - **Daily chat tokens:** cap total model tokens per day to control spend.
  - **Tooling allowlists:** set `defaultTools` and `experimentalTools` per persona and gate them via feature flags.
  - **File uploads:** enforce file size and count limits per workspace to protect ingestion throughput.
- Track quota consumption with the model-cost dashboard to spot spikes early.

## Governance workflows
- **Prompt changes:** follow the prompt update runbook and roll out via `FeatureFlagRegistry.registerTenantFlags`.
- **Data residency:** ensure bucket prefixes and database schemas are isolated per tenant; audit access quarterly.
- **Offboarding:** remove user access, rotate S3 and database credentials, and archive associated knowledge store objects.

## Incident response
- Use the ingestion and vector index runbooks for operational incidents.
- Pause experimental tools for a tenant by clearing the experimental tool list in the feature flag registry.
- Escalate to security if PII redaction or guardrail regressions are detected.
