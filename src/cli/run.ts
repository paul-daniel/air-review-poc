import { AirReviewError, EXIT } from "../errors.js";
import { c } from "./output.js";

/** Wrap an async command body so every failure maps to the documented exit codes. */
export function runCatching<A extends unknown[]>(
  body: (...args: A) => Promise<void> | void,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await body(...args);
    } catch (error) {
      if (error instanceof AirReviewError) {
        process.stderr.write(`${c.red("error")}: ${error.message}\n`);
        process.exitCode = error.exitCode;
        return;
      }
      process.stderr.write(`${c.red("internal error")}: ${(error as Error).message}\n`);
      process.exitCode = EXIT.ENGINE;
    }
  };
}
