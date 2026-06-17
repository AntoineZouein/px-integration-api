/**
 * Postgres connection pool helper for serverless runtimes.
 */
import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL");
  }

  pool = new Pool({
    connectionString,
    // Keep a small pool; serverless may fan out.
    max: 5,
  });

  return pool;
}

