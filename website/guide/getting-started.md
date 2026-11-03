# Getting started: your repository reviewed by air-review in 30 minutes

You have a repository on Azure DevOps and models on Microsoft Foundry. At the
end of this guide, every pull request gets reviewed, commented, and approved
or sent back, automatically. You do not need to know how the tool works
inside. Four parts, each ends with a check.

_Version française : [Démarrage](/fr/guide/getting-started)._

## Part 1 — Foundry: two models and one address (10 min)

1. Open [ai.azure.com](https://ai.azure.com) with the **New Foundry** toggle on.
2. Create a Foundry resource (or reuse one). Note its name.
3. In **Discover → Models**, deploy **two** models with **Default settings**:
   - a cheap one, for small changes and checks (for example `gpt-5-mini` or `claude-haiku-4-5`);
   - a strong one, for large changes (for example `gpt-5` or `claude-sonnet-4-5`).
     Keep the deployment names: you will type them in part 3.
4. In the resource's **Overview**, copy the endpoint that looks like
   `https://<resource>.services.ai.azure.com` and, if you prefer keys over
   sign-in, one **API key**.

**Check:** the two deployments show **Succeeded** in **Models + endpoints**.

## Part 2 — Your machine: one dry run (5 min)

```bash
npm install -g github:paul-daniel/air-review-poc   # needs Node 22
cd your-repository
az login                                            # or: export AIR_REVIEW_API_KEY=<key>
air-review init --provider azure-foundry --base-url https://<resource>.services.ai.azure.com --ci azure-devops
```

Open the generated `air-review.yaml` and put your two deployment names in
`models` (`reviewer`, `tiers.light.reviewer`, `tiers.heavy.reviewer`,
`triage`, `verifier`). A Claude deployment is recognised by its name
(`claude-…`); otherwise write it as `claude:<deployment>`.

```bash
air-review doctor                 # everything green?
air-review dry-run --base origin/main   # reviews your current branch, publishes nothing
```

**Check:** `doctor` shows the credential it uses and probes each deployment;
`dry-run` prints a routing line ("light tier → …"), the findings, and the
cost. Commit `air-review.yaml`.

## Part 3 — Azure DevOps: the pipeline (10 min)

1. Copy [examples/azure-pipelines.yml](https://github.com/paul-daniel/air-review-poc/blob/main/examples/azure-pipelines.yml) to the
   root of your repository as `azure-pipelines.yml`. Replace the two `echo`
   lines by your real build and test commands (or delete them).
2. **Pipelines → Library → + Variable group** named `air-review` with:

   | Name                                                   | Value                                                                   |
   | ------------------------------------------------------ | ----------------------------------------------------------------------- |
   | `AIR_REVIEW_PROVIDER`                                  | `azure-foundry`                                                         |
   | `AIR_REVIEW_BASE_URL`                                  | `https://<resource>.services.ai.azure.com`                              |
   | `AIR_REVIEW_API_KEY` (lock icon)                       | the API key, or leave it out and use the Azure sign-in step in the YAML |
   | `AIR_REVIEW_MODEL_REVIEWER`                            | strong deployment                                                       |
   | `AIR_REVIEW_MODEL_REVIEWER_LIGHT`                      | cheap deployment                                                        |
   | `AIR_REVIEW_MODEL_REVIEWER_HEAVY`                      | strong deployment                                                       |
   | `AIR_REVIEW_MODEL_TRIAGE`, `AIR_REVIEW_MODEL_VERIFIER` | cheap deployment                                                        |

3. **Pipelines → New pipeline → Azure Repos Git → your repository → Existing YAML file** → `azure-pipelines.yml` → Save (do not run yet).
4. **Project settings → Repositories → your repository → Security**: select
   **`<Project> Build Service (<Organization>)`** and set **Contribute to pull
   requests** to _Allow_.
5. **Project settings → Repositories → your repository → Policies → Branch policies → `main` → Build validation → +**: pick the pipeline, trigger _Automatic_, policy _Required_.

6. **Credentials for Foundry.** On a work organisation with Microsoft-hosted
   agents, prefer an **Azure Resource Manager service connection** (Project
   settings → Service connections → New → Azure Resource Manager, workload
   identity federation) over an API key: give its identity the **Azure AI
   User** role on the Foundry resource and uncomment the "Sign in to Azure"
   step of the YAML. No key to store or rotate. On a self-hosted agent, the
   agent's own `az login` works as is.
7. **First run.** The first run of the pipeline stops with "This pipeline needs
   permission to access a resource": open the run, click **View** then
   **Permit** (agent pool, variable group). Once per pipeline.

**Check:** no error on save. If your organisation has no hosted agents yet
("No hosted parallelism"), request the free grant or register a self-hosted
agent (see [Azure DevOps](/integrations/azure-devops)). Note that once the policy is
attached, `main` only changes through pull requests, including for the
pipeline file itself.

## Part 4 — First pull request (5 min)

Create a branch, change a file, push, open a pull request to `main`. Within a
few minutes you see:

- a comment **Air Review — …** with the verdict first, which model reviewed and why, the findings table, and the cost per step (collapsed);
- one thread per finding on the exact line, with the fix;
- the reviewer vote: _Waiting for author_ if something blocks, _Approved_ once review, build and tests are green;
- the run report in the pipeline artifacts.

Push a fix: only the changed lines are reviewed, resolved threads get a
"Resolved" reply, a partial fix gets the next step in the same thread.

## When something goes wrong

| Symptom                                                         | What to do                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `doctor` says the credential is missing                         | `az login`, or set `AIR_REVIEW_API_KEY`                                                              |
| `doctor` probe fails with 404                                   | the deployment name in `air-review.yaml` does not match the portal                                   |
| pipeline: HTTP 403 when publishing                              | step 4 of part 3 (Contribute to pull requests). Until you have the right, set `AIR_REVIEW_PUBLISH` = `false` in the variable group: the review runs, the findings are in the step log and in the `air-review-reports` artifact |
| pipeline run by hand on `main`: "nothing to review"             | expected: the review steps only run in a pull-request build, or with the **Pull request id** parameter |
| no right to add the branch policy                               | run the review by hand: **Run pipeline** → Branch = the PR's source branch → parameter **Pull request id** = the PR number → Run. Same result as a PR build |
| pipeline: "No hosted parallelism"                               | request the grant or use a self-hosted agent                                                         |
| the review found nothing on a bug you planted                   | check the tier in the summary; force `--tier heavy` once to compare                                  |
| a remark is not worth fixing                                    | set the thread to **Resolved**, **Won't fix** or **Closed**: the tool respects it and stops blocking |
| pipeline: "This pipeline needs permission to access a resource" | open the run, **View**, **Permit** (first run only)                                                  |
| pipeline: Foundry 401 with no key configured                    | the sign-in step is missing (service connection) or the agent has no `az login`; see part 3, step 6  |

Everything else: [Azure DevOps](/integrations/azure-devops), [Microsoft Foundry](/integrations/microsoft-foundry), [Troubleshooting](/troubleshooting).
