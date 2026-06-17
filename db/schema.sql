-- Integration API DB schema (plain SQL)
-- Tables per DESIGN_DECISIONS.md
-- No PRIMARY KEY, FOREIGN KEY, UNIQUE, or INDEX constraints (sharding flexibility).
-- CHECK constraints are used for small invariants only.

CREATE TABLE IF NOT EXISTS webhook_events (
  webhook_event_id UUID NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected'))
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  webhook_event_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  device_imei TEXT NOT NULL,
  timestamp_ms BIGINT NOT NULL,
  account_id INTEGER NULL,
  shipment_id TEXT NULL,
  public_shipment_id TEXT NULL,
  provider TEXT NOT NULL,
  device_type TEXT NOT NULL,
  temperature DOUBLE PRECISION NULL,
  humidity DOUBLE PRECISION NULL,
  light_level DOUBLE PRECISION NULL,
  accelerometer JSONB NULL
);

CREATE TABLE IF NOT EXISTS location_readings (
  webhook_event_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  device_imei TEXT NOT NULL,
  timestamp_ms BIGINT NOT NULL,
  account_id INTEGER NULL,
  shipment_id TEXT NULL,
  public_shipment_id TEXT NULL,
  location_method TEXT NULL,
  provider TEXT NOT NULL,
  device_type TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION NULL,
  location_accuracy INTEGER NULL,
  location_accuracy_category TEXT NULL,
  location_source TEXT NULL,
  address JSONB NULL,
  battery_level INTEGER NULL,
  cellular_dbm DOUBLE PRECISION NULL,
  wifi_access_points INTEGER NULL
);
