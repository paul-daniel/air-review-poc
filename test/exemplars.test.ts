import { describe, expect, it } from "vitest";
import { exemplarsWanted, fileKind, planExemplars } from "../src/context/exemplars.js";
import { describeProfile, profileRepository } from "../src/context/profile.js";
import type { FileChange, RepositoryDelta } from "../src/contracts/scm.js";

function change(path: string, status: FileChange["status"], added: number[] = [1]): FileChange {
  return { path, status, addedLines: added, removedLines: [] };
}

function delta(files: FileChange[]): RepositoryDelta {
  return { fromSha: "a", toSha: "b", files, diff: "" };
}

const repoFiles: Record<string, string> = {
  "package.json": JSON.stringify({
    dependencies: { "@angular/core": "^19.0.0", rxjs: "^7.8.0" },
    devDependencies: { vitest: "^3" },
  }),
  "package-lock.json": "{}",
  "eslint.config.js": "export default [];",
  "src/app/orders/order-list.component.ts": "@Component({})\nexport class OrderListComponent {}\n",
  "src/app/orders/order-detail.component.ts": "@Component({})\nexport class OrderDetailComponent {}\n",
  "src/app/orders/order.service.ts": "export class OrderService {}\nexport function loadOrders() {}\n",
  "src/app/users/user-list.component.ts": "@Component({})\nexport class UserListComponent {}\n",
  "src/app/shared/button.component.ts": "@Component({})\nexport class ButtonComponent {}\n",
  "src/app/shared/button.component.spec.ts": "describe('button', () => {});\n",
  "src/assets/i18n/en.json": JSON.stringify({ hello: "Hello" }),
  "src/assets/i18n/de.json": JSON.stringify({ hello: "Hallo" }),
  "node_modules/left-pad/index.component.ts": "should never be picked",
  "dist/order.component.ts": "built output, ignored",
};
const tracked = Object.keys(repoFiles);
const read = (path: string) => repoFiles[path] ?? "";
const budget = { maxTokens: 30_000, maxFiles: 20 };

describe("fileKind", () => {
  it("compares dotted names by everything after the first dot and plain names by extension", () => {
    expect(fileKind("src/app/x/order.container.ts")).toBe("container.ts");
    expect(fileKind("src/app/x/order.component.spec.ts")).toBe("component.spec.ts");
    expect(fileKind("src/assets/i18n/fr.json")).toBe("json");
    expect(fileKind("Makefile")).toBe("makefile");
  });
});

describe("exemplarsWanted", () => {
  it("adapts the budget to the kind and size of the change", () => {
    expect(exemplarsWanted(change("a/new.component.ts", "added", [1, 2, 3]), 3)).toBe(3);
    expect(exemplarsWanted(change("a/x.component.ts", "modified", [1, 2]), 100)).toBe(1);
    expect(
      exemplarsWanted(
        change(
          "a/x.component.ts",
          "modified",
          Array.from({ length: 50 }, (_, i) => i + 1),
        ),
        100,
      ),
    ).toBe(2);
    expect(exemplarsWanted(change("i18n/fr.json", "added", [1, 2, 3, 4]), 4)).toBe(1);
    expect(exemplarsWanted(change("a/x.spec.ts", "added", [1, 2, 3]), 3)).toBe(1);
  });
});

describe("planExemplars", () => {
  it("picks the closest same-kind files for a new component, nearest directory first", () => {
    const files = {
      ...repoFiles,
      "src/app/orders/order-edit.component.ts": "@Component({})\nexport class OrderEditComponent {}\n",
    };
    const plan = planExemplars({
      delta: delta([change("src/app/orders/order-edit.component.ts", "added", [1, 2])]),
      trackedFiles: [...tracked, "src/app/orders/order-edit.component.ts"],
      readFile: (p) => files[p] ?? "",
      budget,
    });
    expect(plan.exemplars.map((e) => e.path)).toEqual([
      "src/app/orders/order-detail.component.ts",
      "src/app/orders/order-list.component.ts",
      "src/app/shared/button.component.ts",
    ]);
    expect(plan.exemplars[0]?.relation).toBe("same-directory");
    expect(plan.exemplars[2]?.relation).toBe("sibling-directory");
    expect(plan.exemplars.some((e) => e.path.startsWith("node_modules") || e.path.startsWith("dist"))).toBe(
      false,
    );
    expect(plan.notes).toEqual([]);
  });

  it("gives a translation edit exactly one neighbouring translation file", () => {
    const files = { ...repoFiles, "src/assets/i18n/fr.json": JSON.stringify({ hello: "Bonjour" }) };
    const plan = planExemplars({
      delta: delta([change("src/assets/i18n/fr.json", "added", [1])]),
      trackedFiles: [...tracked, "src/assets/i18n/fr.json"],
      readFile: (p) => files[p] ?? "",
      budget,
    });
    expect(plan.exemplars).toHaveLength(1);
    expect(plan.exemplars[0]?.path).toBe("src/assets/i18n/de.json");
    expect(plan.exemplars[0]?.relation).toBe("same-directory");
  });

  it("notes when a new kind has no precedent instead of inventing a convention", () => {
    const plan = planExemplars({
      delta: delta([change("src/app/orders/order.resolver.ts", "added", [1, 2])]),
      trackedFiles: [...tracked, "src/app/orders/order.resolver.ts"],
      readFile: (p) => (p.endsWith("resolver.ts") ? "export const r = 1;" : read(p)),
      budget,
    });
    expect(plan.exemplars).toEqual([]);
    expect(plan.notes[0]).toMatch(/No existing \*\.resolver\.ts file/);
  });

  it("extracts the exported API of in-repo modules the change imports", () => {
    const files = {
      ...repoFiles,
      "src/app/orders/order-edit.component.ts":
        "import { OrderService } from './order.service';\nexport class OrderEditComponent {}\n",
    };
    const plan = planExemplars({
      delta: delta([change("src/app/orders/order-edit.component.ts", "modified", [1])]),
      trackedFiles: [...tracked, "src/app/orders/order-edit.component.ts"],
      readFile: (p) => files[p] ?? "",
      budget,
    });
    expect(plan.related).toEqual([
      {
        forFile: "src/app/orders/order-edit.component.ts",
        path: "src/app/orders/order.service.ts",
        exports: ["export class OrderService {}", "export function loadOrders() {}"],
      },
    ]);
  });

  it("respects the token and file budgets and reports what it could not include", () => {
    const big = { ...repoFiles, "src/app/orders/order-edit.component.ts": "new" };
    const plan = planExemplars({
      delta: delta([change("src/app/orders/order-edit.component.ts", "added", [1])]),
      trackedFiles: [...tracked, "src/app/orders/order-edit.component.ts"],
      readFile: (p) => big[p] ?? "",
      budget: { maxTokens: 15, maxFiles: 20 },
    });
    expect(plan.exemplars).toHaveLength(1);
    expect(plan.estimatedTokens).toBeLessThanOrEqual(15);
    expect(plan.notes.some((n) => /fit the budget/.test(n))).toBe(true);

    const starved = planExemplars({
      delta: delta([change("src/app/orders/order-edit.component.ts", "added", [1])]),
      trackedFiles: [...tracked, "src/app/orders/order-edit.component.ts"],
      readFile: (p) => big[p] ?? "",
      budget: { maxTokens: 30_000, maxFiles: 1 },
    });
    expect(starved.filesRead).toBeLessThanOrEqual(1);
  });

  it("excerpts long exemplars instead of sending them whole", () => {
    const long = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n");
    const files = {
      ...repoFiles,
      "src/app/users/user-list.component.ts": long,
      "src/app/users/user-edit.component.ts": "new",
    };
    const plan = planExemplars({
      delta: delta([change("src/app/users/user-edit.component.ts", "added", [1])]),
      trackedFiles: [...tracked, "src/app/users/user-edit.component.ts"],
      readFile: (p) => files[p] ?? "",
      budget,
    });
    const excerpt = plan.exemplars.find((e) => e.path === "src/app/users/user-list.component.ts");
    expect(excerpt?.truncated).toBe(true);
    expect(excerpt?.lines).toBe(400);
    expect(excerpt?.content).toMatch(/280 more lines omitted/);
  });
});

describe("profileRepository", () => {
  it("builds a language-agnostic identity card from tracked files and package.json", () => {
    const profile = profileRepository(tracked, read);
    expect(profile.frameworks).toEqual(expect.arrayContaining(["Angular 19.0.0", "RxJS"]));
    expect(profile.packageManager).toBe("npm");
    expect(profile.testFrameworks).toEqual(["Vitest"]);
    expect(profile.i18nDirs).toEqual(["src/assets/i18n"]);
    expect(profile.lintConfigs).toEqual(["eslint.config.js"]);
    expect(profile.languages[0]).toEqual({ extension: "ts", files: 8 });
    expect(describeProfile(profile)).toMatch(
      /frameworks: Angular 19.0.0, RxJS; package manager: npm; tests: Vitest; translations in: src\/assets\/i18n/,
    );
  });
});

describe("exemplar affinity", () => {
  it("prefers the same name family over a barrel index file in the same directory", () => {
    const files: Record<string, string> = {
      "src/material/slider/index.ts": "export * from './public-api';\n",
      "src/material/slider/slider.ts": "export class MatSlider {}\n".repeat(5),
      "src/material/slider/slider-interface.ts": "export interface SliderThumb {}\n".repeat(5),
      "src/material/slider/slider-thumb.ts": "export class MatSliderVisualThumb {}\n",
      "src/material/core/option.ts": "export class MatOption {}\n".repeat(5),
    };
    const plan = planExemplars({
      delta: delta([change("src/material/slider/slider-thumb.ts", "modified", [1])]),
      trackedFiles: Object.keys(files),
      readFile: (p) => files[p] ?? "",
      budget: { maxTokens: 30_000, maxFiles: 20 },
    });
    expect(plan.exemplars[0]?.path).toBe("src/material/slider/slider-interface.ts");
  });

  it("does not print pnpm catalog protocols as an Angular version", () => {
    const profile = profileRepository(["package.json"], () =>
      JSON.stringify({ dependencies: { "@angular/core": "catalog:" } }),
    );
    expect(profile.frameworks).toEqual(["Angular"]);
  });
});
