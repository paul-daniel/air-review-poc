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

export const EXIT = {
  OK: 0,
  GATE_FAILED: 10,
  CONFIG: 20,
  MODEL: 30,
  SCM: 40,
  ENGINE: 50,
} as const;

export class AirReviewError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class ConfigError extends AirReviewError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, EXIT.CONFIG, options);
  }
}

export class ModelError extends AirReviewError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, EXIT.MODEL, options);
  }
}

export class ScmError extends AirReviewError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, EXIT.SCM, options);
  }
}

export class EngineError extends AirReviewError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, EXIT.ENGINE, options);
  }
}
