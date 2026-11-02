import { describe, expect, it } from "vitest";
import { angularRules } from "../src/framework/angular-rules.js";
import type { RuleContext } from "../src/framework/rules.js";
import { extractFileFacts } from "../src/context/typescript-facts.js";

const BASE_CONTEXT: Omit<RuleContext, "delta" | "facts"> = {
  trackedFiles: [],
  readHead: () => "",
  grep: async () => [],
  projectFacts: { strict: true, standaloneDefault: true, angularVersion: "19.0.0" },
  evidence: {
    files: [],
    conventions: [],
    projectFacts: { strict: true, standaloneDefault: true, angularVersion: "19.0.0" },
    warnings: [],
  },
};

describe("angular.subscription-lifecycle", () => {
  it("flags subscriptions on added lines that have no teardown", async () => {
    const content = [
      "import { Component, inject } from '@angular/core';",
      "@Component({selector: 'app-x'})",
      "export class X {",
      "  api = inject(Api);",
      "  go() {",
      "    this.api.events$.subscribe(() => {});",
      "  }",
      "}",
    ].join("\n");
    const delta = {
      fromSha: "a",
      toSha: "b",
      diff: "",
      files: [{ path: "x.component.ts", status: "modified", addedLines: [6], removedLines: [] }],
    };
    const ctx: RuleContext = {
      ...BASE_CONTEXT,
      delta,
      facts: new Map([["x.component.ts", extractFileFacts("x.component.ts", content)]]),
      grep: async () => ["y.component.ts"],
      readHead: () => content,
    };
    const [rule] = angularRules;
    const findings = await rule!.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("MAJOR");
    expect(findings[0]?.confidence).toBeGreaterThan(0.9);
    expect(findings[0]?.repoStatus).toBe("CONVENTION");
    expect(findings[0]?.suggestedCode?.code).toContain(
      ".pipe(takeUntilDestroyed(this.destroyRef))\n  .subscribe(() => {});",
    );
  });

  it("keeps the recommendation actionable when a code example would capture unrelated statements", async () => {
    const content = [
      "@Component({selector: 'app-x'})",
      "class X {",
      "  go() {",
      "    this.api.events$.subscribe(handler); otherWork();",
      "  }",
      "}",
    ].join("\n");
    const ctx: RuleContext = {
      ...BASE_CONTEXT,
      delta: {
        fromSha: "a",
        toSha: "b",
        diff: "",
        files: [{ path: "x.ts", status: "modified", addedLines: [4], removedLines: [] }],
      },
      facts: new Map([["x.ts", extractFileFacts("x.ts", content)]]),
      readHead: () => content,
    };
    const [finding] = await angularRules[0]!.run(ctx);
    expect(finding).toBeDefined();
    expect(finding!.suggestedCode).toBeUndefined();
    expect(finding!.suggestion).toContain(
      "Pipe the stream through `takeUntilDestroyed(this.destroyRef)` before subscribing.",
    );
  });

  it("stays silent for cleaned-up subscriptions", async () => {
    const content = [
      "import { Component, DestroyRef, inject } from '@angular/core';",
      "import { takeUntilDestroyed } from '@angular/core/rxjs-interop';",
      "@Component({selector: 'app-x'})",
      "export class X {",
      "  ref = inject(DestroyRef);",
      "  go() { this.s$.pipe(takeUntilDestroyed(this.ref)).subscribe(); }",
      "}",
    ].join("\n");
    const delta = {
      fromSha: "a",
      toSha: "b",
      diff: "",
      files: [{ path: "x.component.ts", status: "added", addedLines: [6], removedLines: [] }],
    };
    const ctx: RuleContext = {
      ...BASE_CONTEXT,
      delta,
      facts: new Map([["x.component.ts", extractFileFacts("x.component.ts", content)]]),
    };
    const [rule] = angularRules;
    expect(await rule!.run(ctx)).toHaveLength(0);
  });
});

describe("angular.container-presenter", () => {
  it("flags a component that bypasses an evidenced convention", async () => {
    const content = [
      "import { Component, inject } from '@angular/core';",
      "@Component({selector: 'app-note'})",
      "export class NoteComponent {",
      "  api = inject(OrderApi);",
      "}",
    ].join("\n");
    const delta = {
      fromSha: "a",
      toSha: "b",
      diff: "",
      files: [
        { path: "src/app/orders/note.component.ts", status: "added", addedLines: [3, 4], removedLines: [] },
      ],
    };
    const tracked = [
      "src/app/orders/order-list.container.ts",
      "src/app/orders/order-list.presenter.ts",
      "src/app/orders/order-search.container.ts",
      "src/app/orders/order-search.presenter.ts",
    ];
    const ctx: RuleContext = {
      ...BASE_CONTEXT,
      trackedFiles: tracked,
      delta,
      facts: new Map([["src/app/orders/note.component.ts", extractFileFacts("note.component.ts", content)]]),
    };
    const containerPresenter = angularRules.find((r) => r.id === "angular.container-presenter")!;
    const findings = await containerPresenter.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleOrigin).toBe("REPO_CONVENTION");
    expect(findings[0]?.severity).toBe("MAJOR");
  });

  it("requires several supporting examples before claiming a convention", async () => {
    const content = [
      "import { Component, inject } from '@angular/core';",
      "@Component({selector: 'app-note'})",
      "export class NoteComponent {",
      "  api = inject(OrderApi);",
      "}",
    ].join("\n");
    const delta = {
      fromSha: "a",
      toSha: "b",
      diff: "",
      files: [
        { path: "src/app/orders/note.component.ts", status: "added", addedLines: [3], removedLines: [] },
      ],
    };
    const ctx: RuleContext = {
      ...BASE_CONTEXT,
      trackedFiles: ["src/app/orders/order-list.container.ts", "src/app/orders/order-list.presenter.ts"],
      delta,
      facts: new Map([["src/app/orders/note.component.ts", extractFileFacts("note.component.ts", content)]]),
    };
    const containerPresenter = angularRules.find((r) => r.id === "angular.container-presenter")!;
    expect(await containerPresenter.run(ctx)).toHaveLength(0);
  });
});
