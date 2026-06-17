/**
 * Health endpoint that verifies DB connectivity.
 */
import { getPool } from "@/lib/db";
import { logHealthCheck } from "@/lib/log";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const startedAtMs = Date.now();
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    logHealthCheck({ requestId, startedAtMs, ok: true });
    return new Response(JSON.stringify({ ok: true, request_id: requestId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    logHealthCheck({ requestId, startedAtMs, ok: false, error: e });
    return new Response(JSON.stringify({ ok: false, request_id: requestId }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
