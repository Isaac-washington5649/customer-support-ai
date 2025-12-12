import Link from "next/link";

interface ModelUsageRow {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  cost: number;
}

interface PersonaUsageRow {
  persona: string;
  messages: number;
  avgLatencyMs: number;
  citationsPerReply: number;
}

const modelUsage: ModelUsageRow[] = [
  { model: "gpt-4o", requests: 210, inputTokens: 920_000, outputTokens: 310_000, toolCalls: 140, cost: 142.2 },
  {
    model: "gpt-4o-mini",
    requests: 860,
    inputTokens: 1_420_000,
    outputTokens: 520_000,
    toolCalls: 390,
    cost: 88.9,
  },
  {
    model: "gpt-3.5-turbo",
    requests: 120,
    inputTokens: 310_000,
    outputTokens: 120_000,
    toolCalls: 40,
    cost: 14.3,
  },
];

const personaUsage: PersonaUsageRow[] = [
  { persona: "Assistant", messages: 640, avgLatencyMs: 1650, citationsPerReply: 1.8 },
  { persona: "Coach", messages: 240, avgLatencyMs: 1420, citationsPerReply: 0.9 },
  { persona: "Critic", messages: 110, avgLatencyMs: 900, citationsPerReply: 1.1 },
  { persona: "Researcher", messages: 200, avgLatencyMs: 2100, citationsPerReply: 2.4 },
];

const spendDelta = (current: number, previous: number): number =>
  previous === 0 ? 0 : ((current - previous) / previous) * 100;

export default function UsageDashboard() {
  const currentSpend = modelUsage.reduce((total, row) => total + row.cost, 0);
  const previousSpend = 215.4;
  const spendChange = spendDelta(currentSpend, previousSpend);
  const totalToolCalls = modelUsage.reduce((total, row) => total + row.toolCalls, 0);
  const totalTokens = modelUsage.reduce((total, row) => total + row.inputTokens + row.outputTokens, 0);

  return (
    <main className="min-h-screen bg-white px-8 py-10 text-gray-900">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Usage &amp; spend</p>
          <h1 className="text-3xl font-semibold">Model cost dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Return to chat
          </Link>
          <Link
            href="/files"
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Knowledge store
          </Link>
        </div>
      </div>

      <section className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Estimated spend (rolling 30d)</p>
          <p className="mt-2 text-3xl font-semibold">${currentSpend.toFixed(2)}</p>
          <p className="mt-1 text-xs text-gray-500">{spendChange.toFixed(1)}% vs prior 30d</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Total tokens processed</p>
          <p className="mt-2 text-3xl font-semibold">{(totalTokens / 1_000_000).toFixed(2)}M</p>
          <p className="mt-1 text-xs text-gray-500">Inputs + outputs</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Requests this week</p>
          <p className="mt-2 text-3xl font-semibold">{modelUsage.reduce((total, row) => total + row.requests, 0)}</p>
          <p className="mt-1 text-xs text-gray-500">Across all personas</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Tool calls</p>
          <p className="mt-2 text-3xl font-semibold">{totalToolCalls}</p>
          <p className="mt-1 text-xs text-gray-500">Search + task automation</p>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Model usage summary</h2>
            <p className="text-sm text-gray-500">Compare volume, tool mix, and marginal spend.</p>
          </div>
          <p className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Spend trending {spendChange >= 0 ? "up" : "down"} {Math.abs(spendChange).toFixed(1)}%
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500">
                <th className="py-2">Model</th>
                <th className="py-2">Requests</th>
                <th className="py-2">Input tokens</th>
                <th className="py-2">Output tokens</th>
                <th className="py-2">Tool calls</th>
                <th className="py-2">Est. cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modelUsage.map((row) => (
                <tr key={row.model} className="text-sm">
                  <td className="py-3 font-medium text-gray-900">{row.model}</td>
                  <td className="py-3 text-gray-700">{row.requests}</td>
                  <td className="py-3 text-gray-700">{row.inputTokens.toLocaleString()}</td>
                  <td className="py-3 text-gray-700">{row.outputTokens.toLocaleString()}</td>
                  <td className="py-3 text-gray-700">{row.toolCalls}</td>
                  <td className="py-3 font-semibold text-gray-900">${row.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Persona performance</h3>
              <p className="text-sm text-gray-500">Latency and citation depth per mode.</p>
            </div>
            <span className="rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-700">Last 7 days</span>
          </div>
          <div className="mt-4 space-y-3">
            {personaUsage.map((row) => (
              <div
                key={row.persona}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{row.persona}</p>
                  <p className="text-xs text-gray-500">{row.messages} messages</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-700">{(row.avgLatencyMs / 1000).toFixed(2)}s avg latency</p>
                  <p className="text-xs text-gray-500">{row.citationsPerReply.toFixed(1)} citations per reply</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Cost controls</h3>
              <p className="text-sm text-gray-500">Budget guardrails and optimization levers.</p>
            </div>
            <span className="rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-700">Admin only</span>
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
            <li>Route low-risk questions to gpt-4o-mini; reserve gpt-4o for complex or policy-sensitive threads.</li>
            <li>Enable experimental tools only for tenants that opted in via feature flags.</li>
            <li>Review weekly token outliers; cap noisy tenants with per-tenant daily token limits.</li>
            <li>Archive stale files in the knowledge store to cut retrieval and embedding churn.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
