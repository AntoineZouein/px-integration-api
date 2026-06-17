## Integration API (Tive → PAXAFE)

Next.js App Router service that ingests Tive webhook payloads, validates + transforms into PAXAFE sensor/location shapes, and persists to Postgres (system of record).

Design decisions (transform rules, schema, ingest behavior, tradeoffs): **[DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)**

### Endpoints

- `POST /api/webhook/tive`
  - **Auth**: `X-API-Key: <secret>` (per-customer keys + rotation via `WEBHOOK_API_KEYS`; see below)
  - **Limits**: 1 MB body cap (413), 200 req / 5 min / customer (429)
  - **On success**: `200 { webhook_event_id, sensor, location }` (PAXAFE normalized payloads)
  - **On validation error**: `400 { error: "ValidationError", webhook_event_id, details: [...] }` (raw body stored on `webhook_events` with `status: rejected` before parse/validate)

- `GET /api/health`
  - Returns `200 { ok: true }`

### Operations

- Runtime logs: structured JSON per request (see [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md#logging-vercel-runtime-logs--structured-json)). In Vercel → **Logs**, search by `request_id` or `event:webhook_ingest`.

### Deploy to Vercel

1. Push this repo to GitHub and **Import** the project in [Vercel](https://vercel.com) (framework: **Next.js**).
2. Set **Environment Variables** (Production, and Preview if you use PR deploys):

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Neon Postgres connection string (`?sslmode=require`). Use Neon’s **pooled** connection string for serverless if available. |
| `WEBHOOK_API_KEYS` | Yes | JSON map of customer id → array of secrets (supports key rotation). See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md#api-key-authentication-per-customer--rotation). |

3. **Apply the schema once** to your Neon database (from your machine or any host with network access to Neon):

```bash
DATABASE_URL="postgres://..." node scripts/apply-schema.mjs
```

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` — safe to re-run; it does not drop data.

4. **Deploy** (Vercel deploys on push if Git is connected, or trigger **Redeploy** after env changes).

5. **Smoke test** production:

```bash
curl -sS "https://YOUR-INTEGRATION-API.vercel.app/api/health"
# expect: {"ok":true,"request_id":"..."}

curl -sS -X POST "https://YOUR-INTEGRATION-API.vercel.app/api/webhook/tive" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"EntryTimeEpoch":'$(date +%s000)',"EntityName":"A571992","DeviceName":"A571992","DeviceId":"863257063350583","Temperature":{"Celsius":10},"Location":{"Latitude":40.81,"Longitude":-73.88,"LocationMethod":"wifi","Accuracy":{"Meters":23}}}'
# expect: 200 with webhook_event_id, sensor, location
```

Check Vercel **Logs** for `event:webhook_ingest` and Neon for rows in `webhook_events` / `sensor_readings` / `location_readings`.

### Local development

1. Install deps:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and set:
   - `WEBHOOK_API_KEYS` (see DESIGN_DECISIONS)
   - `DATABASE_URL`

3. Create tables (plain SQL):
   - See `db/schema.sql`
   - Apply on an empty database (e.g. `DATABASE_URL=... node scripts/apply-schema.mjs`)

4. Run:

```bash
npm run dev
```

### Tests

```bash
npm test
```

Tests are **fully offline**: transform and mapping tests call `validateAndTransformTiveToPx` only; webhook route tests **mock** `@/lib/db` (`pg` is never called). No `DATABASE_URL` is required to run the suite, and **nothing is written to production Postgres** during `npm test`.

