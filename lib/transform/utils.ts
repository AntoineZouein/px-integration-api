/**
 * Shared small utilities used by the transform/validation package.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // JS Math.round rounds halves toward +infinity for negatives (e.g. -1.5 -> -1).
  // For sensor normalization, use symmetric half-away-from-zero rounding.
  const abs = Math.abs(value);
  return Math.sign(value) * (Math.round(abs * factor) / factor);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function getNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

export function getInteger(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export function firstNonEmptyString(candidates: Array<unknown>): string | null {
  for (const c of candidates) {
    const s = getString(c);
    if (s) return s;
  }
  return null;
}

export function firstMatchingDeviceId(candidates: Array<unknown>): string | null {
  const re = /^[A-Z]\d+$/;
  for (const c of candidates) {
    const s = getString(c);
    if (s && re.test(s)) return s;
  }
  return null;
}

