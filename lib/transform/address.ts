/**
 * Best-effort conversion of Tive `Location.FormattedAddress` into PAXAFE address shape.
 */
import { getString } from "./utils";
import type { PxAddress } from "./pxTypes.generated";

export function toPxAddress(formattedAddress: unknown): PxAddress | null {
  const full = getString(formattedAddress);
  if (!full) return null;

  // Per DESIGN_DECISIONS.md: follow schema example convention
  // - keep street null
  // - best-effort US-style parse "City, ST ZIP, Country"
  //
  // Example: "114 Hunts Point Market, Bronx, NY 10474, USA"
  const usRegex = /,\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?,\s*([^,]+)\s*$/;
  const match = full.match(usRegex);

  const locality = match ? match[1].trim() : null;
  const state = match ? match[2].trim() : null;
  const postal_code = match ? match[3].trim() : null;
  const country = match ? match[4].trim() : null;

  return {
    street: null,
    locality,
    state,
    country,
    postal_code,
    full_address: full,
  };
}

