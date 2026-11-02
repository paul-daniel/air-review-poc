# Set up air-review at work, step by step

Goal: every pull request in an Azure DevOps project gets reviewed by air-review
running in an Azure Pipeline, with models hosted in your company's Azure
(Microsoft Foundry). Nothing runs on your laptop. Allow about one hour.

You need: an Azure subscription where you can create a Foundry resource, and an
Azure DevOps project where you are Project Administrator.

---

## Part 1 – Azure cloud: the models (15 min)

1. **Create the Foundry resource.** Azure portal → search "Foundry" → **Create**.
   Pick the subscription, a resource group, a region (e.g. Sweden Central or
   West Europe), a name such as `air-review-models`. Kind is "AI Services".
   Review + create.
2. **Deploy two models.** Open https://ai.azure.com, select the resource, go to
   **Models + endpoints** → **Deploy model** → **Deploy base model**:
   - `gpt-5-codex` → name the deployment **`air-review-reviewer`** (the strong one that reads the code).
   - `gpt-4.1-mini` → name the deployment **`air-review-verifier`** (the cheap one that double-checks each finding).
     Deployment type "Global Standard". After creation, open each deployment and
     set **Tokens per minute rate limit** to at least **50K** for the reviewer.
3. **Copy two values** from the resource page (**Keys and Endpoint**):
   - the **endpoint**, shaped like `https://air-review-models.services.ai.azure.com/`
   - **Key 1** (treat it like a password; you will paste it once in step 6).

That is all for Azure cloud.

---

## Part 2 – Azure DevOps: repositories (10 min)

4. **Import the air-review code.** In your project → **Repos** → repository
   dropdown → **Import repository** → clone URL of your GitHub `air-review`
   repo → name it **`air-review`**. The pipeline builds the tool from this repo
   (no npm package needed).
5. **Add the pipeline file to the Angular repo.** In the Angular repository, on
   a branch, add these two files at the root and merge them to `main`:

   `air-review.yaml`

   ```yaml
   version: 1
   frameworks: [angular]
   provider: azure-foundry
   endpoint:
     baseUrl: https://air-review-models.services.ai.azure.com # your endpoint from step 3
     apiKeyEnv: AIR_REVIEW_API_KEY
   models:
     roles:
       reviewer: air-review-reviewer
       verifier: air-review-verifier
       planner: air-review-verifier
   review:
     maxOutputTokens: 16384
   platform:
     provider: azure-devops
     publish: true
   ```

   `azure-pipelines.yml`

   ```yaml
   trigger: none
   pr: none # Azure Repos starts this through the branch policy (step 9)

   pool:
     vmImage: ubuntu-latest # or: name: <your self-hosted pool>

   variables:
     - group: air-review # created in step 6

   resources:
     repositories:
       - repository: airreview
         type: git
         name: <YourProject>/air-review # the repo imported in step 4
         ref: main

   steps:
     - checkout: self
       fetchDepth: 0
       persistCredentials: true
     - checkout: airreview
       fetchDepth: 1
     - task: NodeTool@0
       inputs:
         versionSpec: "22.x"
     - script: npm ci && npm run build
       workingDirectory: $(Pipeline.Workspace)/s/air-review
       displayName: Build air-review
     - script: node $(Pipeline.Workspace)/s/air-review/dist/cli/index.js review --publish --plain
       workingDirectory: $(Pipeline.Workspace)/s/<YourAngularRepoName>
       displayName: Air Review
       env:
         SYSTEM_ACCESSTOKEN: $(System.AccessToken)
         AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)
   ```

   Replace the three `<...>` placeholders. With two checkouts, Azure puts each
   repo in `$(Pipeline.Workspace)/s/<repo name>`.

---

## Part 3 – Azure DevOps: secrets and variables (5 min)

6. **Create the variable group.** **Pipelines** → **Library** → **+ Variable
   group** → name **`air-review`**. Add:

   | Variable             | Value             | Secret?                  |
   | -------------------- | ----------------- | ------------------------ |
   | `AIR_REVIEW_API_KEY` | Key 1 from step 3 | **yes** (click the lock) |

   Everything else (endpoint, model names) is in `air-review.yaml`, so this is
   the only variable. Optional extras if you prefer not to commit a config
   file: `AIR_REVIEW_PROVIDER=azure-foundry`, `AIR_REVIEW_BASE_URL=<endpoint>`,
   `AIR_REVIEW_MODEL_REVIEWER=air-review-reviewer`,
   `AIR_REVIEW_MODEL_VERIFIER=air-review-verifier`.
   **Save.** Then, still in the group, tab **Pipeline permissions** → allow the
   pipeline you create in step 7 (or "Open access" for the test project).

---

## Part 4 – Azure DevOps: pipeline, permissions, policy (15 min)

7. **Create the pipeline.** **Pipelines** → **New pipeline** → **Azure Repos
   Git** → select the Angular repository → **Existing Azure Pipelines YAML
   file** → `/azure-pipelines.yml` → **Save** (do not run yet).
8. **Let the pipeline write comments.** **Project settings** → **Repositories**
   → the Angular repository → **Security** → find the user
   **`<YourProject> Build Service (<org>)`** → set **Contribute to pull
   requests** to **Allow**. (Read is already allowed, which also covers the
   `air-review` repo in the same project.)
9. **Make it run on every pull request.** **Project settings** → **Repositories**
   → the Angular repository → **Policies** → branch **main** → **Build
   Validation** → **+** → pick the pipeline from step 7, Trigger "Automatic",
   Policy requirement "Required" → **Save**.

---

## Part 5 – Agents: where the pipeline runs (depends on your company)

10. If your organisation already runs pipelines, you have agents: keep
    `vmImage: ubuntu-latest` (Microsoft-hosted) or set `pool: { name: <your
pool> }` for the company's self-hosted agents (they need Node 22 and git;
    the `NodeTool` step installs Node itself).
    A **brand-new** organisation has no hosted minutes: ask for the free grant
    at https://aka.ms/azpipelines-parallelism-request (a few days) or register
    a self-hosted agent (see docs/azure-devops.md, "Hosted agents").

---

## Part 6 – Try it (5 min)

11. Create a branch in the Angular repo, change a component (for example add
    a `subscribe(...)` without `takeUntilDestroyed`), push, open a **pull
    request** to `main`.
12. The policy starts the pipeline. One to two minutes later the PR shows:
    inline comments on the offending lines, a collapsed "memory" thread, an
    "Air Review" summary thread, and the build service as a reviewer.
    A CRITICAL or BLOCKER finding makes the build fail (exit 10), which blocks
    the merge until it is fixed.
13. Push a fix. The next run marks the fixed threads **Resolved**, updates the
    summary in place, and once nothing is open the build service votes
    **Approved** (it never completes the PR).

---

## When something fails

| Symptom                                               | Fix                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| "No hosted parallelism has been purchased or granted" | Part 5                                                                        |
| Review step: `401`/`403` from the model endpoint      | the key in the variable group, or the endpoint in `air-review.yaml`           |
| Review step: `429`                                    | raise the deployment's tokens-per-minute (step 2); the tool retries by itself |
| Review step: `403 ... Contribute to pull requests`    | step 8                                                                        |
| `Could not resolve base ref` or merge-base errors     | `fetchDepth: 0` is missing on the checkout step                               |
| Pipeline never starts on a PR                         | the branch policy (step 9) is on the wrong branch or disabled                 |

Cost reference: one review of a normal pull request is about 2 to 5 cents with
`gpt-5-codex`; follow-up pushes are under a cent.
