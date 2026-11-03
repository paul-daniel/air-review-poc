import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, } from "node:fs";
import { resolve } from "node:path";
/**
 * Content-addressed local cache. Reconstructible by design: it only
 * accelerates - the PR ledger and the git history are the truth.
 */
export class LocalCache {
    dir;
    constructor(dir) {
        this.dir = dir;
    }
    keyOf(kind, input) {
        return createHash("sha256").update(`${kind}|${input}`).digest("hex");
    }
    pathOf(key) {
        return resolve(this.dir, `${key}.json`);
    }
    get(kind, input) {
        if (!existsSync(this.dir))
            return null;
        const file = this.pathOf(this.keyOf(kind, input));
        if (!existsSync(file))
            return null;
        try {
            const entry = JSON.parse(readFileSync(file, "utf8"));
            return entry.value;
        }
        catch {
            return null;
        }
    }
    set(kind, input, value) {
        if (!existsSync(this.dir))
            mkdirSync(this.dir, { recursive: true });
        const entry = {
            key: this.keyOf(kind, input),
            createdAt: new Date().toISOString(),
            kind,
            value,
        };
        writeFileSync(this.pathOf(entry.key), JSON.stringify(entry));
    }
    stats() {
        if (!existsSync(this.dir))
            return { entries: 0, bytes: 0, kinds: {} };
        const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
        const kinds = {};
        let bytes = 0;
        for (const file of files) {
            const stat = statSync(resolve(this.dir, file));
            bytes += stat.size;
            try {
                const entry = JSON.parse(readFileSync(resolve(this.dir, file), "utf8"));
                kinds[entry.kind] = (kinds[entry.kind] ?? 0) + 1;
            }
            catch {
                kinds.unknown = (kinds.unknown ?? 0) + 1;
            }
        }
        return { entries: files.length, bytes, kinds };
    }
    prune(options = {}) {
        if (!existsSync(this.dir))
            return 0;
        let removed = 0;
        const cutoff = options.olderThanHours === undefined ? null : Date.now() - options.olderThanHours * 60 * 60 * 1000;
        for (const file of readdirSync(this.dir)) {
            if (!file.endsWith(".json"))
                continue;
            const path = resolve(this.dir, file);
            const stat = statSync(path);
            const tooOld = cutoff !== null && stat.mtimeMs < cutoff;
            let kindMatches = true;
            if (options.kind) {
                try {
                    const entry = JSON.parse(readFileSync(path, "utf8"));
                    kindMatches = entry.kind === options.kind;
                }
                catch {
                    kindMatches = options.kind === "unknown";
                }
            }
            const matchKind = options.kind ? kindMatches : true;
            const matchAge = options.olderThanHours !== undefined ? tooOld : true;
            if (matchKind && matchAge) {
                unlinkSync(path);
                removed += 1;
            }
        }
        return removed;
    }
}
//# sourceMappingURL=local.js.map