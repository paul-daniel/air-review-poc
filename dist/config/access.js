import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ConfigError } from "../errors.js";
function getPath(obj, path) {
    const parts = path.split(".").filter(Boolean);
    let current = obj;
    for (const part of parts) {
        if (current === null || typeof current !== "object")
            return undefined;
        current = current[part];
    }
    return current;
}
function coerce(value) {
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    if (value === "null")
        return null;
    if (value !== "" && !Number.isNaN(Number(value)))
        return Number(value);
    if (value.startsWith("[") || value.startsWith("{")) {
        try {
            return JSON.parse(value);
        }
        catch {
            /* keep as string */
        }
    }
    return value;
}
export function configGet(config, path) {
    const value = getPath(config, path);
    if (value === undefined)
        throw new ConfigError(`Config key not set: ${path}`);
    return typeof value === "string" ? value : JSON.stringify(value);
}
export function configSet(file, path, value) {
    const parts = path.split(".").filter(Boolean);
    if (file.endsWith(".toml")) {
        editToml(file, path, (root) => setIn(root, parts, coerce(value)));
    }
    else {
        editYaml(file, path, (doc) => doc.setIn(parts, coerce(value)));
    }
}
export function configUnset(file, path) {
    const parts = path.split(".").filter(Boolean);
    if (file.endsWith(".toml")) {
        editToml(file, path, (root) => deleteIn(root, parts));
    }
    else {
        editYaml(file, path, (doc) => doc.deleteIn(parts));
    }
}
function readRaw(file) {
    try {
        return readFileSync(file, "utf8");
    }
    catch (error) {
        throw new ConfigError(`Cannot read config file "${file}": ${error.message}`, {
            cause: error,
        });
    }
}
/** YAML editing preserves comments. */
function editYaml(file, keyPath, mutate) {
    const raw = readRaw(file);
    let doc;
    try {
        doc = parseDocument(raw, { prettyErrors: true });
        if (doc.errors.length > 0) {
            throw new Error(doc.errors.map((e) => e.message).join("; "));
        }
        mutate(doc);
    }
    catch (error) {
        throw new ConfigError(`Could not update config key ${keyPath}: ${error.message}`, {
            cause: error,
        });
    }
    writeFile(file, stringifyYaml(doc, { lineWidth: 100 }));
}
/**
 * TOML editing rewrites the document; comments are not preserved by the TOML
 * serializer. Keep comments out of TOML configs or edit them by hand.
 */
function editToml(file, keyPath, mutate) {
    const raw = readRaw(file);
    let root;
    try {
        root = parseToml(raw);
        mutate(root);
    }
    catch (error) {
        throw new ConfigError(`Could not update config key ${keyPath} in TOML: ${error.message}`, {
            cause: error,
        });
    }
    writeFile(file, stringifyToml(root));
}
function writeFile(file, content) {
    try {
        writeFileSync(file, content);
    }
    catch (error) {
        throw new ConfigError(`Could not write config file "${file}": ${error.message}`, {
            cause: error,
        });
    }
}
function setIn(root, parts, value) {
    let current = root;
    for (const part of parts.slice(0, -1)) {
        const next = current[part];
        if (next === null || typeof next !== "object")
            current[part] = {};
        current = current[part];
    }
    const leaf = parts[parts.length - 1];
    if (leaf)
        current[leaf] = value;
}
function deleteIn(root, parts) {
    let current = root;
    for (const part of parts.slice(0, -1)) {
        const next = current[part];
        if (next === null || typeof next !== "object")
            return;
        current = next;
    }
    const leaf = parts[parts.length - 1];
    if (leaf)
        delete current[leaf];
}
//# sourceMappingURL=access.js.map