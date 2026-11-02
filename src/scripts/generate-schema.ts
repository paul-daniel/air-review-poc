import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { configSchema } from "../config/schema.js";

const jsonSchema = zodToJsonSchema(configSchema, {
  name: "AirReviewConfig",
  $refStrategy: "none",
});

jsonSchema.description =
  "Configuration schema for air-review. Every option has a default; see docs/configuration.md.";

const dir = resolve(process.cwd(), "schema");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "air-review.schema.json"), `${JSON.stringify(jsonSchema, null, 2)}\n`);
process.stdout.write("wrote schema/air-review.schema.json\n");
