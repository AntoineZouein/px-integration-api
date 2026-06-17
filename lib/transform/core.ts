/**
 * Custom validation + transform for incoming Tive webhook payloads.
 */
import {
  firstMatchingDeviceId,
  firstNonEmptyString,
  getInteger,
  getNumber,
  getString,
  isRecord,
  roundTo,
} from "./utils";
import { toPxAddress } from "./address";
import type { PAXAFENormalizedLocationPayload, PAXAFENormalizedSensorPayload } from "./pxTypes.generated";

function accuracyCategoryFromMeters(m: number | null): "High" | "Medium" | "Low" | null {
  if (m === null) return null;
  if (m <= 50) return "High";
  if (m <= 200) return "Medium";
  return "Low";
}

function accuracyCategoryFallback(method: "gps" | "wifi" | "cell" | null): "High" | "Low" | null {
  if (method === "gps" || method === "wifi") return "High";
  if (method === "cell") return "Low";
  return null;
}

export function validateAndTransformTiveToPx(
  payload: unknown,
  receivedAtMs: number,
): (
  | {
      ok: true;
      value: {
        pxSensor: PAXAFENormalizedSensorPayload;
        pxLocation: PAXAFENormalizedLocationPayload;
        account_id: number | null;
        shipment_id: string | null;
        public_shipment_id: string | null;
        location_method_raw: "gps" | "wifi" | "cell" | null;
      };
    }
  | { ok: false; details: Array<{ path: string; message: string }> }
) {
  const details: Array<{ path: string; message: string }> = [];
  if (!isRecord(payload)) {
    return { ok: false, details: [{ path: "", message: "Body must be a JSON object" }] };
  }

  const entryTimeEpoch = getInteger(payload.EntryTimeEpoch);
  if (entryTimeEpoch === null) details.push({ path: "EntryTimeEpoch", message: "Must be an integer epoch ms" });

  // Timestamp window
  if (entryTimeEpoch !== null) {
    const futureLimit = receivedAtMs + 5 * 60 * 1000;
    const staleLimit = receivedAtMs - 12 * 60 * 60 * 1000;
    if (entryTimeEpoch > futureLimit) details.push({ path: "EntryTimeEpoch", message: "Timestamp too far in the future" });
    if (entryTimeEpoch < staleLimit) details.push({ path: "EntryTimeEpoch", message: "Timestamp too far in the past" });
  }

  // Location
  const location = payload.Location;
  if (!isRecord(location)) details.push({ path: "Location", message: "Location is required" });
  const latitude = isRecord(location) ? getNumber(location.Latitude) : null;
  const longitude = isRecord(location) ? getNumber(location.Longitude) : null;
  if (latitude === null) details.push({ path: "Location.Latitude", message: "Latitude must be a number" });
  if (longitude === null) details.push({ path: "Location.Longitude", message: "Longitude must be a number" });
  if (latitude !== null && (latitude < -90 || latitude > 90)) details.push({ path: "Location.Latitude", message: "Latitude out of range" });
  if (longitude !== null && (longitude < -180 || longitude > 180)) details.push({ path: "Location.Longitude", message: "Longitude out of range" });

  // Temperature (PX sensor schema requires a numeric temperature)
  const tempObj = payload.Temperature;
  if (!isRecord(tempObj)) details.push({ path: "Temperature", message: "Temperature is required" });
  let temperatureC: number | null = null;
  if (isRecord(tempObj)) {
    if (tempObj.Celsius === undefined) {
      details.push({ path: "Temperature.Celsius", message: "Temperature.Celsius is required" });
    } else if (tempObj.Celsius === null || getNumber(tempObj.Celsius) === null) {
      details.push({ path: "Temperature.Celsius", message: "Temperature.Celsius must be a number" });
    } else {
      temperatureC = getNumber(tempObj.Celsius);
    }
  }

  // device_id and device_imei resolution
  const shipment = isRecord(payload.Shipment) ? payload.Shipment : null;
  const shipmentDeviceId = shipment && isRecord(shipment) ? shipment.DeviceId : null;

  const deviceId = firstMatchingDeviceId([payload.DeviceName, payload.EntityName, payload.DeviceId, shipmentDeviceId]);
  if (!deviceId) details.push({ path: "device_id", message: "Unable to resolve device_id (must match ^[A-Z]\\d+$)" });

  const deviceImei = firstNonEmptyString([payload.DeviceId, shipmentDeviceId, payload.EntityName, payload.DeviceName]);
  if (!deviceImei) details.push({ path: "device_imei", message: "Unable to resolve device_imei (must be non-empty)" });

  const accountId = payload.AccountId === undefined ? null : getInteger(payload.AccountId);

  const humidityPct = isRecord(payload.Humidity) ? getNumber(payload.Humidity.Percentage) : null;
  const lightLux = isRecord(payload.Light) ? getNumber(payload.Light.Lux) : null;
  const batteryPct = isRecord(payload.Battery) ? getInteger(payload.Battery.Percentage) : null;
  const cellularDbm = isRecord(payload.Cellular) ? getNumber(payload.Cellular.Dbm) : null;
  const wifiApCount = isRecord(location) ? getInteger(location.WifiAccessPointUsedCount) : null;

  const formattedAddress = isRecord(location) ? getString(location.FormattedAddress) : null;

  const locationMethodRaw = ((): "gps" | "wifi" | "cell" | null => {
    const v = isRecord(location) ? getString(location.LocationMethod) : null;
    if (v === "gps" || v === "wifi" || v === "cell") return v;
    return null;
  })();

  const accuracy = isRecord(location) ? location.Accuracy : null;
  const accuracyM = (() => {
    if (!isRecord(accuracy)) return null;
    const meters = getNumber(accuracy.Meters);
    if (meters !== null) return Math.round(meters);
    const km = getNumber(accuracy.Kilometers);
    if (km !== null) return Math.round(km * 1000);
    const miles = getNumber(accuracy.Miles);
    if (miles !== null) return Math.round(miles * 1609.34);
    return null;
  })();

  // Shipment identifiers
  const shipment_id = getString(payload.ShipmentId);
  const public_shipment_id = getString(payload.PublicShipmentId);

  const accel = (() => {
    const a = payload.Accelerometer;
    if (!isRecord(a)) return null;
    return {
      x: a.X === null ? null : getNumber(a.X),
      y: a.Y === null ? null : getNumber(a.Y),
      z: a.Z === null ? null : getNumber(a.Z),
      g: a.G === null ? null : getNumber(a.G),
    };
  })();

  if (details.length) return { ok: false, details };

  const pxSensor: PAXAFENormalizedSensorPayload = {
    device_id: deviceId!,
    device_imei: deviceImei!,
    timestamp: entryTimeEpoch!,
    provider: "Tive",
    type: "Active",
    temperature: roundTo(temperatureC!, 2),
    humidity: humidityPct === null ? null : roundTo(humidityPct, 1),
    light_level: lightLux === null ? null : roundTo(lightLux, 1),
    accelerometer: accel
      ? {
          x: accel.x === null ? null : roundTo(accel.x, 3),
          y: accel.y === null ? null : roundTo(accel.y, 3),
          z: accel.z === null ? null : roundTo(accel.z, 3),
          magnitude: accel.g === null ? null : roundTo(accel.g, 3),
        }
      : null,
    tilt: null,
    box_open: null,
  };

  const meters = accuracyM;
  const category = meters !== null ? accuracyCategoryFromMeters(meters) : accuracyCategoryFallback(locationMethodRaw);

  const pxLocation: PAXAFENormalizedLocationPayload = {
    device_id: deviceId!,
    device_imei: deviceImei!,
    timestamp: entryTimeEpoch!,
    provider: "Tive",
    type: "Active",
    latitude: latitude!,
    longitude: longitude!,
    altitude: null,
    location_accuracy: meters,
    location_accuracy_category: category,
    location_source: locationMethodRaw,
    address: toPxAddress(formattedAddress),
    battery_level: batteryPct,
    cellular_dbm: cellularDbm === null ? null : roundTo(cellularDbm, 2),
    cellular_network_type: null,
    cellular_operator: null,
    wifi_access_points: wifiApCount,
  };

  return {
    ok: true,
    value: {
      account_id: accountId,
      shipment_id,
      public_shipment_id,
      location_method_raw: locationMethodRaw,
      pxSensor,
      pxLocation,
    },
  };
}

