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
export function mineContainerPresenterConventions(trackedFiles: string[]): ContainerPresenterMiningResult {
  const pairsByFeature = new Map<string, string[]>();
  const componentCountByFeature = new Map<string, number>();

  const containers = new Map<string, string[]>();
  for (const file of trackedFiles) {
    const base = file.split("/").pop() ?? "";
    const match = base.match(/^(.*)\.container\.ts$/);
    if (match?.[1]) {
      const feature = file.slice(0, Math.max(0, file.length - base.length - 1));
      const list = containers.get(`${feature}/${match[1]}`) ?? [];
      list.push(file);
      containers.set(`${feature}/${match[1]}`, list);
    }
    if (/\.(component|container|presenter)\.ts$/.test(base)) {
      const feature = file.slice(0, Math.max(0, file.length - base.length - 1));
      componentCountByFeature.set(feature, (componentCountByFeature.get(feature) ?? 0) + 1);
    }
  }

  for (const [, files] of containers) {
    for (const container of files) {
      const presenter = container.replace(/\.container\.ts$/, ".presenter.ts");
      if (trackedFiles.includes(presenter)) {
        const feature = container.slice(0, container.lastIndexOf("/"));
        const list = pairsByFeature.get(feature) ?? [];
        if (!list.includes(container)) list.push(container);
        pairsByFeature.set(feature, list);
      }
    }
  }

  return { pairsByFeature, componentCountByFeature };
}

export function conventionRecords(mining: ContainerPresenterMiningResult): ConventionRecord[] {
  const records: ConventionRecord[] = [];
  for (const [feature, examples] of mining.pairsByFeature) {
    if (examples.length < 2) continue;
    const components = mining.componentCountByFeature.get(feature) ?? examples.length * 2;
    const counter = Math.max(0, components - examples.length * 2);
    records.push({
      id: "angular.container-presenter",
      label: `container/presenter separation in ${feature || "(root)"}`,
      scope: feature,
      matchingExamples: examples.length,
      counterExamples: counter,
      examples,
      confidence: Number((examples.length / (examples.length + counter)).toFixed(2)),
      debtRisk: counter > examples.length ? "medium" : "low",
    });
  }
  return records;
}

export function featureOf(convention: ConventionRecord, file: string): boolean {
  return file.startsWith(convention.scope ? `${convention.scope}/` : "");
}
