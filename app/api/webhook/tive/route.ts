/**
 * Tive webhook ingestion endpoint.
 * Validates, transforms, and persists sensor+location records.
 */
import { getApiKeyFromHeaders, isWebhookApiKeyConfigured, resolveWebhookAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { logWebhookIngest } from "@/lib/log";
import { checkRateLimit } from "@/lib/rateLimit";
import { validateAndTransformTiveToPx } from "@/lib/transform/core";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type WebhookEventStatus = "accepted" | "rejected";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const startedAtMs = Date.now();
  const receivedAtMs = startedAtMs;

  const apiKey = getApiKeyFromHeaders(request.headers);
  if (!apiKey) {
    logWebhookIngest({ requestId, startedAtMs, httpStatus: 401, outcome: "unauthorized" });
    return jsonResponse(401, { error: "Unauthorized", request_id: requestId });
  }
  if (!isWebhookApiKeyConfigured()) {
    logWebhookIngest({ requestId, startedAtMs, httpStatus: 503, outcome: "service_unconfigured" });
    return jsonResponse(503, { error: "ServiceUnavailable", request_id: requestId });
  }
  const auth = resolveWebhookAuth(apiKey);
  if (!auth) {
    logWebhookIngest({ requestId, startedAtMs, httpStatus: 401, outcome: "unauthorized" });
    return jsonResponse(401, { error: "Unauthorized", request_id: requestId });
  }

  const rl = checkRateLimit(auth.customerId, receivedAtMs);
  if (!rl.ok) {
    logWebhookIngest({
      requestId,
      startedAtMs,
      httpStatus: 429,
      outcome: "rate_limited",
      customerId: auth.customerId,
    });
    return jsonResponse(429, { error: "RateLimited", request_id: requestId, reset_at_ms: rl.resetAtMs });
  }

  const ingestLog = { customerId: auth.customerId };

  const rawText = await request.text();
  const bytes = Buffer.byteLength(rawText, "utf8");
  if (bytes > 1024 * 1024) {
    logWebhookIngest({ requestId, startedAtMs, httpStatus: 413, outcome: "payload_too_large", ...ingestLog });
    return jsonResponse(413, { error: "PayloadTooLarge", request_id: requestId });
  }

  const webhookEventId = randomUUID();
  const pool = getPool();
  let webhookStatus: WebhookEventStatus = "rejected";
  let response: Response | undefined;

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      logWebhookIngest({
        requestId,
        startedAtMs,
        httpStatus: 400,
        outcome: "invalid_json",
        webhookEventId,
        ...ingestLog,
      });
      response = jsonResponse(400, {
        error: "ValidationError",
        webhook_event_id: webhookEventId,
        request_id: requestId,
        details: [{ path: "", message: "Body must be valid JSON" }],
      });
      return response;
    }

    const transformed = validateAndTransformTiveToPx(parsed, receivedAtMs);
    if (!transformed.ok) {
      logWebhookIngest({
        requestId,
        startedAtMs,
        httpStatus: 400,
        outcome: "rejected",
        webhookEventId,
        validationErrorCount: transformed.details.length,
        ...ingestLog,
      });
      response = jsonResponse(400, {
        error: "ValidationError",
        webhook_event_id: webhookEventId,
        request_id: requestId,
        details: transformed.details,
      });
      return response;
    }

    try {
      await pool.query(
        `INSERT INTO sensor_readings (
          webhook_event_id,
          device_id, device_imei, timestamp_ms,
          account_id, shipment_id, public_shipment_id,
          provider, device_type,
          temperature, humidity, light_level,
          accelerometer
        ) VALUES (
          $1,
          $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          $10, $11, $12,
          $13::jsonb
        )`,
        [
          webhookEventId,
          transformed.value.pxSensor.device_id,
          transformed.value.pxSensor.device_imei,
          transformed.value.pxSensor.timestamp,
          transformed.value.account_id,
          transformed.value.shipment_id,
          transformed.value.public_shipment_id,
          transformed.value.pxSensor.provider,
          transformed.value.pxSensor.type,
          transformed.value.pxSensor.temperature,
          transformed.value.pxSensor.humidity ?? null,
          transformed.value.pxSensor.light_level ?? null,
          transformed.value.pxSensor.accelerometer ? JSON.stringify(transformed.value.pxSensor.accelerometer) : null,
        ],
      );

      await pool.query(
        `INSERT INTO location_readings (
          webhook_event_id,
          device_id, device_imei, timestamp_ms,
          account_id, shipment_id, public_shipment_id,
          location_method,
          provider, device_type,
          latitude, longitude, altitude,
          location_accuracy, location_accuracy_category, location_source,
          address,
          battery_level, cellular_dbm, wifi_access_points
        ) VALUES (
          $1,
          $2, $3, $4,
          $5, $6, $7,
          $8,
          $9, $10,
          $11, $12, $13,
          $14, $15, $16,
          $17::jsonb,
          $18, $19, $20
        )`,
        [
          webhookEventId,
          transformed.value.pxLocation.device_id,
          transformed.value.pxLocation.device_imei,
          transformed.value.pxLocation.timestamp,
          transformed.value.account_id,
          transformed.value.shipment_id,
          transformed.value.public_shipment_id,
          transformed.value.location_method_raw,
          transformed.value.pxLocation.provider,
          transformed.value.pxLocation.type,
          transformed.value.pxLocation.latitude,
          transformed.value.pxLocation.longitude,
          transformed.value.pxLocation.altitude ?? null,
          transformed.value.pxLocation.location_accuracy ?? null,
          transformed.value.pxLocation.location_accuracy_category ?? null,
          transformed.value.pxLocation.location_source ?? null,
          transformed.value.pxLocation.address ? JSON.stringify(transformed.value.pxLocation.address) : null,
          transformed.value.pxLocation.battery_level ?? null,
          transformed.value.pxLocation.cellular_dbm ?? null,
          transformed.value.pxLocation.wifi_access_points ?? null,
        ],
      );
    } catch (error) {
      logWebhookIngest({
        requestId,
        startedAtMs,
        httpStatus: 500,
        outcome: "error",
        webhookEventId,
        error,
        ...ingestLog,
      });
      response = jsonResponse(500, { error: "InternalError", request_id: requestId });
      return response;
    }

    webhookStatus = "accepted";
    logWebhookIngest({
      requestId,
      startedAtMs,
      httpStatus: 200,
      outcome: "accepted",
      webhookEventId,
      ...ingestLog,
    });
    response = jsonResponse(200, {
      webhook_event_id: webhookEventId,
      sensor: transformed.value.pxSensor,
      location: transformed.value.pxLocation,
      request_id: requestId,
    });
    return response;
  } finally {
    try {
      await pool.query(
        `INSERT INTO webhook_events (webhook_event_id, received_at, raw_payload, status)
         VALUES ($1, NOW(), $2::jsonb, $3)`,
        [webhookEventId, JSON.stringify(rawText), webhookStatus],
      );
    } catch (error) {
      logWebhookIngest({
        requestId,
        startedAtMs,
        httpStatus: 500,
        outcome: "error",
        webhookEventId,
        error,
        ...ingestLog,
      });
    }
  }
}
