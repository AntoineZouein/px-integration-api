import fs from "node:fs";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log("Schema applied. Tables:", rows.map((r) => r.table_name).join(", "));
} catch (e) {
  console.error("SCHEMA_ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await client.end();
}
