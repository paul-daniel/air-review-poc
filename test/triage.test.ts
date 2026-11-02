import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import type { RepositoryDelta, FileChange } from "../src/contracts/scm.js";
import { MockProvider } from "../src/model/mock.js";
import { resolveTierModels, type RoleModels } from "../src/model/router.js";
import {
  changeKindOf,
  decideRouting,
  measureComplexity,
  moduleOf,
  triageDeterministically,
} from "../src/review/triage.js";

function file(path: string, added: number, removed = 0): FileChange {
  return {
    path,
    status: "modified",
    addedLines: Array.from({ length: added }, (_, i) => i + 1),
    removedLines: Array.from({ length: removed }, (_, i) => i + 1),
  };
}

function delta(files: FileChange[]): RepositoryDelta {
  return { fromSha: "base", toSha: "head", files, diff: "" };
}

const models: RoleModels = { triage: "tiny", planner: "tiny", reviewer: "big", verifier: "small" };

describe("change kinds and modules", () => {
  it("classifies files by path", () => {
    expect(changeKindOf("apps/web/src/assets/i18n/fr.json")).toBe("translation");
    expect(changeKindOf("src/locales/de.xlf")).toBe("translation");
    expect(changeKindOf("docs/architecture.md")).toBe("docs");
    expect(changeKindOf("package-lock.json")).toBe("config");
    expect(changeKindOf("src/app/orders.service.spec.ts")).toBe("tests");
    expect(changeKindOf("data/products.csv")).toBe("data");
    expect(changeKindOf("src/app/orders.service.ts")).toBe("code");
    expect(changeKindOf("logo.png")).toBe("binary");
  });

  it("groups workspace folders into modules", () => {
    expect(moduleOf("apps/web/src/app/x.ts")).toBe("apps/web");
    expect(moduleOf("libs/shared/src/money.ts")).toBe("libs/shared");
    expect(moduleOf("src/app/x.ts")).toBe("src");
    expect(moduleOf("README.md")).toBe("(root)");
  });
});

describe("deterministic triage", () => {
  const routing = defaultConfig().routing;

  it("routes a single translation file to the light tier", () => {
    const signals = measureComplexity(delta([file("apps/web/src/assets/i18n/fr.json", 3, 1)]));
    const result = triageDeterministically(signals, routing);
    expect(result.tier).toBe("light");
    expect(result.ambiguous).toBe(false);
    expect(result.reasons[0]).toMatch(/no source code changed/);
  });

  it("routes a small classification helper (3 files, one module) to the light tier", () => {
    const signals = measureComplexity(
      delta([
        file("apps/api/src/modules/support/priority.ts", 40),
        file("apps/api/src/modules/support/priority.spec.ts", 35),
        file("apps/api/src/modules/support/support.service.ts", 6, 2),
      ]),
    );
    const result = triageDeterministically(signals, routing);
    expect(result.tier).toBe("light");
    expect(signals.modules).toEqual(["apps/api"]);
  });

  it("routes a large multi-module change to the heavy tier and says why", () => {
    const files = [
      ...Array.from({ length: 6 }, (_, i) => file(`apps/web/src/app/features/returns/f${i}.ts`, 60)),
      ...Array.from({ length: 5 }, (_, i) => file(`apps/api/src/modules/returns/r${i}.ts`, 50)),
      file("libs/shared/src/returns/index.ts", 30),
    ];
    const signals = measureComplexity(delta(files));
    const result = triageDeterministically(signals, routing);
    expect(result.tier).toBe("heavy");
    expect(result.reasons.join(" ")).toMatch(/12 files ≥ 10/);
    expect(result.reasons.join(" ")).toMatch(/3 modules touched/);
    expect(result.reasons.join(" ")).toMatch(/API surface touched: libs\/shared\/src\/returns\/index.ts/);
  });

  it("three modules make a change heavy only when it is not small", () => {
    const small = measureComplexity(
      delta([file("apps/web/a.ts", 5), file("apps/api/b.ts", 5), file("libs/shared/c.ts", 5)]),
    );
    expect(triageDeterministically(small, routing).tier).toBe("standard");
    const sized = measureComplexity(
      delta([file("apps/web/a.ts", 80), file("apps/api/b.ts", 60), file("libs/shared/c.ts", 20)]),
    );
    expect(triageDeterministically(sized, routing).tier).toBe("heavy");
  });

  it("leaves the middle band ambiguous for the triage model", () => {
    const signals = measureComplexity(
      delta([file("src/a.ts", 80), file("src/b.ts", 70), file("src/c.ts", 40), file("src/d.ts", 10)]),
    );
    const result = triageDeterministically(signals, routing);
    expect(result.tier).toBe("standard");
    expect(result.ambiguous).toBe(true);
  });
});

describe("decideRouting", () => {
  const config = defaultConfig();
  const tiers = resolveTierModels(
    {
      ...config,
      models: {
        ...config.models,
        tiers: { light: { reviewer: "cheap" }, heavy: { reviewer: "huge", verifier: "big" } },
      },
    },
    models,
  );

  it("maps the tier to the configured models and reports the method", async () => {
    const { decision } = await decideRouting({
      config,
      delta: delta([file("src/i18n/fr.json", 2)]),
      models,
      tiers,
    });
    expect(decision).toMatchObject({
      tier: "light",
      reviewerModel: "cheap",
      verifierModel: "small",
      method: "deterministic",
    });
  });

  it("consults the triage model only in the ambiguous band (hybrid mode)", async () => {
    const provider = new MockProvider();
    const clear = await decideRouting({
      config,
      delta: delta([file("src/i18n/fr.json", 2)]),
      models,
      tiers,
      provider,
    });
    expect(clear.decision.method).toBe("deterministic");
    expect(clear.usage).toBeUndefined();

    const ambiguous = delta([
      file("src/a.ts", 80),
      file("src/b.ts", 70),
      file("src/c.ts", 40),
      file("src/d.ts", 10),
    ]);
    const refined = await decideRouting({ config, delta: ambiguous, models, tiers, provider });
    expect(refined.decision.method).toBe("model");
    expect(refined.decision.triageModel).toBe("tiny");
    expect(refined.decision.tier).toBe("standard");
    expect(refined.decision.reviewerModel).toBe("big");
    expect(refined.usage?.inputTokens).toBeGreaterThan(0);
    expect(refined.decision.reasons.some((r) => r.startsWith("triage model:"))).toBe(true);
  });

  it("never calls the model in deterministic mode, always in model mode", async () => {
    const provider = new MockProvider();
    const det = await decideRouting({
      config: { ...config, routing: { ...config.routing, mode: "deterministic" } },
      delta: delta([file("src/a.ts", 80), file("src/b.ts", 70), file("src/c.ts", 40), file("src/d.ts", 10)]),
      models,
      tiers,
      provider,
    });
    expect(det.decision.method).toBe("deterministic");
    const always = await decideRouting({
      config: { ...config, routing: { ...config.routing, mode: "model" } },
      delta: delta([file("src/i18n/fr.json", 2)]),
      models,
      tiers,
      provider,
    });
    expect(always.decision.method).toBe("model");
  });

  it("honours --tier and routing.enabled=false", async () => {
    const forced = await decideRouting({
      config,
      delta: delta([file("src/i18n/fr.json", 2)]),
      models,
      tiers,
      override: "heavy",
    });
    expect(forced.decision).toMatchObject({
      tier: "heavy",
      method: "override",
      reviewerModel: "huge",
      verifierModel: "big",
    });
    const disabled = await decideRouting({
      config: { ...config, routing: { ...config.routing, enabled: false } },
      delta: delta(Array.from({ length: 20 }, (_, i) => file(`src/f${i}.ts`, 50))),
      models,
      tiers,
    });
    expect(disabled.decision).toMatchObject({ tier: "standard", method: "disabled", reviewerModel: "big" });
  });

  it("falls back to the deterministic tier when the triage model fails", async () => {
    const failing = {
      ...new MockProvider(),
      id: "broken",
      capabilities: async () => ({ toolCalling: false, jsonMode: true, jsonSchema: false, streaming: false }),
      listModels: async () => [],
      generate: async () => {
        throw new Error("boom");
      },
      structured: async () => {
        throw new Error("boom");
      },
    };
    const result = await decideRouting({
      config,
      delta: delta([file("src/a.ts", 80), file("src/b.ts", 70), file("src/c.ts", 40), file("src/d.ts", 10)]),
      models,
      tiers,
      provider: failing,
    });
    expect(result.decision.method).toBe("deterministic");
    expect(result.decision.tier).toBe("standard");
    expect(result.warning).toMatch(/Triage model failed/);
  });
});
