/**
 * `air-review example` prints copy-paste snippets. By default it shows a short
 * overview; details live behind a topic name so the CLI never dumps a wall of
 * text on someone who just needs the quickstart.
 */
export declare const EXAMPLE_TOPICS: string[];
export declare function renderExamples(topic?: string, all?: boolean): string;
