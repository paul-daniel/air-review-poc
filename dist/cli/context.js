import { loadConfig } from "../config/index.js";
import { createProvider, resolveRoleModels, requireRoleModels } from "../model/index.js";
import { GitRepository } from "../context/repository.js";
import { createScmAdapter } from "../scm/detect.js";
import { LocalCache } from "../cache/local.js";
import { c } from "./output.js";
export async function buildContext(options) {
    const loaded = loadConfig(options.configPath);
    const git = await GitRepository.discover(process.cwd());
    const provider = createProvider(loaded.config);
    const models = resolveRoleModels(loaded.config, options.modelOverrides ?? {});
    const resolvedModels = options.requireModels === false ? models : requireRoleModels(models);
    const scm = createScmAdapter(loaded.config, git, {
        ci: options.ci ?? "auto",
        owner: options.owner,
        repo: options.repo,
        pr: options.pr,
        base: options.base,
        org: options.org,
        project: options.project,
        onWarning: options.onWarning ??
            ((message) => {
                process.stderr.write(`${c.yellow("warning")}: ${message}\n`);
            }),
    });
    const cache = new LocalCache(options.cacheDir ?? loaded.config.cache.dir);
    return {
        config: loaded.config,
        configPath: loaded.path,
        provider,
        git,
        scm,
        cache,
        models: resolvedModels,
    };
}
//# sourceMappingURL=context.js.map