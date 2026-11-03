/**
 * Exit-code contract, as specified by the air-review architecture:
 *
 *   0   review finished, policy gate passed
 *   10  review finished, policy gate failed
 *   20  invalid configuration
 *   30  provider/model unavailable
 *   40  SCM/API failure
 *   50  internal engine failure
 */
export declare const EXIT: {
    readonly OK: 0;
    readonly GATE_FAILED: 10;
    readonly CONFIG: 20;
    readonly MODEL: 30;
    readonly SCM: 40;
    readonly ENGINE: 50;
};
export declare class AirReviewError extends Error {
    readonly exitCode: number;
    constructor(message: string, exitCode: number, options?: ErrorOptions);
}
export declare class ConfigError extends AirReviewError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class ModelError extends AirReviewError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class ScmError extends AirReviewError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class EngineError extends AirReviewError {
    constructor(message: string, options?: ErrorOptions);
}
