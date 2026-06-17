/**
 * Structured JSON logs for Vercel runtime log capture (one JSON object per line).
 */
import { safeError } from "@/lib/safeError";

type LogLevel = "info" | "error";

export function logStructured(level: LogLevel, fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export type WebhookIngestOutcome =
  | "accepted"
  | "rejected"
  | "unauthorized"
  | "rate_limited"
  | "payload_too_large"
  | "invalid_json"
  | "service_unconfigured"
  | "error";

export function logWebhookIngest(fields: {
  requestId: string;
  startedAtMs: number;
  httpStatus: number;
  outcome: WebhookIngestOutcome;
  customerId?: string;
  webhookEventId?: string;
  validationErrorCount?: number;
  error?: unknown;
}): void {
  const level: LogLevel = fields.httpStatus >= 500 ? "error" : "info";
  logStructured(level, {
    event: "webhook_ingest",
    request_id: fields.requestId,
    customer_id: fields.customerId,
    webhook_event_id: fields.webhookEventId,
    http_status: fields.httpStatus,
    duration_ms: Date.now() - fields.startedAtMs,
    outcome: fields.outcome,
    validation_error_count: fields.validationErrorCount,
    error: fields.error === undefined ? undefined : safeError(fields.error),
  });
}

export function logHealthCheck(fields: {
  requestId: string;
  startedAtMs: number;
  ok: boolean;
  error?: unknown;
}): void {
  const level: LogLevel = fields.ok ? "info" : "error";
  logStructured(level, {
    event: "health_check",
    request_id: fields.requestId,
    http_status: fields.ok ? 200 : 500,
    duration_ms: Date.now() - fields.startedAtMs,
    ok: fields.ok,
    error: fields.error === undefined ? undefined : safeError(fields.error),
  });
}
