import { ConfigError } from "../../errors.js";
import { configGet, configSet, configUnset, loadConfig } from "../../config/index.js";
import { redactConfig } from "../../config/redact.js";
import { c, printJson } from "../output.js";
import { stringify as stringifyYaml } from "yaml";
export function runConfigList(config, configPath, json) {
    const redacted = redactConfig(config);
    if (json) {
        printJson({ path: configPath, config: redacted });
        return;
    }
    process.stdout.write(`${c.dim(configPath ?? "(built-in defaults)")}\n\n`);
    process.stdout.write(stringifyYaml(redacted, { lineWidth: 100 }));
}
export function runConfigGet(path, explicitConfig) {
    const loaded = loadConfig(explicitConfig);
    if (!loaded.path) {
        throw new ConfigError('No config file found. Run "air-review init" first, or pass --config <file>.');
    }
    process.stdout.write(`${configGet(loaded.config, path)}\n`);
}
export function runConfigSet(path, value, explicitConfig) {
    const loaded = loadConfig(explicitConfig);
    const file = loaded.path ?? "air-review.yaml";
    if (!loaded.path) {
        throw new ConfigError('No config file found. Run "air-review init" first, or pass --config <file>.');
    }
    configSet(file, path, value);
    process.stdout.write(`${c.green("set")} ${path} = ${value}\n`);
    process.stdout.write(`${c.dim("edited")} ${file}\n`);
}
export function runConfigUnset(path, explicitConfig) {
    const loaded = loadConfig(explicitConfig);
    const file = loaded.path ?? "air-review.yaml";
    if (!loaded.path) {
        throw new ConfigError('No config file found. Run "air-review init" first, or pass --config <file>.');
    }
    configUnset(file, path);
    process.stdout.write(`${c.green("removed")} ${path}\n`);
    process.stdout.write(`${c.dim("edited")} ${file}\n`);
}
//# sourceMappingURL=config.js.map