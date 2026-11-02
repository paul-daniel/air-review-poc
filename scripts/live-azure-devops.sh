#!/usr/bin/env bash
# Live validation of the Azure DevOps adapter against a real organisation.
#
# Run it yourself in a terminal; it never prints the token. It:
#   1. creates (or reuses) a project and pushes the demo corpus into its repository,
#   2. opens a pull request demo-scenarios -> main,
#   3. runs `air-review doctor`, `dry-run`, then `review --publish` against that PR,
#   4. prints the threads the review created.
#
# Required environment:
#   AZURE_DEVOPS_EXT_PAT   a PAT with scopes "Code (Read & write)" and "Pull Request Threads (Read & write)"
#   ADO_ORG                e.g. https://dev.azure.com/dantchatchouang
# Optional:
#   ADO_PROJECT            default air-review-test
#   AIR_REVIEW_*           provider settings (see docs/live-check.md); without them the run is deterministic-only.
set -euo pipefail

: "${AZURE_DEVOPS_EXT_PAT:?set AZURE_DEVOPS_EXT_PAT (never paste it in chat)}"
: "${ADO_ORG:?set ADO_ORG, e.g. https://dev.azure.com/<org>}"
ADO_PROJECT="${ADO_PROJECT:-air-review-test}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli/index.js"
AUTH="$(printf ':%s' "$AZURE_DEVOPS_EXT_PAT" | base64 | tr -d '\n')"
api() { # method path [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" --data "$body" "$ADO_ORG/$path"
  else
    curl -sS -X "$method" -H "Authorization: Basic $AUTH" "$ADO_ORG/$path"
  fi
}

echo "== 1. project $ADO_PROJECT"
if ! api GET "_apis/projects/$ADO_PROJECT?api-version=7.1" | grep -q '"wellFormed"'; then
  api POST "_apis/projects?api-version=7.1" \
    "{\"name\":\"$ADO_PROJECT\",\"description\":\"air-review live validation (safe to delete)\",\"visibility\":\"private\",\"capabilities\":{\"versioncontrol\":{\"sourceControlType\":\"Git\"},\"processTemplate\":{\"templateTypeId\":\"6b724908-ef14-45cf-84f8-768b5384da45\"}}}" >/dev/null
  for _ in $(seq 1 30); do
    api GET "_apis/projects/$ADO_PROJECT?api-version=7.1" | grep -q '"wellFormed"' && break
    sleep 4
  done
fi
REPO_JSON="$(api GET "$ADO_PROJECT/_apis/git/repositories/$ADO_PROJECT?api-version=7.1")"
REPO_ID="$(printf '%s' "$REPO_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')"
REMOTE="$(printf '%s' "$REPO_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).remoteUrl))')"
echo "repository: $REPO_ID"

echo "== 2. demo corpus"
WORK="$(mktemp -d)/corpus"
node "$ROOT/scripts/demo.mjs" "$WORK" >/dev/null
cd "$WORK"
git checkout -q demo-scenarios
git -c http.extraheader="AUTHORIZATION: Basic $AUTH" push -q "$REMOTE" main demo-scenarios 2>&1 | grep -v -i "authorization" || true

echo "== 3. pull request"
PR_ID="$(api GET "$ADO_PROJECT/_apis/git/repositories/$REPO_ID/pullrequests?searchCriteria.status=active&api-version=7.1" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).value||[];const p=v.find(x=>x.sourceRefName==="refs/heads/demo-scenarios");console.log(p?p.pullRequestId:"")})')"
if [ -z "$PR_ID" ]; then
  PR_ID="$(api POST "$ADO_PROJECT/_apis/git/repositories/$REPO_ID/pullrequests?api-version=7.1" \
    '{"sourceRefName":"refs/heads/demo-scenarios","targetRefName":"refs/heads/main","title":"Demo: widget subscription and discount bug","description":"Opened by scripts/live-azure-devops.sh"}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).pullRequestId))')"
fi
echo "pull request: !$PR_ID"

echo "== 4. air-review"
MODE=()
if [ -z "${AIR_REVIEW_MODEL_REVIEWER:-}${AIR_REVIEW_MODEL:-}" ]; then MODE=(--deterministic-only); fi
node "$CLI" --plain dry-run --ci azure-devops --org "$ADO_ORG" --project "$ADO_PROJECT" --repo "$ADO_PROJECT" --pr "$PR_ID" "${MODE[@]}"
node "$CLI" --plain review --publish --ci azure-devops --org "$ADO_ORG" --project "$ADO_PROJECT" --repo "$ADO_PROJECT" --pr "$PR_ID" "${MODE[@]}"

echo "== 5. threads on the pull request"
api GET "$ADO_PROJECT/_apis/git/repositories/$REPO_ID/pullrequests/$PR_ID/threads?api-version=7.1" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const t of JSON.parse(s).value||[]){const c=(t.comments||[])[0]||{};console.log(`thread ${t.id} status=${t.status} ${t.threadContext?t.threadContext.filePath+":"+(t.threadContext.rightFileStart||{}).line:"(general)"} :: ${(c.content||"").split("\n").find(l=>l&&!l.startsWith("<!--"))||""}`)}})'
echo "PR: $ADO_ORG/$ADO_PROJECT/_git/$ADO_PROJECT/pullrequest/$PR_ID"
