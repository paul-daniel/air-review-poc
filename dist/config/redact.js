/**
 * Keys that hold secrets. Deliberately precise: `apiKeyEnv` or `apiKeyHeader`
 * hold names, not values, and must not be masked.
 */
const SECRET_KEY = /^(api_?key|auth(orization)?|x-api-key|proxy-authorization|token|.*_token|secret|.*_secret|password|credentials?)$/i;
/**
 * Deep-copy a config for display, masking anything that looks like a secret.
 * Values are never printed in full, only a short tail for identification.
 */
export function redactConfig(value, key = "") {
    if (Array.isArray(value))
        return value.map((item) => redactConfig(item, key));
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
            childKey,
            redactConfig(childValue, childKey),
        ]));
    }
    if (typeof value === "string" && SECRET_KEY.test(key)) {
        return value.length > 4 ? `***${value.slice(-4)}` : "***";
    }
    return value;
}
//# sourceMappingURL=redact.js.map