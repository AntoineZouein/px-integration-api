/**
 * Per-customer webhook API keys with rotation (env-based registry, no DB).
 */
import { timingSafeEqual } from "crypto";

export type WebhookAuthResult = { customerId: string };

type CustomerKeyRegistry = Record<string, string[]>;

let keyIndex: Map<string, WebhookAuthResult> | null = null;

function keysEqual(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function dedupeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseCustomerKeyRegistry(): CustomerKeyRegistry {
  const json = process.env.WEBHOOK_API_KEYS;
  if (!json) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("WEBHOOK_API_KEYS must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("WEBHOOK_API_KEYS must be a JSON object");
  }

  const registry: CustomerKeyRegistry = {};
  for (const [customerId, keys] of Object.entries(parsed as Record<string, unknown>)) {
    if (!customerId.trim()) continue;
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) {
      throw new Error(`WEBHOOK_API_KEYS.${customerId} must be an array of strings`);
    }
    const normalized = dedupeKeys(keys);
    if (normalized.length) registry[customerId] = normalized;
  }
  return registry;
}

function buildKeyIndex(): Map<string, WebhookAuthResult> {
  const registry = parseCustomerKeyRegistry();
  const index = new Map<string, WebhookAuthResult>();
  for (const [customerId, keys] of Object.entries(registry)) {
    for (const key of keys) {
      index.set(key, { customerId });
    }
  }
  return index;
}

function getKeyIndex(): Map<string, WebhookAuthResult> {
  if (!keyIndex) keyIndex = buildKeyIndex();
  return keyIndex;
}

/** @internal Vitest only — env changes between tests require a fresh index. */
export function resetWebhookAuthCacheForTests(): void {
  keyIndex = null;
}

export function getApiKeyFromHeaders(headers: Headers): string | null {
  const key = headers.get("x-api-key");
  if (!key) return null;
  const trimmed = key.trim();
  return trimmed.length ? trimmed : null;
}

export function isWebhookApiKeyConfigured(): boolean {
  try {
    return getKeyIndex().size > 0;
  } catch {
    return false;
  }
}

export function resolveWebhookAuth(providedKey: string): WebhookAuthResult | null {
  try {
    const index = getKeyIndex();
    for (const [registeredKey, auth] of index) {
      if (keysEqual(registeredKey, providedKey)) return auth;
    }
    return null;
  } catch {
    return null;
  }
}
