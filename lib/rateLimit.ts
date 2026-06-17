/**
 * Best-effort in-memory per-customer rate limiting (serverless-instance local).
 */
type Bucket = {
  windowStartMs: number;
  count: number;
};

const WINDOW_MS = 5 * 60 * 1000;
const LIMIT = 200;

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAtMs: number }
  | { ok: false; resetAtMs: number };

export function checkRateLimit(customerId: string, nowMs: number): RateLimitResult {
  const existing = buckets.get(customerId);

  if (!existing || nowMs - existing.windowStartMs >= WINDOW_MS) {
    const bucket: Bucket = { windowStartMs: nowMs, count: 1 };
    buckets.set(customerId, bucket);
    return { ok: true, remaining: LIMIT - 1, resetAtMs: bucket.windowStartMs + WINDOW_MS };
  }

  if (existing.count >= LIMIT) {
    return { ok: false, resetAtMs: existing.windowStartMs + WINDOW_MS };
  }

  existing.count += 1;
  return { ok: true, remaining: LIMIT - existing.count, resetAtMs: existing.windowStartMs + WINDOW_MS };
}

