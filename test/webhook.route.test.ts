/**
 * Webhook route integration tests (mocked Postgres + rate limit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sample from "../fixtures/sample-tive-payloads.json";

const mockQuery = vi.fn().mockResolvedValue({ rows: [] });

vi.mock("@/lib/db", () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true, remaining: 199, resetAtMs: Date.now() + 300_000 }),
}));

vi.mock("@/lib/log", () => ({
  logWebhookIngest: vi.fn(),
}));

import { POST } from "@/app/api/webhook/tive/route";
import { resetWebhookAuthCacheForTests } from "@/lib/auth";
import { validateAndTransformTiveToPx } from "@/lib/transform/core";

const API_KEY = "test-webhook-key";

function webhookRequest(body: string, apiKey?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== undefined) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/webhook/tive", {
    method: "POST",
    headers,
    body,
  });
}

function webhookRequestJson(body: unknown, apiKey?: string): Request {
  return webhookRequest(JSON.stringify(body), apiKey);
}

describe("POST /api/webhook/tive", () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [] });
    delete process.env.WEBHOOK_API_KEYS;
    process.env.WEBHOOK_API_KEYS = JSON.stringify({ test: [API_KEY] });
    resetWebhookAuthCacheForTests();
  });

  it("returns 401 when X-API-Key is missing", async () => {
    const resp = await POST(webhookRequestJson({}));
    expect(resp.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 401 when X-API-Key is wrong", async () => {
    const resp = await POST(webhookRequestJson({}, "wrong-key"));
    expect(resp.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 503 when WEBHOOK_API_KEYS is not configured", async () => {
    delete process.env.WEBHOOK_API_KEYS;
    resetWebhookAuthCacheForTests();
    const resp = await POST(webhookRequestJson({}, API_KEY));
    expect(resp.status).toBe(503);
    const body = await resp.json();
    expect(body.error).toBe("ServiceUnavailable");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 400 with webhook_event_id on invalid JSON (still persists parent)", async () => {
    const resp = await POST(webhookRequest("{not-json", API_KEY));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toBe("ValidationError");
    expect(body.webhook_event_id).toBeTruthy();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toMatch(/INSERT INTO webhook_events/);
    const rawPayload = mockQuery.mock.calls[0]![1]![1] as string;
    expect(JSON.parse(rawPayload)).toBe("{not-json");
    expect(mockQuery.mock.calls[0]![1]![2]).toBe("rejected");
  });

  it("returns 400 with webhook_event_id on validation failure (still persists parent)", async () => {
    const minimal = sample.payloads.find((p) => p.name === "Minimal Data Payload")!;
    const resp = await POST(webhookRequestJson(minimal.payload, API_KEY));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toBe("ValidationError");
    expect(body.webhook_event_id).toBeTruthy();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toMatch(/INSERT INTO webhook_events/);
  });

  it("returns 200 and persists parent + children on valid payload", async () => {
    const standard = sample.payloads[0]!;
    const entry = Date.now();
    const payload = {
      ...standard.payload,
      EntryTimeEpoch: entry,
    };
    const transformed = validateAndTransformTiveToPx(payload, entry);
    expect(transformed.ok).toBe(true);
    if (!transformed.ok) return;

    const resp = await POST(webhookRequestJson(payload, API_KEY));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.webhook_event_id).toBeTruthy();
    expect(body.sensor?.device_id).toBe("A571992");
    expect(body.location?.location_source).toBe("wifi");
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[0]![0]).toMatch(/sensor_readings/);
    expect(mockQuery.mock.calls[1]![0]).toMatch(/location_readings/);
    expect(mockQuery.mock.calls[2]![0]).toMatch(/INSERT INTO webhook_events/);
    expect(mockQuery.mock.calls[2]![1]![2]).toBe("accepted");

    const webhookEventId = body.webhook_event_id as string;
    const { pxSensor, pxLocation, account_id, shipment_id, public_shipment_id, location_method_raw } =
      transformed.value;

    expect(mockQuery.mock.calls[0]![1]).toEqual([
      webhookEventId,
      pxSensor.device_id,
      pxSensor.device_imei,
      pxSensor.timestamp,
      account_id,
      shipment_id,
      public_shipment_id,
      pxSensor.provider,
      pxSensor.type,
      pxSensor.temperature,
      pxSensor.humidity ?? null,
      pxSensor.light_level ?? null,
      pxSensor.accelerometer ? JSON.stringify(pxSensor.accelerometer) : null,
    ]);

    expect(mockQuery.mock.calls[1]![1]).toEqual([
      webhookEventId,
      pxLocation.device_id,
      pxLocation.device_imei,
      pxLocation.timestamp,
      account_id,
      shipment_id,
      public_shipment_id,
      location_method_raw,
      pxLocation.provider,
      pxLocation.type,
      pxLocation.latitude,
      pxLocation.longitude,
      pxLocation.altitude ?? null,
      pxLocation.location_accuracy ?? null,
      pxLocation.location_accuracy_category ?? null,
      pxLocation.location_source ?? null,
      pxLocation.address ? JSON.stringify(pxLocation.address) : null,
      pxLocation.battery_level ?? null,
      pxLocation.cellular_dbm ?? null,
      pxLocation.wifi_access_points ?? null,
    ]);
  });

  it("returns 500 when a child insert fails (still persists rejected parent)", async () => {
    const standard = sample.payloads[0]!;
    const payload = {
      ...standard.payload,
      EntryTimeEpoch: Date.now(),
    };
    mockQuery.mockRejectedValueOnce(new Error("sensor insert failed"));

    const resp = await POST(webhookRequestJson(payload, API_KEY));
    expect(resp.status).toBe(500);
    const body = await resp.json();
    expect(body.error).toBe("InternalError");
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0]![0]).toMatch(/sensor_readings/);
    expect(mockQuery.mock.calls[1]![0]).toMatch(/INSERT INTO webhook_events/);
    expect(mockQuery.mock.calls[1]![1]![2]).toBe("rejected");
  });

  it("returns 413 when payload exceeds 1 MiB", async () => {
    const resp = await POST(webhookRequest("x".repeat(1024 * 1024 + 1), API_KEY));
    expect(resp.status).toBe(413);
    const body = await resp.json();
    expect(body.error).toBe("PayloadTooLarge");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
