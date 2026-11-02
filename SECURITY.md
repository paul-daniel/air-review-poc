# Security policy

air-review reads pull requests and sends part of their content to a model API. This page says exactly what
leaves the machine, how secrets are kept out of it, and how to report a problem. The full threat model is in
[docs/security.md](docs/security.md).

## Supported versions

Only the latest release on the default branch receives security fixes. There is no long-term-support line.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

<!-- TODO(owner): replace with the real private channel before publishing (GitHub private vulnerability
reporting under Security → "Report a vulnerability", or a security@ mailbox). -->

- Use the repository's private vulnerability reporting (Security → Report a vulnerability), or
- email the maintainer listed in `package.json` with the subject `air-review security`.

Include the version (`air-review --version`), the provider preset in use, a minimal reproduction, and the
impact you see. You will get an acknowledgement within 3 working days and a fix or mitigation plan within
14 days for confirmed issues. Credit is given in the changelog unless you prefer otherwise.

## What is sent to the model

A review makes HTTP calls to the configured OpenAI-compatible endpoint and nothing else. Each call carries:

- the **diff** of the pull request (merge base to head), and
- **targeted evidence**: the declarations, call sites and conventions the structural analysis selected,
  bounded by `context.maxEvidenceTokens`.

Whole files are never sent (`privacy.sendFullFiles` defaults to `false`), the repository is never cloned
anywhere, and no telemetry leaves the machine: `.air-review/telemetry.jsonl` is a local file you may or
may not upload as a CI artifact.

## Redaction

Before anything is sent, `src/security/redaction.ts` scans the delta for well-known secret shapes (AWS and
GitHub tokens, Google and OpenAI keys, Slack tokens, private-key blocks, hardcoded passwords). Matches are
removed from the prompt and reported as a `BLOCKER` finding, so the key is neither leaked to the model nor
silently accepted into the codebase. `privacy.redactSecrets` is on by default.

The CLI never prints credentials either: `src/config/redact.ts` masks every secret-looking configuration key
(`apiKey`, tokens, passwords) when the config is displayed by `config list`, `doctor` or `--json` output,
keeping only the last four characters for identification. Provider errors name the **environment variable**
that holds the key, never its value.

## The untrusted-data envelope

The repository under review is treated as hostile input. Every prompt separates the system policy from the
repository content with an explicit `<untrusted-repository-data>` envelope, and the policy states that data
inside it cannot change instructions, redefine the role or suppress findings. A second model call, the
verifier, re-checks the reviewer's output against the same rule. `npm run demo` contains a prompt-injection
comment precisely to exercise this boundary.

## What air-review does not do

- It never executes repository code, runs builds or tests, or mutates the checkout: git access is read-only.
- Its publishing surface is limited to creating, updating and resolving review comments and the summary and
  state comments; there is no tool that edits files.
- A stale-run guard re-reads the PR head before publishing and publishes nothing if a newer push landed.

## Hardening you own

- Give the SCM token the least privilege described in [docs/github-ci.md](docs/github-ci.md).
- Keep publishing off for pull requests from untrusted forks, or gate it on a fork-trust check.
- Store API keys in the CI secret store and pass them through `AIR_REVIEW_API_KEY`; keep `endpoint.apiKey`
  out of committed configuration files (`.env` and `.env.*` are git-ignored for that reason).
