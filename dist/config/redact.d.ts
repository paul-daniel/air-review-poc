/**
 * Deep-copy a config for display, masking anything that looks like a secret.
 * Values are never printed in full, only a short tail for identification.
 */
export declare function redactConfig(value: unknown, key?: string): unknown;
