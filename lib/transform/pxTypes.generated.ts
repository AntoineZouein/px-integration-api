/**
 * AUTO-GENERATED FILE — do not edit by hand.
 *
 * Generated from:
 * - fixtures/px-sensor-schema.json
 * - fixtures/px-location-schema.json
 */

/**
 * Standardized sensor data format for pharmaceutical cold chain monitoring
 */
export interface PAXAFENormalizedSensorPayload {
  /**
   * Device identifier (from DeviceName)
   */
  device_id: string;
  /**
   * Device IMEI or unique hardware identifier
   */
  device_imei: string;
  /**
   * Timestamp in epoch milliseconds
   */
  timestamp: number;
  /**
   * Data provider name
   */
  provider: "Paxafe" | "Tive" | "TagnTrac" | "Others" | "Elpro" | "kn" | "peli" | "tempmate";
  /**
   * Device type - Active for real-time trackers
   */
  type: "Passive" | "Active" | "ELD" | "AIS" | "ADS";
  /**
   * Temperature reading in Celsius (2 decimal points)
   */
  temperature: number | null;
  /**
   * Humidity percentage (1 decimal point)
   */
  humidity?: number | null;
  /**
   * Light level in Lux (1 decimal point)
   */
  light_level?: number | null;
  /**
   * Accelerometer readings
   */
  accelerometer?: {
    /**
     * X-axis acceleration (3 decimal points)
     */
    x?: number | null;
    /**
     * Y-axis acceleration (3 decimal points)
     */
    y?: number | null;
    /**
     * Z-axis acceleration (3 decimal points)
     */
    z?: number | null;
    /**
     * Acceleration magnitude in G-force (3 decimal points)
     */
    magnitude?: number | null;
  } | null;
  /**
   * Tilt angles (not typically available from Tive)
   */
  tilt?: {
    x?: number | null;
    y?: number | null;
    z?: number | null;
    tilt?: number | null;
  } | null;
  /**
   * Box open/close indicator
   */
  box_open?: boolean | null;
}


/**
 * Standardized location data format for pharmaceutical cold chain tracking
 */
export interface PAXAFENormalizedLocationPayload {
  /**
   * Device identifier
   */
  device_id: string;
  /**
   * Device IMEI or unique hardware identifier
   */
  device_imei: string;
  /**
   * Timestamp in epoch milliseconds
   */
  timestamp: number;
  /**
   * Data provider name
   */
  provider: "Paxafe" | "Tive" | "TagnTrac" | "Others" | "Elpro" | "kn" | "peli" | "tempmate";
  /**
   * Device type
   */
  type: "Passive" | "Active" | "ELD" | "AIS" | "ADS";
  /**
   * Latitude coordinate
   */
  latitude: number;
  /**
   * Longitude coordinate
   */
  longitude: number;
  /**
   * Altitude in meters (2 decimal points)
   */
  altitude?: number | null;
  /**
   * Location accuracy in meters (integer)
   */
  location_accuracy?: number | null;
  /**
   * Location accuracy category
   */
  location_accuracy_category?: "High" | "Medium" | "Low" | null;
  /**
   * Source of location data (GPS, WiFi, Cellular)
   */
  location_source?: string | null;
  /**
   * Physical address information
   */
  address?: PxAddress | null;
  /**
   * Battery percentage (integer 0-100)
   */
  battery_level?: number | null;
  /**
   * Cellular signal strength in dBm (2 decimal points)
   */
  cellular_dbm?: number | null;
  /**
   * Cellular network technology type
   */
  cellular_network_type?: string | null;
  /**
   * Cellular network operator
   */
  cellular_operator?: string | null;
  /**
   * Number of WiFi access points detected
   */
  wifi_access_points?: number | null;
}
/**
 * Physical address information
 */
export interface PxAddress {
  /**
   * Street address
   */
  street?: string | null;
  /**
   * City or locality
   */
  locality?: string | null;
  /**
   * State or province
   */
  state?: string | null;
  /**
   * Country
   */
  country?: string | null;
  /**
   * Postal or ZIP code
   */
  postal_code?: string | null;
  /**
   * Complete formatted address
   */
  full_address?: string | null;
}

