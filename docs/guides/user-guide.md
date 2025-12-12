# User Guide

This guide explains how to use the chat experience and the knowledge store effectively.

## Chat workspace
- **Choose a persona:** Pick Assistant, Coach, Critic, or Researcher depending on the task. Each persona applies tailored tone, tools, and guardrails.
- **Ask clear questions:** Include product name, workspace, and urgency. Add screenshots or file references when relevant.
- **Use conversation search:** Filter conversations by title or keywords to resume prior threads.
- **Export chats:** Use the export controls to download a transcript with citations for audits or handoffs.

## Working with knowledge
- **Upload source files:** PDFs, docs, and release notes go through ingestion to the vector index. Keep filenames descriptive.
- **Verify citations:** Assistant and Researcher responses include citations. Hover over markers to see document titles.
- **Refresh stale data:** If a knowledge gap appears, upload the missing doc and re-ask your question after the chunking job finishes.
- **Escalate to humans:** When the Critic persona flags policy risks, share the cited documents with a human reviewer.

## Tips for better answers
- Provide structured prompts: "Summarize release 4.12 for enterprise customers" yields better results than "What changed?".
- Ask the Coach persona for onboarding playbooks and the Assistant persona for customer-ready wording.
- Use the chat export when handing off to support or engineering, so citations travel with the ticket.
