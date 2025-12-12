import { Button } from "@customer-support-ai/ui";

import { env } from "@/env";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 bg-white px-6 py-16 text-gray-900 dark:bg-black dark:text-white">
      <div className="flex flex-col gap-3">
        <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Customer Support AI
        </p>
        <h1 className="text-4xl font-semibold leading-tight">Monorepo workspace</h1>
        <p className="max-w-2xl text-lg text-gray-700 dark:text-gray-300">
          The Next.js frontend now lives in <code>apps/web</code> and shares UI, AI, and ingestion
          utilities via workspaces. Update the API base URL in your environment file to match the
          backend you deploy.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm shadow-sm dark:border-gray-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">API Endpoint</p>
            <p className="font-mono text-base">{env.NEXT_PUBLIC_API_URL}</p>
          </div>
          <Button aria-label="Open API docs">View docs</Button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Env variables are validated on boot using <code>@t3-oss/env-nextjs</code> to keep client and
          server values in sync across packages.
        </p>
      </div>
    </main>
  );
}
