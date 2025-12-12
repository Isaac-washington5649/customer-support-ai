# Model Cost Dashboard

The `/usage` route in the web app provides a model-cost dashboard with usage summaries.

## What it shows
- **Rolling spend:** Estimated 30-day cost across all configured models with change vs. prior period.
- **Volume by model:** Requests, input/output tokens, tool calls, and estimated cost per model.
- **Persona performance:** Latency and citation depth per persona to spot quality regressions.
- **Cost controls:** Admin-facing tips to route workloads and manage experimental tools.

## Operating tips
- Keep `NEXT_PUBLIC_API_URL` populated so the dashboard links back to chat and the knowledge store work.
- Use the feature-flag system in `packages/ai` to gate experimental tools that might increase spend.
- Review token outliers weekly and align quotas in the Admin Guide to stay within budget.
