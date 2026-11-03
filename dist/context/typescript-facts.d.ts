export interface SymbolFact {
    kind: "component" | "directive" | "service" | "pipe" | "class" | "function" | "interface";
    name: string;
    line: number;
    /** For components: decorator metadata of interest. */
    selector?: string;
    templateUrl?: string;
    standalone?: boolean;
    inputs: string[];
    outputs: string[];
    injected: string[];
    methods: Array<{
        name: string;
        line: number;
    }>;
}
export interface SubscriptionFact {
    line: number;
    /** How (if at all) the subscription is torn down. */
    cleanup: "none" | "takeUntilDestroyed" | "manual-unsubscribe" | "subject-teardown" | "other";
    /** Name of the owning class, when known. */
    owner?: string;
}
export interface FileFacts {
    path: string;
    symbols: SymbolFact[];
    subscriptions: SubscriptionFact[];
    imports: string[];
    usesInject: boolean;
}
/** Extract structural facts from a TypeScript/Angular file without type resolution. */
export declare function extractFileFacts(path: string, content: string): FileFacts;
export declare function isAngularFile(path: string): boolean;
