/**
 * Maps transformed PX payloads to expected Postgres column values (no live DB).
 */
import { describe, expect, it } from "vitest";
import sample from "../fixtures/sample-tive-payloads.json";
import { validateAndTransformTiveToPx } from "../lib/transform/core";

describe("transform → DB column mapping", () => {
  it("maps standard wifi shipment fields to sensor_readings and location_readings columns", () => {
    const item = sample.payloads[0]!;
    const entry = item.payload.EntryTimeEpoch as number;
    const transformed = validateAndTransformTiveToPx(item.payload, entry + 1000);
    expect(transformed.ok).toBe(true);
    if (!transformed.ok) return;

    const { pxSensor, pxLocation, account_id, shipment_id, public_shipment_id, location_method_raw } =
      transformed.value;

    expect({
      device_id: pxSensor.device_id,
      device_imei: pxSensor.device_imei,
      timestamp_ms: pxSensor.timestamp,
      account_id,
      shipment_id,
      public_shipment_id,
      provider: pxSensor.provider,
      device_type: pxSensor.type,
      temperature: pxSensor.temperature,
      humidity: pxSensor.humidity,
      light_level: pxSensor.light_level,
      accelerometer: pxSensor.accelerometer,
    }).toEqual({
      device_id: "A571992",
      device_imei: "863257063350583",
      timestamp_ms: entry,
      account_id: 478,
      shipment_id: "CL-13686/PHARMA-SHIP/COLD-LOGISTICS",
      public_shipment_id: "40X614N4WC",
      provider: "Tive",
      device_type: "Active",
      temperature: 10.08,
      humidity: 38.7,
      light_level: 0,
      accelerometer: { x: -0.563, y: -0.438, z: 0.688, magnitude: 0.99 },
    });

    expect({
      device_id: pxLocation.device_id,
      device_imei: pxLocation.device_imei,
      timestamp_ms: pxLocation.timestamp,
      account_id,
      shipment_id,
      public_shipment_id,
      location_method: location_method_raw,
      provider: pxLocation.provider,
      device_type: pxLocation.type,
      latitude: pxLocation.latitude,
      longitude: pxLocation.longitude,
      altitude: pxLocation.altitude,
      location_accuracy: pxLocation.location_accuracy,
      location_accuracy_category: pxLocation.location_accuracy_category,
      location_source: pxLocation.location_source,
      address: pxLocation.address,
      battery_level: pxLocation.battery_level,
      cellular_dbm: pxLocation.cellular_dbm,
      wifi_access_points: pxLocation.wifi_access_points,
    }).toEqual({
      device_id: "A571992",
      device_imei: "863257063350583",
      timestamp_ms: entry,
      account_id: 478,
      shipment_id: "CL-13686/PHARMA-SHIP/COLD-LOGISTICS",
      public_shipment_id: "40X614N4WC",
      location_method: "wifi",
      provider: "Tive",
      device_type: "Active",
      latitude: 40.810562,
      longitude: -73.879285,
      altitude: null,
      location_accuracy: 23,
      location_accuracy_category: "High",
      location_source: "wifi",
      address: {
        street: null,
        locality: "Bronx",
        state: "NY",
        country: "USA",
        postal_code: "10474",
        full_address: "114 Hunts Point Market, Bronx, NY 10474, USA",
      },
      battery_level: 65,
      cellular_dbm: -100,
      wifi_access_points: 5,
    });
  });
});
