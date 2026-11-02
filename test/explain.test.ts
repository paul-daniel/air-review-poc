import { describe, expect, it } from "vitest";
import { findingRows } from "../src/cli/commands/explain.js";
import type { Finding } from "../src/contracts/review.js";

const finding: Finding = {
  id: "arf_abc123",
  ruleId: "angular.subscription-lifecycle",
  ruleOrigin: "FRAMEWORK",
  severity: "MAJOR",
  confidence: 0.94,
  scope: "IN_PR",
  title: "Subscription may outlive the component lifecycle",
  summary: "s",
  anchor: { file: "src/app/x.ts", startLine: 11, endLine: 11 },
  evidence: [],
  fingerprint: "f",
  status: "OPEN",
};

describe("findingRows", () => {
  it("maps findings to compact table rows", () => {
    expect(findingRows([finding])).toEqual([
      {
        id: "arf_abc123",
        severity: "MAJOR",
        status: "OPEN",
        location: "src/app/x.ts:11",
        title: "Subscription may outlive the component lifecycle",
      },
    ]);
  });
});
