/**
 * Transform unit tests (golden-ish expectations + JSON Schema conformance).
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import pxSensorSchema from "../fixtures/px-sensor-schema.json";
import pxLocationSchema from "../fixtures/px-location-schema.json";
import sample from "../fixtures/sample-tive-payloads.json";
import { validateAndTransformTiveToPx } from "../lib/transform/core";

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePxSensor = ajv.compile(pxSensorSchema);
const validatePxLocation = ajv.compile(pxLocationSchema);

function assertSchemaOk(ok: boolean, errors: unknown) {
  if (!ok) {
    throw new Error(JSON.stringify(errors, null, 2));
  }
}

/** Expected transform outcome per `invalid_payloads` fixture (mixed pass/fail by design). */
const INVALID_PAYLOAD_EXPECT_OK: Record<string, boolean> = {
  "Missing Device Identifiers - Scenario A": true,
  "Missing Device Identifiers - Scenario B": true,
  "Invalid Latitude": false,
  "Invalid Longitude": false,
  "Timestamp in Future": false,
  "Old Timestamp": false,
};

describe("Tive -> PAXAFE transform", () => {
  it("transforms each valid sample payload", () => {
    for (const item of sample.payloads) {
      const entry = item.payload.EntryTimeEpoch as number;
      const receivedAtMs = entry + 1000;
      const transformed = validateAndTransformTiveToPx(item.payload, receivedAtMs);

      expect(transformed.ok, item.name).toBe(true);
      if (!transformed.ok) continue;

      const { pxSensor, pxLocation } = transformed.value;
      assertSchemaOk(validatePxSensor(pxSensor), validatePxSensor.errors);
      assertSchemaOk(validatePxLocation(pxLocation), validatePxLocation.errors);
    }
  });

  it("matches key example expectations (standard wifi shipment)", () => {
    const item = sample.payloads[0]!;
    const entry = item.payload.EntryTimeEpoch as number;
    const receivedAtMs = entry + 1000;
    const transformed = validateAndTransformTiveToPx(item.payload, receivedAtMs);
    expect(transformed.ok).toBe(true);
    if (!transformed.ok) return;

    const { pxSensor, pxLocation } = transformed.value;

    expect(pxSensor.device_id).toBe("A571992");
    expect(pxSensor.device_imei).toBe("863257063350583");
    expect(pxSensor.temperature).toBe(10.08);
    expect(pxSensor.humidity).toBe(38.7);
    expect(pxSensor.accelerometer?.x).toBe(-0.563);

    expect(pxLocation.location_source).toBe("wifi");
    expect(pxLocation.location_accuracy).toBe(23);
    expect(pxLocation.location_accuracy_category).toBe("High");
    expect(pxLocation.address?.locality).toBe("Bronx");
    expect(pxLocation.address?.state).toBe("NY");
    expect(pxLocation.address?.postal_code).toBe("10474");
    expect(pxLocation.address?.street).toBeNull();
  });

  it("rejects device_id when no candidate matches ^[A-Z]\\d+$", () => {
    const item = sample.payloads[0]!;
    const entry = item.payload.EntryTimeEpoch as number;
    const payload = {
      ...item.payload,
      EntityName: "Ship33CABOL",
      DeviceName: "Ship33CABOL",
      DeviceId: "863257063350583",
    };
    const transformed = validateAndTransformTiveToPx(payload, entry + 1000);
    expect(transformed.ok).toBe(false);
    if (transformed.ok) return;
    expect(transformed.details.some((d) => d.path === "device_id")).toBe(true);
  });

  it("transforms GPS and cellular payloads with B/C-prefixed device_id", () => {
    const gpsSample = sample.payloads.find((p) => p.name === "GPS Location Shipment")!;
    const cellSample = sample.payloads.find((p) => p.name === "Cellular Location Only")!;

    const gpsEntry = gpsSample.payload.EntryTimeEpoch as number;
    const gps = validateAndTransformTiveToPx(gpsSample.payload, gpsEntry + 1000);
    expect(gps.ok).toBe(true);
    if (gps.ok) {
      expect(gps.value.pxSensor.device_id).toBe("B234567");
      expect(gps.value.pxLocation.location_source).toBe("gps");
      expect(gps.value.pxLocation.location_accuracy).toBe(5);
      expect(gps.value.pxLocation.location_accuracy_category).toBe("High");
      expect(gps.value.location_method_raw).toBe("gps");
      assertSchemaOk(validatePxSensor(gps.value.pxSensor), validatePxSensor.errors);
      assertSchemaOk(validatePxLocation(gps.value.pxLocation), validatePxLocation.errors);
    }

    const cellEntry = cellSample.payload.EntryTimeEpoch as number;
    const cell = validateAndTransformTiveToPx(cellSample.payload, cellEntry + 1000);
    expect(cell.ok).toBe(true);
    if (cell.ok) {
      expect(cell.value.pxSensor.device_id).toBe("C345678");
      expect(cell.value.pxLocation.location_source).toBe("cell");
      expect(cell.value.pxLocation.location_accuracy).toBe(500);
      expect(cell.value.pxLocation.location_accuracy_category).toBe("Low");
      expect(cell.value.location_method_raw).toBe("cell");
      assertSchemaOk(validatePxSensor(cell.value.pxSensor), validatePxSensor.errors);
      assertSchemaOk(validatePxLocation(cell.value.pxLocation), validatePxLocation.errors);
    }
  });

  it("rejects null Temperature.Celsius (PX requires temperature)", () => {
    const item = sample.payloads[0]!;
    const entry = item.payload.EntryTimeEpoch as number;
    const payload = {
      ...item.payload,
      Temperature: { Celsius: null, Fahrenheit: null },
    };
    const transformed = validateAndTransformTiveToPx(payload, entry + 1000);
    expect(transformed.ok).toBe(false);
    if (transformed.ok) return;
    expect(transformed.details.some((d) => d.path === "Temperature.Celsius")).toBe(true);
  });

  it("handles each invalid_payloads entry", () => {
    const receivedAtMs = 1739215646000;

    for (const item of sample.invalid_payloads) {
      const expectedOk = INVALID_PAYLOAD_EXPECT_OK[item.name];
      expect(expectedOk, `missing expectation for invalid payload: ${item.name}`).toBeDefined();

      const transformed = validateAndTransformTiveToPx(item.payload, receivedAtMs);
      expect(transformed.ok, item.name).toBe(expectedOk);

      if (item.name === "Missing Device Identifiers - Scenario B" && transformed.ok) {
        expect(transformed.value.pxSensor.device_imei).toBe("A571992");
      }
    }
  });
});
