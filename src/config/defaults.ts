import { configSchema, type AirReviewConfig } from "./schema.js";

export function defaultConfig(): AirReviewConfig {
  return configSchema.parse({});
}
