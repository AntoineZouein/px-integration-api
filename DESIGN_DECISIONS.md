# Design Decisions & Assumptions

Record of decided behavior. Pending items must not be implemented until resolved here.

**Rule:** No assumptions unless reasonable and documented below.

Each entry uses:
- **Decision** — what we do
- **Justification** — why
- **Alternatives** — close options considered (when applicable)

---

## Transform & validation

### Required Tive inputs (checklist)

**Decision**

| Requirement | Tive field(s) | On failure |
|-------------|---------------|------------|
| Valid JSON object body | entire body | **400**; `webhook_events` row already stored |
| Event timestamp | `EntryTimeEpoch` (integer epoch ms) | **400** validation |
| Location block | `Location` object with numeric `Latitude` / `Longitude` in range | **400** validation |
| Temperature | `Temperature.Celsius` (number; `null` rejected) | **400** validation |
| Device identity | resolvable `device_id` (`^[A-Z]\d+$`) and `device_imei` (non-empty) | **400** validation |

**Optional** (omitted → `null` in PAXAFE / DB where applicable): `Humidity`, `Light`, `Accelerometer`, `Battery`, `Cellular`, `Location.FormattedAddress`, `Location.Accuracy`, `Location.LocationMethod`, `AccountId`, `ShipmentId`, `PublicShipmentId`, `Shipment`, etc.

Validation failures (after JSON parse) leave the initial `webhook_events` row at `status: rejected` (same row as insert).

**Justification**

Single place for reviewers to see ingest gates. Invalid JSON is auditable like other rejections (same parent-table path).

---

### `device_id` resolution

**Decision**

Resolve from Tive fields, in order — first value matching `^[A-Z]\d+$`:

1. `DeviceName`
2. `EntityName`
3. `DeviceId`
4. `Shipment.DeviceId` (when `Shipment` is present and non-null)

If no candidate matches → **reject 400**.

| DeviceName | EntityName | Result |
|------------|------------|--------|
| `A571992` | — | `A571992` |
| `B234567` | — | `B234567` |
| `Ship33CABOL` | `A571992` | `A571992` |

**Justification**

Assumption: Tive device IDs in this integration use a single uppercase letter (`A`–`Z`) followed by digits.
PAXAFE `device_id` is required; without a match the sensor/location payloads cannot be produced.

**Alternatives**

- Fall back to first non-empty `DeviceName` / `EntityName` without pattern (would accept `Ship33CABOL`) — rejected; require the letter+digits pattern.

---

### `device_imei` resolution

**Decision**

Resolve from Tive fields, in order — first non-empty value (after trim):

1. `DeviceId` (root)
2. `Shipment.DeviceId` (when `Shipment` is present and non-null)
3. `EntityName`
4. `DeviceName`

No 15-digit IMEI format enforcement. Root `DeviceId` not required on incoming payload (relaxed/custom validation).

When both root `DeviceId` and `Shipment.DeviceId` are present, root `DeviceId` wins.

If no candidate is non-empty → **reject 400**.

| DeviceId | DeviceName | EntityName | `device_imei` |
|----------|------------|------------|---------------|
| absent | `A571992` | absent | `A571992` |
| absent | `Ship33CABOL` | `A571992` | `A571992` |

**Justification**

PAXAFE requires `device_imei`. Missing root `DeviceId` appears in sample payloads; fallback chain still produces a valid identifier for scenarios A & B in `sample-tive-payloads.json`. If resolution fails entirely, valid PX payloads cannot be constructed.

**Alternatives**

- Strict schema: require root `DeviceId` → rejects scenarios A & B in `sample-tive-payloads.json`.
- Require 15-digit IMEI format → rejects scenario A where `DeviceName` is used as IMEI.
- Placeholder value (e.g. `"unknown"`) when all fallbacks empty — rejected; cannot produce valid PX payload.

---

### Input validation implementation (Ajv vs custom)

**Decision**

Use **custom validation only** (manual checks) and transform directly to PAXAFE outputs (no Ajv).

**Justification**

Validation rules intentionally diverge from the provided `tive-incoming-schema.json` (root `DeviceId` is required by schema but allowed to be missing here due to `device_imei` fallbacks). Custom validation keeps the implementation simple and aligned with the specific rules in this document, and avoids maintaining a forked/relaxed input schema.

**Alternatives**

- Ajv with a relaxed schema copy / runtime patching — more tooling and complexity for limited benefit at this scope.

---

### PAXAFE output constants

**Decision**

| Field | Value |
|-------|-------|
| `provider` | `"Tive"` |
| `type` | `"Active"` |
| `timestamp` | `EntryTimeEpoch` |
| `tilt`, `box_open` | `null` |

**Justification**

Defined by `px-sensor-schema.json` / `px-location-schema.json` enums and examples. Tive real-time trackers map to `Active`.

---

### Field mapping & rounding

**Decision**

| PAXAFE / DB column | Tive source | Format |
|--------|-------------|--------|
| `temperature` | `Temperature.Celsius` | 2 dp; **required** — `null` Celsius is rejected (PX sensor schema) |
| `humidity` | `Humidity.Percentage` | 1 dp |
| `light_level` | `Light.Lux` | 1 dp |
| `accelerometer.x/y/z` | `Accelerometer.X/Y/Z` | 3 dp |
| `accelerometer.magnitude` | `Accelerometer.G` | 3 dp |
| `latitude`, `longitude` | `Location.Latitude/Longitude` | as-is |
| `location_source` | `Location.LocationMethod` | pass-through raw (`gps`/`wifi`/`cell`; unknown → `null`) |
| `battery_level` | `Battery.Percentage` | integer |
| `cellular_dbm` | `Cellular.Dbm` | 2 dp |
| `wifi_access_points` | `Location.WifiAccessPointUsedCount` | integer |
| `altitude`, `cellular_network_type`, `cellular_operator` | — | `null` |
| `account_id` (DB only; not in PX sensor/location JSON) | `AccountId` | integer or `null` if absent |
| `shipment_id` (DB only) | `ShipmentId` | string or `null` if absent |
| `public_shipment_id` (DB only) | `PublicShipmentId` | string or `null` if absent |

`location_accuracy` and `location_accuracy_category` — see dedicated section below.

**Justification**

Per output schema field descriptions and examples (Integration Accuracy is 35% of evaluation).

---

### Address parsing

**Decision**

Source: `Location.FormattedAddress` (authoritative; no geocoder).

- `full_address` — copy verbatim
- `street` — `null`
- `locality`, `state`, `postal_code`, `country` — best-effort US-style `City, ST ZIP, Country` parse when pattern matches; else `null`
- Missing / null `FormattedAddress` → `address: null`

**Notes**

- For TypeScript ergonomics, the local `fixtures/px-location-schema.json` was refactored to extract the `address` object into `$defs.PxAddress` and reference it via `$ref`. This allows the schema-to-TypeScript generator to emit a named `PxAddress` type instead of an anonymous inline object type.
- This is **backward-compatible**: the emitted JSON payload shape for `address` is unchanged (still the same object-or-null), and the validation semantics remain equivalent; only the schema's internal structure changed.

**Justification**

Darren: treat `FormattedAddress` as authoritative; no third-party reverse geocoding. `px-location-schema.json` example parses structured fields but leaves `street` null despite leading address text.

**Alternatives**

- `full_address` only, all structured fields `null` — simpler but doesn't match schema example output.
- Parse `street` from first comma segment — example explicitly uses `street: null`.

---

### `location_accuracy` and `location_accuracy_category`

**Decision**

**`location_accuracy` (integer meters)** — resolve in order:

1. `Location.Accuracy.Meters` (round to integer)
2. `Location.Accuracy.Kilometers` × 1000
3. `Location.Accuracy.Miles` × 1609.34
4. `null`

**`location_accuracy_category`** — meters-first, then `LocationMethod` fallback:

| Resolved meters | Category |
|-----------------|----------|
| ≤ 50 | `High` |
| 51 – 200 | `Medium` |
| > 200 | `Low` |

When meters cannot be resolved:

| `LocationMethod` | Category |
|------------------|----------|
| `gps`, `wifi` | `High` |
| `cell` | `Low` |
| missing / null | `null` |

Do not use `Cellular.SignalStrength` / `Dbm` for location accuracy (connectivity metrics, not positioning).

**Justification**

- Meters/Km/Miles are the same value in different units across samples.
- Thresholds fit `px-location-schema.json` example (23 m → `High`) and samples (5 m GPS → `High`, 500 m cell → `Low`).
- Method fallback covers minimal payload where `Accuracy` is null.
- `Cellular.Dbm` maps to PAXAFE `cellular_dbm` separately; WiFi sample has poor cellular signal but 23 m accuracy.

**Alternatives**

- Meters-only, `null` category when accuracy missing — leaves minimal sample without category.
- Method-only (ignore meters) — discards best available signal.
- Use `WifiAccessPointUsedCount` / `CellTowerUsedCount` heuristics — not supported by examples; speculative.

---

### Latitude / longitude validation

**Decision**

Reject **400** if `Location.Latitude` ∉ [−90, 90] or `Location.Longitude` ∉ [−180, 180].

**Justification**

Both `tive-incoming-schema.json` and `px-location-schema.json` define hard bounds. Invalid samples (`95.0`, `-200.0`) test this. Cannot produce valid PAXAFE location output otherwise.

---

## Webhook ingest

### Timestamp validation

**Decision**

Compare `EntryTimeEpoch` (event time) to `received_at` (ingest time):

| Rule | Behavior |
|------|----------|
| Future | Reject 400 if `EntryTimeEpoch` > `received_at` + **5 minutes** |
| Stale | Reject 400 if `EntryTimeEpoch` < `received_at` − **12 hours** |

**Justification**

- 5-minute future grace covers clock skew without accepting absurd future dates (2030 sample).
- 12-hour stale window matches assumed Tive queue depth; readings older than that at ingest are not normal backlog (Tive does not retry webhooks).
- `received_at` stored on parent `webhook_events` row.

**Alternatives**

- Accept any past timestamp (including 2021 sample) — rejected; extreme past treated as bad data.
- Reject any future timestamp (no grace) — rejected; too strict for minor clock drift.

---

### Idempotency / duplicates

**Decision**

**No deduplication.** Each webhook insert creates new rows.

**Justification**

Tive does not retry failed deliveries (per Paxafe). Duplicates are unexpected; if they occur, downstream shipment-level queries can handle them. Avoids unique constraints, extra indexes, and ingest complexity.

**Alternatives**

- `UNIQUE (device_imei, event_timestamp)` with 409 on duplicate — unnecessary without vendor retries; also adds indexes.
- Idempotent 200 returning existing IDs — added complexity for little benefit here.

---

### Webhook response

**Decision**

**Synchronous 200** after validate → transform → persist. Response body includes `webhook_event_id` plus the normalized PAXAFE `sensor` and `location` objects (see dedicated section below).

**Justification**

Load (1–100 payloads / 5 min) is well within sync Postgres capacity for simple write operations. No queue/worker needed for this scope.

**Alternatives**

- Async 202 + background processing — justified at higher scale or if ingest work grows; overkill here.

---

## Database

### Persistence (PostgreSQL)

**Decision**

System of record for telemetry. Three tables:

- `webhook_events` — `webhook_event_id`, `received_at`, `raw_payload` (JSONB), `status` (`accepted` | `rejected`)
- `sensor_readings` — `webhook_event_id` (logical link to parent), typed PAXAFE sensor columns (including `device_id`, `device_imei`, `timestamp_ms`), nullable `account_id`, nullable shipment identifiers (`shipment_id`, `public_shipment_id`), `provider`, `device_type`, `accelerometer` JSONB
- `location_readings` — `webhook_event_id` (logical link to parent), typed PAXAFE location columns (including `device_id`, `device_imei`, `timestamp_ms`), nullable `account_id`, nullable shipment identifiers (`shipment_id`, `public_shipment_id`), nullable raw `location_method` (`gps`/`wifi`/`cell`), `provider`, `device_type`, `address` JSONB

Column types:

- `webhook_event_id` is **UUID** on all three tables (same value links parent + children for a given ingest).
- Event timestamp stored as **epoch milliseconds BIGINT** (`timestamp_ms`), matching payload `EntryTimeEpoch`.
- Ingest time stored as **`received_at TIMESTAMPTZ`** on `webhook_events` only.
- **`status`** is constrained: `CHECK (status IN ('accepted', 'rejected'))`.
- DB nullability mirrors PX schema nullability where applicable (e.g. `temperature` is nullable because PX allows `["number", "null"]`, even though ingest rejects null `Temperature.Celsius` before writing child rows).
- **No PRIMARY KEY, FOREIGN KEY, UNIQUE, or INDEX constraints** in the database.
- `webhook_event_id` on child tables is a **logical foreign key** to `webhook_events.webhook_event_id` (enforced by application insert order, not by Postgres).

One accepted webhook → one parent + one sensor + one location row (by application behavior). Raw payload on parent only.

Rejected webhooks (validation failure or invalid JSON): still return **400**, but **persist `webhook_events` only** (`raw_payload`, `received_at`, `status: rejected`). No `sensor_readings` / `location_readings` rows.

| Outcome | `webhook_events` | `raw_payload` | Child rows |
|---------|------------------|---------------|------------|
| Invalid JSON | yes, `rejected` | verbatim body as JSONB string | no |
| Validation / transform failure | yes, `rejected` | verbatim body as JSONB string | no |
| Accepted | yes, `accepted` | verbatim body as JSONB string | sensor + location (inserted before parent row) |

UUIDs are generated in application code via `crypto.randomUUID()` (no DB extensions).

**Justification**

- Darren: system of record; downstream processing and query patterns are **out of scope** for this exercise (therefore no indexes added).
- Parent row links sensor + location from same webhook; raw JSON for infrequent audit.
- Rejected payloads are still stored on `webhook_events` for audit/debugging; `status` makes accepted vs rejected easy to query without joining child tables.
- Raw payload not on child rows — keeps normalized rows lean. Join to parent when auditing is fine.
- **Sharding flexibility:** a future layout may shard by `device_id`, `shipment_id`, `timestamp_ms`, or a combination. A global primary key or index on `webhook_event_id` would complicate that (every shard would need to respect a global uniqueness contract). Omitting PK/FK/UNIQUE/INDEX keeps the physical schema neutral until real query and sharding requirements are known; indexes can be added later on the dimensions that matter.
- Postgres-enforced `FOREIGN KEY` on `webhook_event_id` would require a **UNIQUE** (or PK) constraint on the referenced parent column, which implies an index — same sharding concern. Logical linkage only for now.

**Alternatives**

- Two tables only (sensor + location, no parent) — no clean link or raw audit per webhook.
- Single wide table — mixed concerns, many nullable columns.
- Infer rejection from absence of child rows only — works but requires joins or `NOT EXISTS` checks.
- `PRIMARY KEY` / `UNIQUE` on `webhook_event_id` — simpler identity and 1:1 guarantees, but presupposes a global key and creates indexes that are awkward under shard-by-device/shipment/time.
- Postgres `FOREIGN KEY` on child `webhook_event_id` — relational integrity at the DB layer; requires indexed unique parent key (rejected for sharding flexibility above).

---

### Data retention

**Decision**

Raw JSON is stored in Postgres indefinitely (no TTL, no PII scrubbing). Assumed internal cold-chain telemetry; retention and compliance are out of scope for this exercise.

---

### DB column strategy (typed vs JSONB)

**Decision**

Use mostly typed columns for top-level PAXAFE fields. Use JSONB only for nested objects:

- `sensor_readings.accelerometer` (JSONB)
- `location_readings.address` (JSONB)
- `webhook_events.raw_payload` (JSONB)

**Justification**

Keeps rows queryable without bloating the schema with deeply nested structures. Avoids duplicating raw payload. Matches low expected schema churn (plain SQL setup).

**Alternatives**

- Store whole PAXAFE sensor/location objects as JSONB — fewer columns but weaker queryability and DB-design signal.
- Fully flatten nested objects into columns — more migrations/columns for limited benefit.

---

### Database transactions

**Decision**

**No DB transactions.** Each insert is an independent `pool.query` call (`webhook_events`, then `sensor_readings` and `location_readings` on accept).

**Justification**

Unnecessary complexity at this scope and load. Partial rows (e.g. parent without a child) are acceptable and rare.

**Alternatives**

- Wrap child inserts or all three tables in a transaction — stronger consistency, more code and connection handling.

---

### Database connections (serverless)

**Decision**

Reuse a module-level PostgreSQL connection pool (`pg.Pool`) across requests.

**Justification**

Reduces connection overhead per request. Works well at the expected load on Vercel/Neon.

**Alternatives**

- Create a new client per request — simpler but adds connection overhead.

---

### Database schema setup (SQL vs migration tool)

**Decision**

Use plain SQL for DB schema setup (e.g. a `schema.sql` applied to Postgres). Query layer uses direct SQL.

**Justification**

For this scope, schema changes are expected to be infrequent and the overhead of a migration tool is not justified.

**Alternatives**

- Drizzle / Prisma migrations — useful when schema churn is expected; additional tooling and setup.

---

## API security & limits

### API key authentication (per customer + rotation)

**Decision**

Require `X-API-Key: <secret>` header. Keys are configured in env (no DB):

- **`WEBHOOK_API_KEYS`** — JSON object: customer id → array of valid secrets. **Multiple secrets per customer** support rotation (e.g. current + previous key during rollover). Example:

```json
{
  "default": ["current-secret"],
  "acme-pharma": ["current-secret", "previous-secret"]
}
```

Missing header or unknown key → **401**. `WEBHOOK_API_KEYS` unset or empty → **503** `ServiceUnavailable`. Comparison uses constant-time equality per registered key.

Resolved **customer id** is used for per-customer rate limiting and appears in logs as `customer_id`.

**Rotation runbook (operational)**

1. Add new key as the **first** entry in the customer’s array (or append as second while old remains valid).
2. Deploy / update Vercel env with both keys active.
3. Update the sender (Tive config or mock sender) to use the new key.
4. Remove the old key from the array and redeploy.

**Justification**

Per-customer keys isolate tenants and rate limits. Multiple valid keys per customer allow zero-downtime rotation without a secrets database at this scale. Env-based registry matches serverless deploy model (Vercel env vars).

**Alternatives**

- Keys in Postgres — better for many customers and audit; more scope than this exercise.
- `Authorization: Bearer` — no indication Tive uses it.
- JWT — wrong model for inbound vendor webhooks (see deferred section below).

---

### Webhook authenticity — out of scope (no Tive production spec)

**Decision**

This exercise uses **shared-secret API keys only** (`X-API-Key`). We do **not** implement payload signing (HMAC), JWT, mTLS, or IP allowlists because the provided materials do not define Tive’s production webhook security contract.

**What API keys give us**

- Only callers who know a configured secret can ingest.
- HTTPS (Vercel) protects the secret on the wire.

**What we are not claiming without Tive’s spec**

- Cryptographic proof that the **body** was sent by Tive and not tampered with (that would be HMAC/signature over raw bytes, verified before `JSON.parse`).
- That the header format matches Tive’s real product (we assume `X-API-Key` per exercise).
- Vendor IP pinning or certificate-based client auth.

**Production follow-up (when Tive/Paxafe spec is available)**

1. Implement whatever Tive documents (often `X-Signature` + HMAC-SHA256 of raw body).
2. Move secrets to a managed store if customer count grows beyond env JSON.
3. Alert on `outcome: unauthorized` spikes; durable global rate limits (e.g. Redis/Upstash).

**Alternatives considered**

- Add Stripe-style HMAC now — speculative without vendor docs; risks wrong header/algorithm.
- Auth0 / Clerk / JWT — user-session auth, not vendor webhook ingest.

---

### Rate limiting (per customer)

**Decision**

Apply a per-customer rate limit keyed by resolved **customer id** (from API key registry): **200 requests per 5 minutes** per customer.

**Justification**

Prevents accidental overload and makes webhook ingestion more production-like. Per Paxafe guidance, expected load is manageable (1–100 payloads / 5 min), so the limit is mainly a safety rail. Key rotation does not reset the limit bucket (same customer, new key).

**Implementation notes**

- Identify customer by resolved id from `WEBHOOK_API_KEYS`.
- Enforce a simple **fixed-window counter** in memory per customer id: count requests in the current 5-minute window; reset the window when it expires (best-effort on serverless; not a strict global limit).
- Return **429** with a structured error body when exceeded.

**Alternatives**

- No rate limit — simplest, but less realistic.
- Durable/global rate limit using Redis/Upstash — more correct on serverless, but adds infrastructure beyond scope.

---

### Request body size limit

**Decision**

Enforce a maximum request body size of **1 MB** for `POST /api/webhook/tive`. Return **413** when exceeded.

**Justification**

Complements per-customer rate limiting as a simple safety rail against accidental or malicious oversized payloads.

**Alternatives**

- No body size cap — simplest, less defensive.
- Smaller cap (e.g. 256 KB) — more strict, higher chance of rejecting legitimate payloads.

---

## Observability

### Logging (Vercel runtime logs + structured JSON)

**Decision**

Use **Vercel runtime logs** as the observability backend. Emit **one JSON log line per request** from API routes (`console.log` / `console.error`), captured automatically by Vercel for serverless functions.

Events:

| `event` | Route | When |
|---------|-------|------|
| `webhook_ingest` | `POST /api/webhook/tive` | Every webhook request (all HTTP outcomes) |
| `health_check` | `GET /api/health` | Every health probe |

Common fields: `level` (`info` \| `error`), `ts` (ISO timestamp), `request_id`, `http_status`, `duration_ms`.

`webhook_ingest` also includes: `outcome` (`accepted` \| `rejected` \| `unauthorized` \| `rate_limited` \| `payload_too_large` \| `invalid_json` \| `service_unconfigured` \| `error`), `customer_id` (when auth succeeded), `webhook_event_id` (when allocated), `validation_error_count` (on reject), `error` (on 500, via `safeError` — server-side only).

API responses continue to return `request_id` (and `webhook_event_id` when persisted) so clients can correlate with Vercel log search.

**Justification**

- No extra infrastructure (Sentry, Datadog, etc.) for this scope; Vercel already collects function stdout/stderr.
- Structured JSON is searchable/filterable in the Vercel dashboard (e.g. `event:webhook_ingest`, `outcome:rejected`, a specific `request_id`).
- Logging **all** outcomes (not only 500s) makes rejections and auth/rate-limit issues visible without querying Postgres.
- `duration_ms` gives a basic latency signal per ingest without a metrics stack.

**How to debug in production**

1. Vercel → Integration API project → **Logs**.
2. Search `request_id` from the API/mock-sender response, or filter `webhook_ingest`.
3. For persisted payloads, join to `webhook_events` via `webhook_event_id` in Neon when needed.

**Alternatives (deferred for this exercise)**

- **Sentry / Datadog / third-party APM** — error grouping, alerting, and dashboards; not required to demonstrate ingest correctness on a take-home.
- **Synthetic canary** — scheduled valid webhook against production URL; useful for continuous verification; out of scope here.
- **`request_id` in Postgres** — stronger DB↔log correlation without log search; current volume is low enough that API `request_id` + Vercel logs suffice.
- **Metrics / tracing (OpenTelemetry)** — useful at higher scale or with async workers; overkill for sync ingest here.
- Plain unstructured `console.error("webhook_error", …)` — harder to search and aggregate; replaced by structured events.

---

## Project toolchain

### Testing toolchain

**Decision**

Use **Vitest** with:

- **Transform unit tests** — each entry in `fixtures/sample-tive-payloads.json` (`payloads` + `invalid_payloads`), golden field checks, and Ajv conformance on PAXAFE outputs.
- **Webhook route tests** — `POST /api/webhook/tive` with mocked `pg` pool (401, 503 misconfig, 400 + parent persist, 200 + three inserts).

**Justification**

Fast, TypeScript-friendly runner with minimal setup. Transform tests cover integration accuracy; route tests cover auth, misconfiguration, and persist call shape without a live database.

**Alternatives**

- Jest — very common, slightly heavier setup.
- Node built-in test runner — minimal deps, less test DX.

---

### UI styling

**Decision**

Use **Tailwind CSS** for both apps.

**Justification**

Fast iteration and consistent styling with minimal custom CSS.

**Alternatives**

- CSS modules — fewer deps, less ergonomic for rapid UI.
- Component library (e.g. shadcn/ui) — more polished, more setup.

---

### TypeScript strictness

**Decision**

Enable TypeScript `strict: true`.

**Justification**

Catches edge cases early (nullability and schema-driven transforms).

**Alternatives**

- Default Next.js TypeScript settings — slightly looser.
