/**
 * Generates TypeScript types from PAXAFE output JSON Schemas.
 *
 * Source of truth: `fixtures/px-*-schema.json`
 * Output: `lib/transform/pxTypes.generated.ts`
 */
import { compileFromFile } from "json-schema-to-typescript";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const fixturesDir = path.join(root, "fixtures");
const outDir = path.join(root, "lib", "transform");
const outFile = path.join(outDir, "pxTypes.generated.ts");

const banner = `/**
 * AUTO-GENERATED FILE — do not edit by hand.
 *
 * Generated from:
 * - fixtures/px-sensor-schema.json
 * - fixtures/px-location-schema.json
 */`;

const compileOpts = {
  // We'll add our own banner once (below).
  bannerComment: "",
  style: { singleQuote: false },
  additionalProperties: false,
};

const sensor = await compileFromFile(path.join(fixturesDir, "px-sensor-schema.json"), compileOpts);
const location = await compileFromFile(path.join(fixturesDir, "px-location-schema.json"), compileOpts);

await mkdir(outDir, { recursive: true });
await writeFile(
  outFile,
  `${banner}\n\n${sensor}\n\n${location}\n`,
  "utf8",
);

console.log(`Wrote ${path.relative(root, outFile)}`);

