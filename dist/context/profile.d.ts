/**
 * Repository profile: a cheap, language-agnostic identity card for the repo
 * (languages, frameworks, package manager, tests, i18n folders, lint setup).
 * It replaces guesswork in the prompt with facts, and it is what lets the
 * reviewer talk about "this repository" rather than "an Angular project".
 */
export interface RepoProfile {
    totalFiles: number;
    /** Top source languages by file count, as extensions. */
    languages: Array<{
        extension: string;
        files: number;
    }>;
    frameworks: string[];
    packageManager?: string;
    testFrameworks: string[];
    /** Folders that look like translation bundles. */
    i18nDirs: string[];
    /** Lint/format configuration files present at the repository root. */
    lintConfigs: string[];
}
export declare function profileRepository(trackedFiles: string[], readFile: (path: string) => string): RepoProfile;
/** One-paragraph rendering for prompts and `inspect`. */
export declare function describeProfile(profile: RepoProfile): string;
