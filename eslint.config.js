// ESLint flat config. Type-aware rules are intentionally off so `npm run lint`
// stays fast; `npm run typecheck` (tsc --noEmit) is the type gate.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "website/.vitepress/dist/**",
    "website/.vitepress/cache/**",
    "dist/**",
    "node_modules/**",
    "coverage/**",
    ".air-review/**",
    "test/fixtures/**",
    "test/__snapshots__/**",
    "docs/**",
    "schema/**",
  ]),

  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2022 },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // Formatting (quotes, commas, line length) belongs to Prettier, not ESLint.

      // The compiler already enforces noUnusedLocals / noUnusedParameters;
      // mirror that here and allow the `_` convention for intentional ignores.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `import type` keeps the ESM output free of type-only imports.
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      // With noUncheckedIndexedAccess, `!` after a guarded lookup is the house style.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "error",

      // Core rules tuned to the existing style.
      "no-console": "off", // this is a CLI
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "multi-line"], // `if (x) return;` on one line is used throughout
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": ["error", "always"],
      "no-useless-rename": "error",
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      // CLI snippets intentionally print GitHub Actions `${{ }}` syntax.
      "no-template-curly-in-string": "off",
      "no-unneeded-ternary": "error",
      "prefer-template": "off", // string concatenation is used for long literals
    },
  },

  {
    // Vitest files: fixtures and partial mocks legitimately use `any` and casts.
    files: ["test/**/*.ts", "vitest.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    // Plain Node scripts (e2e, demo, local API simulation).
    files: ["scripts/**/*.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
