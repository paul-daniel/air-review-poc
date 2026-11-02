import type { ReviewOutcome } from "../../src/review/pipeline.js";
export const outcome: ReviewOutcome = {
  skipped: false, stale: false, published: false, incomplete: false, gateFailed: false,
  warnings: ['Prompt-injection text detected at src/price.ts:1. Treated as repository data, not reviewer instructions.'],
  findings: [{ id: 'arf_123456', ruleId: 'angular.subscription-lifecycle', ruleOrigin: 'FRAMEWORK', severity: 'MAJOR', confidence: 0.94, scope: 'IN_PR', status: 'OPEN', fingerprint: 'x', title: 'Subscription survives the component', summary: 'The event stream stays active after the component is destroyed.', suggestion: 'Use takeUntilDestroyed(this.destroyRef).', anchor: { file: 'src/widget.ts', startLine: 3, endLine: 3 }, evidence: [{ kind: 'framework', label: 'Angular lifecycle cleanup' }] }],
  summary: { pr: { owner: 'demo', repo: 'demo', number: null }, reviewedHeadSha: '123456789', gatePassed: true, counts: { MAJOR: 1, BLOCKER: 0, CRITICAL: 0, MINOR: 0, INFO: 0 }, open: 1, resolved: 0, warnings: [], metrics: { inputTokens: 1000, outputTokens: 250, cachedInputTokens: 500, reasoningTokens: 100, modelCalls: 2, contextRequests: 1, cacheHits: 0, durationMs: 200, deterministicFindings: 1, llmFindings: 0, verifiedFindings: 1, estimatedCostUsd: 0.0042 } },
};
export const sources = new Map([['src/widget.ts', 'class Widget {\n  ngOnInit() {\n    this.events$.subscribe(() => {});\n  }\n}']]);

