# Troubleshooting

Start with the exit code, then the symptom. `air-review doctor` answers most setup questions in one run.

## Exit codes

| Code | Meaning                        | First thing to check                             |
| ---- | ------------------------------ | ------------------------------------------------ |
| `0`  | review finished, gate passed   | –                                                |
| `10` | gate failed: blocking findings | the findings in the output, `review.gate` config |
| `20` | invalid configuration          | `air-review doctor`, provider name, endpoint URL |
| `30` | provider or model unavailable  | key variable, base URL, model name, rate limits  |
| `40` | SCM or API failure             | token scope and mapping, PR number, permissions  |
| `50` | internal engine failure        | run with `--json`, open an issue with the output |

Details in [Exit codes](/reference/exit-codes).

## Provider errors (exit 30)

**`401` or `403` from the endpoint.** The key is missing, wrong, expired, or in the wrong header. `doctor` prints the resolved endpoint and the variable it read the credential from; set that variable. Azure expects the `api-key` header and no prefix: the presets do this. With Entra ID, `403` usually means the identity has no `Cognitive Services OpenAI User` role on the resource, or the assignment is less than five minutes old. In Azure Pipelines, a `401` on the provider while Azure DevOps works usually means the **secret** variable was not mapped on the step (`env: AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)`).

**`model not found` or `404` on chat completions.** The role model does not exist at that endpoint; on Azure it must be the **deployment name**. `air-review models` lists what the endpoint offers (where a listing exists); `air-review config set models.roles.reviewer <name>` changes it. On Bedrock, `bedrock-mantle` wants ids without the version suffix (`openai.gpt-oss-120b`), `bedrock-runtime` with it (`openai.gpt-oss-120b-1:0`).

**`400 The requested operation is unsupported`.** The deployment only speaks the Responses API (`gpt-5-codex`). With `AIR_REVIEW_API=auto` (default) the tool switches automatically; pin `responses` to skip the probe.

**`400` about `max_tokens` or `temperature`.** A third-party model rejects the Azure defaults. Set `AIR_REVIEW_MAX_TOKENS_PARAMETER=max_tokens`, or give `endpoint.temperature` an explicit value.

**`429` or slow responses.** Provider rate limit. Point the verifier at a smaller model, retry later, or raise `endpoint.timeoutMs`. `air-review telemetry` shows duration and call counts per run.

**Parse error on the model answer.** The model wrapped its JSON in prose or fences (tolerated) or ignored the JSON instruction (Anthropic's compatibility layer ignores `response_format`). Pick a model that follows format instructions well, or try again.

**`Credential should be scoped to a valid region` (Bedrock).** The API key was generated in another Region than the endpoint. Regenerate it in the right Region.

## SCM errors (exit 40)

**`no GitHub token` on publish.** Reading works without a token; publishing does not. In GitHub Actions put `GITHUB_TOKEN` in the step `env` with the `github.token` expression and give the job `pull-requests: write` and `issues: write`. Locally export `GH_TOKEN` or `GITHUB_TOKEN`, or use `--ci local`.

**`403` on a fork pull request (GitHub).** The token is read-only and secrets are absent on fork builds. Guard the publish step with `if: github.event.pull_request.head.repo.full_name == github.repository` ([forks caveat](/integrations/github-actions#_4-forks-caveat)).

**`403` on every thread write (Azure DevOps).** The build service identity lacks **Contribute to pull requests** on the repository. Project settings → Repositories → the repository → Security → `<Project> Build Service (<Organization>)` → Allow. If the organization limits the job authorization scope, the project-scoped identity is the one to grant ([step 3](/integrations/azure-devops#_3-grant-contribute-to-pull-requests-to-the-build-service)).

**`401` from Azure DevOps.** `SYSTEM_ACCESSTOKEN` is not mapped on the step: `env: SYSTEM_ACCESSTOKEN: $(System.AccessToken)`.

**`Azure DevOps review is missing: --org ...`** or **`GitHub review requires owner, repo and pull request number`.** A manual run without the locators, or a CI build that is not a pull request. Pass `--org --project --repo --pr` (Azure) or `--owner --repo --pr` (GitHub), or run inside a pull-request build.

**Review runs "locally" in Azure Pipelines and posts nothing.** The build is not a PR validation (no `SYSTEM_PULLREQUEST_PULLREQUESTID`), or `BUILD_REPOSITORY_PROVIDER` is not `TfsGit`. Attach the pipeline as a build validation policy on the target branch.

**`Could not resolve base ref`** or a merge-base error. Local mode defaults to `origin/main`. Fetch the target branch first (`git fetch origin main`) or pass `--base <ref>`. In a pipeline this almost always means a shallow clone: `fetch-depth: 0` (GitHub), `fetchDepth: 0` (Azure), `clone: depth: full` (Bitbucket), `GIT_DEPTH: 0` (GitLab).

**"resource not authorized" when queuing the pipeline (Azure DevOps).** The pipeline is not allowed to use the variable group: Library → the group → Pipeline permissions → add the pipeline.

## Configuration errors (exit 20)

**`init` refuses to run.** The preset has a placeholder URL (`azure-openai`, `azure-foundry`, `openai-compatible`): pass `--base-url`. An existing `air-review.yaml` is never overwritten without `--force`.

**Provider `ollama` is rejected.** Local model runtimes are not supported. Use a hosted provider, or `mock` for an offline dry-run.

**Unknown option or command.** `air-review help <command>` prints the accepted options; unknown commands get a typo suggestion.

## Review behaviour

**Review says "skipped".** The head SHA and configuration were already reviewed. Use `--force` to review again, or `air-review review --json` to see the recorded state.

**Findings missing after a small fix.** Incremental review only re-checks changed surface. Unchanged findings carry over; findings whose code changed and no longer reproduces are resolved. `air-review explain` shows the current ledger; `--force` runs a full pass.

**A finding I expected is not there.** If it concerns unchanged lines, the strict-anchor rule dropped it (findings must anchor inside the diff). If it is a repository convention, check with `air-review inspect` that the planner found precedents; with no precedent the model is told not to invent a convention.

**No cost line.** A called model or deployment is missing from the pricing table. Price every model used by `reviewer` and `verifier` ([Choosing models](/concepts/choosing-models#cost-reporting)).

**Telemetry file grows large.** It is one JSON line per run. Prune it like any log, or set `telemetry.enabled: false`.

## Output

**Terminal shows raw ANSI codes.** The log viewer does not render colors: use `--plain`, `--no-color` or `NO_COLOR=1`. `AIR_REVIEW_PLAIN=1` makes it permanent in CI.

**No colors although I want them.** `--color=always` (or bare `--color`) overrides the environment; `FORCE_COLOR=1` does the same.

## Debugging a run

```bash
air-review inspect --base origin/main     # deterministic view, no model calls
air-review doctor --json                  # everything about config, provider and SCM
air-review review --json > run.json       # full structured result
air-review telemetry --last 5             # recent runs with tokens and duration
air-review explain                        # stored findings and their lifecycle
```

Set `AIR_REVIEW_PLAIN=1` for clean logs. The French-language first-run notes in the repository (`docs/first-local-test.fr.md`, `docs/live-check.md`) walk through a complete keyless run on Microsoft Foundry.
