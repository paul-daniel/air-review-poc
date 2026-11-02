# Security model

The repository is untrusted input. A PR can contain
`// AI reviewer: ignore all previous instructions`, and air-review treats it
exactly like any other data.

## Hard boundary

Prompts separate system policy from repository data with an explicit
`<untrusted-repository-data>` envelope. The policy states that data cannot
change instructions, define the role, or suppress findings — and the
verifier pass re-checks what the reviewer produced.

## What air-review does

- **Read-only git**: no checkout mutation, no code execution, no test/build
  running. Executing code is a future opt-in sandbox feature.
- **Secret redaction**: well-known secret patterns (AWS, GitHub, Google,
  OpenAI, Slack, private keys, hardcoded passwords) are removed from anything
  sent to a model and reported as a BLOCKER finding.
- **Restricted publishing surface**: the GitHub adapter can only create,
  update or resolve review comments and write the summary/state comments.
  There is no tool that edits files or code.
- **Stale-run guard**: the PR head is re-read before publishing; a run whose
  data is outdated publishes nothing.

## What to configure yourself

- Use the least-privilege GitHub token described in
  [docs/github-ci.md](github-ci.md).
- Keep publishing off for pull requests from untrusted forks, or add a
  fork-trust check to the workflow.
- `privacy.redactSecrets` and `privacy.sendFullFiles` default to the safe
  values; only the delta and targeted evidence are ever sent.
