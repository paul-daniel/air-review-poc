import { loadConfig, type AirReviewConfig } from "../config/index.js";
import { createProvider, resolveRoleModels, requireRoleModels, type ModelOverrides } from "../model/index.js";
import type { ModelProvider, ModelRole } from "../contracts/model.js";
import { GitRepository } from "../context/repository.js";
import { createScmAdapter, type ScmOptions } from "../scm/detect.js";
import type { ScmAdapter } from "../contracts/scm.js";
import { LocalCache } from "../cache/local.js";
import { c } from "./output.js";

export interface CliContext {
  config: AirReviewConfig;
  configPath: string | null;
  provider: ModelProvider;
  git: GitRepository;
  scm: ScmAdapter;
  cache: LocalCache;
  models: Record<ModelRole, string | undefined>;
}

export interface ContextOptions extends ScmOptions {
  configPath?: string;
  modelOverrides?: ModelOverrides;
  cacheDir?: string;
  /** Validate that every role has a model (review/doctor default true). */
  requireModels?: boolean;
}

export async function buildContext(options: ContextOptions): Promise<CliContext> {
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
    onWarning:
      options.onWarning ??
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
