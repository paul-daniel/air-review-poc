import type { ConventionRecord } from "../context/evidence.js";
export interface ContainerPresenterMiningResult {
    pairsByFeature: Map<string, string[]>;
    componentCountByFeature: Map<string, number>;
}
/**
 * Discover container/presenter conventions from file names alone. This is a
 * cheap, deterministic first signal: `order-editor.container.ts` next to
 * `order-editor.presenter.ts` repeated across a feature is a convention
 * candidate, never a framework rule.
 */
export declare function mineContainerPresenterConventions(trackedFiles: string[]): ContainerPresenterMiningResult;
export declare function conventionRecords(mining: ContainerPresenterMiningResult): ConventionRecord[];
export declare function featureOf(convention: ConventionRecord, file: string): boolean;
