# Troubleshooting

## Exit codes

| Code | Meaning                        | First thing to check                               |
| ---- | ------------------------------ | -------------------------------------------------- |
| `0`  | review finished, gate passed   | –                                                  |
| `10` | gate failed: blocking findings | the findings in the output, `review.gate` config   |
| `20` | invalid configuration          | `air-review doctor`, provider name, endpoint URL   |
| `30` | provider/model unavailable     | API key env var, base URL, model name, rate limits |
| `40` | SCM/API failure                | token scope, PR number, permissions                |
| `50` | internal engine failure        | run with `--json`, open an issue with the output   |

## Common errors

**`401`/`403` from the endpoint**
The key is missing, wrong, or in the wrong header. `air-review doctor` shows
the resolved endpoint and which env var was checked. Azure expects
`apiKeyHeader: api-key` and an empty prefix; the presets set this already.

**`model not found` / `404` on chat completions**
The role model name does not exist at that endpoint (or, for Azure, it is not
your deployment name). `air-review models` lists what the endpoint offers;
`air-review config set models.roles.reviewer <name>` changes it.

**`429` or slow responses**
air-review retries 429 and 5xx answers up to four times, honouring
`Retry-After`, and prints a note on each retry. If the review still fails,
the deployment's quota is too small for the prompt size: on Azure, raise the
deployment's tokens-per-minute capacity (10K TPM is enough for one review at
a time, not for parallel pipelines).
Provider rate limit. Lower the load by pointing the verifier at a smaller
model, or raise `endpoint.timeoutMs`. `air-review telemetry` shows duration
and call counts per run.

**`no GitHub token` on publish**
Reading works without a token; publishing does not. On GitHub Actions set
`GITHUB_TOKEN: ${{ github.token }}` with `pull-requests: write`; locally
export `GH_TOKEN` or `GITHUB_TOKEN`, or use `--ci local`.

**`Could not resolve base ref`**
Local mode defaults to `origin/main`. Fetch the target branch first
(`git fetch origin main`) or pass `--base <ref>`.

**Review says "skipped"**
The head SHA and configuration were already reviewed. Use `--force` to review
again, or `air-review review --json` to see the recorded state.

**Findings missing after a small fix**
Incremental review only re-checks changed surface. Unchanged findings carry
over; findings whose code changed and no longer reproduce are resolved. Use
`air-review explain` to see the current ledger and `--force` for a full pass.

**Telemetry file grows large**
It is one JSON line per run. Prune it like any log, or set
`telemetry.enabled: false`.

## Debugging a run

```bash
air-review inspect --base origin/main     # deterministic view, no model calls
air-review doctor --json                  # everything about config/provider/SCM
air-review review --json > run.json       # full structured result
air-review telemetry --last 5
```

Set `AIR_REVIEW_PLAIN=1` for clean logs, and pass `--no-color` when a log
viewer renders ANSI codes literally.
