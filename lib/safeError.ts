/**
 * Normalizes unknown thrown values into a safe, loggable shape.
 * Intended for server-side logs only (not for client responses).
 */
export function safeError(e: unknown): { name?: string; message: string; stack?: string } {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
    };
  }
  return { message: typeof e === "string" ? e : JSON.stringify(e) };
}

