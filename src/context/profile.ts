/**
 * Repository profile: a cheap, language-agnostic identity card for the repo
 * (languages, frameworks, package manager, tests, i18n folders, lint setup).
 * It replaces guesswork in the prompt with facts, and it is what lets the
 * reviewer talk about "this repository" rather than "an Angular project".
 */

export interface RepoProfile {
  totalFiles: number;
  /** Top source languages by file count, as extensions. */
  languages: Array<{ extension: string; files: number }>;
  frameworks: string[];
  packageManager?: string;
  testFrameworks: string[];
  /** Folders that look like translation bundles. */
  i18nDirs: string[];
  /** Lint/format configuration files present at the repository root. */
  lintConfigs: string[];
}

const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "html",
  "scss",
  "css",
  "less",
  "py",
  "java",
  "kt",
  "cs",
  "go",
  "rs",
  "rb",
  "php",
  "swift",
  "dart",
  "sql",
  "sh",
]);

const FRAMEWORK_DEPENDENCIES: Record<string, string> = {
  "@angular/core": "Angular",
  react: "React",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  svelte: "Svelte",
  "@sveltejs/kit": "SvelteKit",
  "@nestjs/core": "NestJS",
  express: "Express",
  fastify: "Fastify",
  "@ngrx/store": "NgRx",
  rxjs: "RxJS",
  "@tanstack/react-query": "TanStack Query",
  tailwindcss: "Tailwind CSS",
  "@ngx-translate/core": "ngx-translate",
  "@angular/localize": "Angular i18n",
  i18next: "i18next",
};

const TEST_DEPENDENCIES: Record<string, string> = {
  vitest: "Vitest",
  jest: "Jest",
  mocha: "Mocha",
  jasmine: "Jasmine",
  "jasmine-core": "Jasmine",
  karma: "Karma",
  cypress: "Cypress",
  "@playwright/test": "Playwright",
  "@testing-library/angular": "Testing Library",
  "@testing-library/react": "Testing Library",
};

const ROOT_MARKERS: Array<{ file: RegExp; framework: string }> = [
  { file: /^pom\.xml$/, framework: "Java (Maven)" },
  { file: /^build\.gradle(\.kts)?$/, framework: "JVM (Gradle)" },
  { file: /\.csproj$/, framework: ".NET" },
  { file: /^(requirements\.txt|pyproject\.toml|setup\.py)$/, framework: "Python" },
  { file: /^go\.mod$/, framework: "Go" },
  { file: /^Cargo\.toml$/, framework: "Rust" },
  { file: /^composer\.json$/, framework: "PHP (Composer)" },
  { file: /^pubspec\.yaml$/, framework: "Flutter/Dart" },
  { file: /^Gemfile$/, framework: "Ruby" },
  { file: /^angular\.json$/, framework: "Angular CLI" },
  { file: /^nx\.json$/, framework: "Nx workspace" },
];

const LOCK_FILES: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lockb": "bun",
  "bun.lock": "bun",
};

const LINT_CONFIG =
  /^(\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?js|eslint\.config\.ts|\.prettierrc(\.[a-z]+)?|prettier\.config\.[cm]?js|biome\.json|\.editorconfig|tslint\.json|\.stylelintrc(\.[a-z]+)?|\.rubocop\.yml|\.flake8|ruff\.toml|\.golangci\.yml)$/;
const I18N_DIR = /(^|\/)(i18n|locales?|translations?|lang|messages)$/i;

export function profileRepository(trackedFiles: string[], readFile: (path: string) => string): RepoProfile {
  const byExtension = new Map<string, number>();
  const i18nDirs = new Set<string>();
  const lintConfigs: string[] = [];
  const frameworks = new Set<string>();
  const testFrameworks = new Set<string>();
  let packageManager: string | undefined;

  for (const path of trackedFiles) {
    const base = path.split("/").pop() ?? path;
    const extension = base.includes(".") ? (base.split(".").pop() ?? "").toLowerCase() : "";
    if (SOURCE_EXTENSIONS.has(extension)) byExtension.set(extension, (byExtension.get(extension) ?? 0) + 1);
    const dir = path.slice(0, Math.max(0, path.length - base.length - 1));
    if (I18N_DIR.test(dir)) i18nDirs.add(dir);
    if (!path.includes("/")) {
      if (LINT_CONFIG.test(base)) lintConfigs.push(base);
      if (LOCK_FILES[base]) packageManager = LOCK_FILES[base];
      for (const marker of ROOT_MARKERS) if (marker.file.test(base)) frameworks.add(marker.framework);
    }
  }

  try {
    const pkg = JSON.parse(readFile("package.json") || "{}") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      packageManager?: string;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, label] of Object.entries(FRAMEWORK_DEPENDENCIES)) {
      const version = deps[dep];
      if (version) {
        // "catalog:", "workspace:*" and similar pnpm/yarn protocols carry no version.
        const semver = version.match(/\d+(\.\d+){0,2}/)?.[0];
        frameworks.add(label === "Angular" && semver ? `Angular ${semver}` : label);
      }
    }
    for (const [dep, label] of Object.entries(TEST_DEPENDENCIES)) if (deps[dep]) testFrameworks.add(label);
    if (pkg.packageManager) packageManager = pkg.packageManager.split("@")[0];
  } catch {
    /* no package.json or not JSON */
  }

  return {
    totalFiles: trackedFiles.length,
    languages: [...byExtension.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([extension, files]) => ({ extension, files })),
    frameworks: [...frameworks],
    packageManager,
    testFrameworks: [...testFrameworks],
    i18nDirs: [...i18nDirs].sort(),
    lintConfigs: lintConfigs.sort(),
  };
}

/** One-paragraph rendering for prompts and `inspect`. */
export function describeProfile(profile: RepoProfile): string {
  const parts = [
    `${profile.totalFiles} tracked files`,
    profile.languages.length
      ? `languages: ${profile.languages.map((l) => `${l.extension} (${l.files})`).join(", ")}`
      : null,
    profile.frameworks.length ? `frameworks: ${profile.frameworks.join(", ")}` : null,
    profile.packageManager ? `package manager: ${profile.packageManager}` : null,
    profile.testFrameworks.length ? `tests: ${profile.testFrameworks.join(", ")}` : null,
    profile.i18nDirs.length ? `translations in: ${profile.i18nDirs.join(", ")}` : null,
    profile.lintConfigs.length ? `lint/format config: ${profile.lintConfigs.join(", ")}` : null,
  ];
  return parts.filter(Boolean).join("; ");
}
