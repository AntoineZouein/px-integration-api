/**
 * Per-customer API key registry and rotation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getApiKeyFromHeaders,
  isWebhookApiKeyConfigured,
  resetWebhookAuthCacheForTests,
  resolveWebhookAuth,
} from "../lib/auth";

describe("webhook API key auth", () => {
  beforeEach(() => {
    delete process.env.WEBHOOK_API_KEYS;
    resetWebhookAuthCacheForTests();
  });

  afterEach(() => {
    delete process.env.WEBHOOK_API_KEYS;
    resetWebhookAuthCacheForTests();
  });

  it("accepts per-customer keys and rotation (multiple valid keys)", () => {
    process.env.WEBHOOK_API_KEYS = JSON.stringify({
      acme: ["current-key", "previous-key"],
    });
    resetWebhookAuthCacheForTests();
    expect(resolveWebhookAuth("current-key")).toEqual({ customerId: "acme" });
    expect(resolveWebhookAuth("previous-key")).toEqual({ customerId: "acme" });
    expect(resolveWebhookAuth("unknown-key")).toBeNull();
  });

  it("reports unconfigured when WEBHOOK_API_KEYS is unset", () => {
    expect(isWebhookApiKeyConfigured()).toBe(false);
  });

  it("reports unconfigured when WEBHOOK_API_KEYS is empty object", () => {
    process.env.WEBHOOK_API_KEYS = "{}";
    resetWebhookAuthCacheForTests();
    expect(isWebhookApiKeyConfigured()).toBe(false);
  });

  it("reads X-API-Key header", () => {
    const headers = new Headers({ "x-api-key": "  my-key  " });
    expect(getApiKeyFromHeaders(headers)).toBe("my-key");
  });

  it("treats malformed WEBHOOK_API_KEYS JSON as unconfigured", () => {
    process.env.WEBHOOK_API_KEYS = "{not-json";
    resetWebhookAuthCacheForTests();
    expect(isWebhookApiKeyConfigured()).toBe(false);
    expect(resolveWebhookAuth("any-key")).toBeNull();
  });

  it("treats non-object WEBHOOK_API_KEYS as unconfigured", () => {
    process.env.WEBHOOK_API_KEYS = "[]";
    resetWebhookAuthCacheForTests();
    expect(isWebhookApiKeyConfigured()).toBe(false);
    expect(resolveWebhookAuth("any-key")).toBeNull();
  });

  it("treats invalid customer key entries as unconfigured", () => {
    process.env.WEBHOOK_API_KEYS = JSON.stringify({ acme: "not-an-array" });
    resetWebhookAuthCacheForTests();
    expect(isWebhookApiKeyConfigured()).toBe(false);
    expect(resolveWebhookAuth("any-key")).toBeNull();
  });
});
