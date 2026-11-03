# Exit codes

`air-review` uses a fixed exit-code contract so a pipeline can tell a failed gate from a broken setup.

| Code | Meaning                       | What the pipeline should do                   | First thing to check                                          |
| ---- | ----------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `0`  | review finished, gate passed  | continue                                      | –                                                             |
| `10` | review finished, gate failed  | fail the check: blocking findings remain open | the findings in the output; `review.gate` in the config       |
| `20` | invalid configuration         | fail the job as an infrastructure error       | `air-review doctor`; preset id; endpoint URL                  |
| `30` | provider or model unavailable | fail the job as an infrastructure error       | key variable, base URL, model or deployment name, rate limits |
| `40` | SCM or API failure            | fail the job as an infrastructure error       | token scope and mapping, PR number, permissions               |
| `50` | internal engine failure       | fail the job; report it                       | run with `--json`, open an issue with the output              |

## What makes the gate fail

A run exits with `10` when at least one **open** finding has a severity listed in `review.gate.severities` (default `BLOCKER`, `CRITICAL`) **and** a confidence of at least `review.gate.minimumConfidence` (default `0.6`). Everything else is reported but does not block. Deterministic findings (secrets, subscription leaks) carry their own confidence, and a detected secret is a `BLOCKER`.

To change the policy:

```bash
air-review config set review.gate.minimumConfidence 0.65
air-review config set review.gate.severities '["BLOCKER"]'
```

## In a pipeline

- **Azure Pipelines**: a non-zero exit fails the step; as a build-validation policy with **Policy requirement: Required**, `10` blocks the pull request. Use **Optional** during a trial.
- **GitHub Actions**: a non-zero exit fails the job and the check; add `continue-on-error: true` to the step during a trial.
- **Bitbucket, GitLab**: a non-zero exit fails the job; `allow_failure: true` (GitLab) or a trailing `|| true` in the script makes it advisory.

`doctor` exits with the code of the worst problem it found (`30`, `40`, `20`), which makes it usable as a pre-flight step.
