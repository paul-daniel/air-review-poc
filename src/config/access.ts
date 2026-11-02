import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ConfigError } from "../errors.js";

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      return JSON.parse(value);
    } catch {
      /* keep as string */
    }
  }
  return value;
}

export function configGet(config: unknown, path: string): string {
  const value = getPath(config, path);
  if (value === undefined) throw new ConfigError(`Config key not set: ${path}`);
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function configSet(file: string, path: string, value: string): void {
  const parts = path.split(".").filter(Boolean);
  if (file.endsWith(".toml")) {
    editToml(file, path, (root) => setIn(root, parts, coerce(value)));
  } else {
    editYaml(file, path, (doc) => doc.setIn(parts, coerce(value)));
  }
}

export function configUnset(file: string, path: string): void {
  const parts = path.split(".").filter(Boolean);
  if (file.endsWith(".toml")) {
    editToml(file, path, (root) => deleteIn(root, parts));
  } else {
    editYaml(file, path, (doc) => doc.deleteIn(parts));
  }
}

function readRaw(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    throw new ConfigError(`Cannot read config file "${file}": ${(error as Error).message}`, {
      cause: error,
    });
  }
}

interface YamlDocumentLike {
  setIn(path: string[], value: unknown): unknown;
  deleteIn(path: string[]): unknown;
}

/** YAML editing preserves comments. */
function editYaml(file: string, keyPath: string, mutate: (doc: YamlDocumentLike) => unknown): void {
  const raw = readRaw(file);
  let doc;
  try {
    doc = parseDocument(raw, { prettyErrors: true });
    if (doc.errors.length > 0) {
      throw new Error(doc.errors.map((e) => e.message).join("; "));
    }
    mutate(doc as unknown as YamlDocumentLike);
  } catch (error) {
    throw new ConfigError(`Could not update config key ${keyPath}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  writeFile(file, stringifyYaml(doc, { lineWidth: 100 }));
}

/**
 * TOML editing rewrites the document; comments are not preserved by the TOML
 * serializer. Keep comments out of TOML configs or edit them by hand.
 */
function editToml(file: string, keyPath: string, mutate: (root: Record<string, unknown>) => void): void {
  const raw = readRaw(file);
  let root: Record<string, unknown>;
  try {
    root = parseToml(raw) as Record<string, unknown>;
    mutate(root);
  } catch (error) {
    throw new ConfigError(`Could not update config key ${keyPath} in TOML: ${(error as Error).message}`, {
      cause: error,
    });
  }
  writeFile(file, stringifyToml(root));
}

function writeFile(file: string, content: string): void {
  try {
    writeFileSync(file, content);
  } catch (error) {
    throw new ConfigError(`Could not write config file "${file}": ${(error as Error).message}`, {
      cause: error,
    });
  }
}

function setIn(root: Record<string, unknown>, parts: string[], value: unknown): void {
  let current: Record<string, unknown> = root;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next === null || typeof next !== "object") current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (leaf) current[leaf] = value;
}

function deleteIn(root: Record<string, unknown>, parts: string[]): void {
  let current: Record<string, unknown> = root;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next === null || typeof next !== "object") return;
    current = next as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (leaf) delete current[leaf];
}
