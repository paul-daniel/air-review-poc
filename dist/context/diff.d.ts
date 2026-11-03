import type { FileChange, RepositoryDelta } from "../contracts/scm.js";
/**
 * Parse a unified diff produced by `git diff` (or the GitHub diff media type)
 * into a structured repository delta.
 */
export declare function parseUnifiedDiff(diff: string, fromSha: string, toSha: string): RepositoryDelta;
/**
 * Files whose diff is noise for a reviewer: lock files, minified bundles,
 * generated snapshots and binaries. They stay in the file list (so the
 * change is visible) but their hunks are replaced by a one-line note, so a
 * 10,000-line `package-lock.json` cannot push the real code out of the
 * prompt window.
 */
export declare const NOISE_DIFF_FILE: RegExp;
/**
 * Remove the hunks of noise files from a unified diff, keeping a header line
 * per omitted file so the model knows the file changed.
 */
export declare function filterDiff(diff: string, isNoise?: (path: string) => boolean): {
    diff: string;
    omitted: string[];
};
/** Files with an added/modified status, i.e. the review surface of the delta. */
export declare function reviewableFiles(delta: RepositoryDelta): FileChange[];
