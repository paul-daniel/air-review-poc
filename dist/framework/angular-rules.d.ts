import type { DeterministicRule } from "./rules.js";
import type { FileFacts } from "../context/typescript-facts.js";
export declare const angularRules: DeterministicRule[];
export declare function angularComponentFiles(facts: Map<string, FileFacts>): FileFacts[];
