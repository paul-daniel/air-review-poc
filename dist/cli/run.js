import { AirReviewError, EXIT } from "../errors.js";
import { c } from "./output.js";
/** Wrap an async command body so every failure maps to the documented exit codes. */
export function runCatching(body) {
    return async (...args) => {
        try {
            await body(...args);
        }
        catch (error) {
            if (error instanceof AirReviewError) {
                process.stderr.write(`${c.red("error")}: ${error.message}\n`);
                process.exitCode = error.exitCode;
                return;
            }
            process.stderr.write(`${c.red("internal error")}: ${error.message}\n`);
            process.exitCode = EXIT.ENGINE;
        }
    };
}
//# sourceMappingURL=run.js.map