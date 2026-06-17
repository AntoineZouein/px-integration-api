/**
 * Integration API landing page (endpoints + docs pointers).
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8 text-zinc-900">
      <main className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Integration API</h1>
        <p className="text-sm text-zinc-600">
          Tive webhook ingestion → PAXAFE sensor + location transform → PostgreSQL.
        </p>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Endpoints</h2>
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>
              <code className="rounded bg-white px-1">POST /api/webhook/tive</code> — ingest (requires{" "}
              <code className="rounded bg-white px-1">X-API-Key</code>)
            </li>
            <li>
              <code className="rounded bg-white px-1">GET /api/health</code> — DB connectivity check
            </li>
          </ul>
        </section>

        <section className="space-y-2 text-sm text-zinc-600">
          <p>
            Setup, env vars, and operations: see <code>README.md</code> in this repo.
          </p>
          <p>
            Transform rules, schema, and tradeoffs: see <code>DESIGN_DECISIONS.md</code>.
          </p>
        </section>
      </main>
    </div>
  );
}
