import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configSchema } from "../src/config/schema.js";
import { createScmAdapter, azureDevOpsToken } from "../src/scm/detect.js";
import { ScmError } from "../src/errors.js";
import type { GitRepository } from "../src/context/repository.js";

const ENV_KEYS = [
  "TF_BUILD",
  "SYSTEM_PULLREQUEST_PULLREQUESTID",
  "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",
  "SYSTEM_TEAMPROJECT",
  "BUILD_REPOSITORY_ID",
  "BUILD_REPOSITORY_NAME",
  "BUILD_REPOSITORY_PROVIDER",
  "SYSTEM_ACCESSTOKEN",
  "AZURE_DEVOPS_EXT_PAT",
  "AZURE_DEVOPS_TOKEN",
  "AZURE_DEVOPS_ACCESS_TOKEN",
  "GITHUB_ACTIONS",
  "GITHUB_EVENT_PATH",
  "GITHUB_EVENT_NAME",
  "GITHUB_REPOSITORY",
];
const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(vars: Record<string, string>): void {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
}

const PIPELINE_PR_ENV = {
  TF_BUILD: "True",
  SYSTEM_PULLREQUEST_PULLREQUESTID: "483",
  SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: "https://dev.azure.com/acme/",
  SYSTEM_TEAMPROJECT: "Shop",
  BUILD_REPOSITORY_ID: "3411ebc1-d5aa-464f-9615-0b527bc66719",
  BUILD_REPOSITORY_NAME: "storefront",
  BUILD_REPOSITORY_PROVIDER: "TfsGit",
  SYSTEM_ACCESSTOKEN: "job-token",
};

const git = { root: "/repo" } as unknown as GitRepository;
const config = configSchema.parse({});

describe("CI detection", () => {
  beforeEach(() => setEnv({}));
  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("auto-detects an Azure Pipelines pull request validation build", () => {
    setEnv(PIPELINE_PR_ENV);
    const warnings: string[] = [];
    const scm = createScmAdapter(config, git, { ci: "auto", onWarning: (m) => warnings.push(m) });
    expect(scm.kind).toBe("azure-devops");
    expect(warnings).toEqual([]);
  });

  it("falls back to local mode with a warning on an Azure Pipelines build without a PR", () => {
    const { SYSTEM_PULLREQUEST_PULLREQUESTID: _omit, ...noPr } = PIPELINE_PR_ENV;
    setEnv(noPr);
    const warnings: string[] = [];
    const scm = createScmAdapter(config, git, { ci: "auto", onWarning: (m) => warnings.push(m) });
    expect(scm.kind).toBe("local");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/SYSTEM_PULLREQUEST_PULLREQUESTID/);
  });

  it("falls back to local mode when Azure Pipelines builds a non-Azure Repos repository", () => {
    setEnv({
      ...PIPELINE_PR_ENV,
      BUILD_REPOSITORY_PROVIDER: "GitHub",
      BUILD_REPOSITORY_ID: "acme/storefront",
    });
    const warnings: string[] = [];
    const scm = createScmAdapter(config, git, { ci: "auto", onWarning: (m) => warnings.push(m) });
    expect(scm.kind).toBe("local");
    expect(warnings[0]).toMatch(/GitHub repository/);
  });

  it("stays local outside any CI", () => {
    expect(createScmAdapter(config, git, { ci: "auto" }).kind).toBe("local");
  });

  it("requires the locators when --ci azure-devops is explicit", () => {
    expect(() => createScmAdapter(config, git, { ci: "azure-devops" })).toThrow(ScmError);
    expect(() => createScmAdapter(config, git, { ci: "azure-devops" })).toThrow(
      /--org --project --repo --pr/,
    );
    expect(() =>
      createScmAdapter(config, git, { ci: "azure-devops", pr: 483, org: "https://dev.azure.com/acme" }),
    ).toThrow(/--project <name>.*--repo <name\|guid>/);
    expect(() =>
      createScmAdapter(config, git, {
        ci: "azure-devops",
        pr: 483,
        org: "acme",
        project: "Shop",
        repo: "storefront",
      }),
    ).toThrow(/must be absolute/);
  });

  it("builds the adapter from manual flags", () => {
    setEnv({ AZURE_DEVOPS_EXT_PAT: "pat" });
    const scm = createScmAdapter(config, git, {
      ci: "azure-devops",
      org: "https://dev.azure.com/acme",
      project: "Shop",
      repo: "storefront",
      pr: 483,
    });
    expect(scm.kind).toBe("azure-devops");
  });

  it("honours platform.provider: azure-devops and its token env", () => {
    setEnv({ MY_ADO_TOKEN: "pat" } as Record<string, string>);
    const azureConfig = configSchema.parse({
      platform: {
        provider: "azure-devops",
        azureDevops: {
          organizationUrl: "https://dev.azure.com/acme",
          project: "Shop",
          repository: "storefront",
          tokenEnv: "MY_ADO_TOKEN",
        },
      },
    });
    expect(azureDevOpsToken(azureConfig)).toMatchObject({ token: "pat", source: "MY_ADO_TOKEN" });
    expect(createScmAdapter(azureConfig, git, { ci: "auto", pr: 483 }).kind).toBe("azure-devops");
    expect(() => createScmAdapter(azureConfig, git, { ci: "auto" })).toThrow(ScmError);
    delete process.env.MY_ADO_TOKEN;
  });

  it("prefers the configured token env, then the PAT fallbacks", () => {
    setEnv({ AZURE_DEVOPS_TOKEN: "fallback" });
    expect(azureDevOpsToken(config)).toMatchObject({ token: "fallback", source: "AZURE_DEVOPS_TOKEN" });
    setEnv({ SYSTEM_ACCESSTOKEN: "job", AZURE_DEVOPS_TOKEN: "fallback" });
    expect(azureDevOpsToken(config)).toMatchObject({ token: "job", source: "SYSTEM_ACCESSTOKEN" });
    setEnv({});
    expect(azureDevOpsToken(config).token).toBeUndefined();
  });

  it("sends Entra ID access tokens as bearer and PATs as basic", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI0OTliODRhYyJ9.c2lnbmF0dXJl";
    setEnv({ AZURE_DEVOPS_ACCESS_TOKEN: "opaque-but-explicit" });
    expect(azureDevOpsToken(config)).toMatchObject({ kind: "bearer", source: "AZURE_DEVOPS_ACCESS_TOKEN" });
    setEnv({ SYSTEM_ACCESSTOKEN: jwt });
    expect(azureDevOpsToken(config).kind).toBe("bearer");
    setEnv({ AZURE_DEVOPS_EXT_PAT: "abc123pat" });
    expect(azureDevOpsToken(config).kind).toBe("basic");
    setEnv({});
  });
});
