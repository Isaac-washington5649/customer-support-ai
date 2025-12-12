# Runbook: Prompt Updates

Use this procedure to ship prompt changes safely and ensure personas keep their guarantees.

## Preconditions
- Draft prompts reviewed for tone, safety, and citation language.
- Target tenants and rollout order agreed with stakeholders.

## Steps
1. **Stage feature flags:**
   - Add a new prompt variant key under `packages/ai/src/agents.ts`.
   - Register the rollout plan using `FeatureFlagRegistry.registerTenantFlags` with the tenant IDs to receive the variant.
2. **Write regression checks:**
   - Capture before/after outputs for 3–5 golden questions per persona in `packages/ai/src/evaluation/harness.ts` fixtures.
   - Ensure guardrails are intact (refusals still happen, citations still appear).
3. **Deploy behind a flag:**
   - Deploy the code with the variant in place; enable it only for test tenants using the feature flag registry.
   - Monitor logs for prompt token count and tool call mix to catch regressions early.
4. **Gradual rollout:**
   - Expand the feature flag to more tenants or set a default variant once stability is confirmed.
   - Document the chosen variant in `docs/guides/user-guide.md` so support agents know what changed.
5. **Finalize and clean up:**
   - Remove stale variants no longer used to reduce drift.
   - Keep the default persona prompt in `DEFAULT_AGENT_PROFILES` aligned with the currently recommended variant.

## Verification
- Run the router unit tests or a manual smoke test to confirm the variant key is selected and merged with guardrails.
- Validate that tool allowlists reflect the persona’s permissions after the flag flips.
