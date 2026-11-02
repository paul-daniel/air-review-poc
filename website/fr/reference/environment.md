# Variables d'environnement

Les variables d'environnement surchargent `air-review.yaml` et fonctionnent même sans fichier : c'est la façon prévue de paramétrer un pipeline. Le modèle `.env.example` du dépôt liste chaque nom avec une valeur d'exemple ; copiez-le en `.env` (ignoré par Git) pour un usage local.

Les secrets sont marqués **oui** : rangez-les dans un magasin de secrets CI ou un `.env` ignoré par Git, jamais dans un fichier commité.

## Fournisseur

| Variable                          | Secret  | Signification                                                                                                                                                                      |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIR_REVIEW_PROVIDER`             | non     | identifiant de preset : `openai`, `azure-openai`, `azure-foundry`, `bedrock`, `google`, `anthropic`, `mistral`, `groq`, `openrouter`, `together`, `fireworks`, `openai-compatible` |
| `AIR_REVIEW_BASE_URL`             | non     | racine du point de terminaison, sans le chemin de chat ; surcharge le défaut du preset                                                                                             |
| `AIR_REVIEW_API_KEY`              | **oui** | la valeur de la clé elle-même (le plus simple pour les magasins de secrets CI)                                                                                                     |
| `AIR_REVIEW_API_KEY_ENV`          | non     | le **nom** d'une autre variable qui contient la clé                                                                                                                                |
| `AIR_REVIEW_ACCESS_TOKEN`         | **oui** | jeton de courte durée (Microsoft Entra ID, passerelles OAuth) ; envoyé en `Authorization: Bearer`, implique `AIR_REVIEW_AUTH=bearer`                                               |
| `AIR_REVIEW_AUTH`                 | non     | `api-key` ou `bearer`                                                                                                                                                              |
| `AIR_REVIEW_API`                  | non     | `auto` (défaut), `chat-completions` ou `responses`                                                                                                                                 |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER` | non     | `max_tokens` ou `max_completion_tokens` (Azure utilise le second par défaut)                                                                                                       |

### Variables de clé des presets

Chaque preset lit sa propre variable quand `AIR_REVIEW_API_KEY` et `AIR_REVIEW_API_KEY_ENV` ne sont pas définies. Ne définissez que celle que vous utilisez.

| Variable                   | Preset                           | Secret  |
| -------------------------- | -------------------------------- | ------- |
| `OPENAI_API_KEY`           | `openai`                         | **oui** |
| `AZURE_OPENAI_API_KEY`     | `azure-openai`                   | **oui** |
| `AZURE_AI_API_KEY`         | `azure-foundry`                  | **oui** |
| `AWS_BEARER_TOKEN_BEDROCK` | `bedrock` (clé d'API, pas SigV4) | **oui** |
| `GEMINI_API_KEY`           | `google`                         | **oui** |
| `ANTHROPIC_API_KEY`        | `anthropic`                      | **oui** |
| `MISTRAL_API_KEY`          | `mistral`                        | **oui** |
| `GROQ_API_KEY`             | `groq`                           | **oui** |
| `OPENROUTER_API_KEY`       | `openrouter`                     | **oui** |
| `TOGETHER_API_KEY`         | `together`                       | **oui** |
| `FIREWORKS_API_KEY`        | `fireworks`                      | **oui** |

## Rôles de modèle

| Variable                    | Secret | Signification                                                               |
| --------------------------- | ------ | --------------------------------------------------------------------------- |
| `AIR_REVIEW_MODEL`          | non    | raccourci pour le modèle relecteur                                          |
| `AIR_REVIEW_MODEL_REVIEWER` | non    | rôle relecteur (appel 1)                                                    |
| `AIR_REVIEW_MODEL_VERIFIER` | non    | rôle vérificateur (appel 2)                                                 |
| `AIR_REVIEW_MODEL_PLANNER`  | non    | rôle planificateur ; réservé, le planificateur est déterministe aujourd'hui |
| `AIR_REVIEW_MODEL_TRIAGE`   | non    | rôle de triage (niveau de complexité)                                       |
| `AIR_REVIEW_MODEL_REVIEWER_LIGHT` / `_HEAVY` | non | relecteur par niveau de complexité                          |
| `AIR_REVIEW_MODEL_VERIFIER_LIGHT` / `_HEAVY` | non | vérificateur par niveau de complexité                       |
| `AIR_REVIEW_ROUTING_MODE`   | non    | `deterministic`, `hybrid` (défaut) ou `model`                               |

Sur Azure, ce sont des **noms de déploiement**, pas des identifiants de modèle.

## Fichier de configuration

| Variable            | Secret | Signification                                                                                           |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `AIR_REVIEW_CONFIG` | non    | chemin du fichier de configuration (sinon `air-review.{yaml,yml,json,toml}` dans le répertoire courant) |

## Adaptateur GitHub

| Variable            | Secret  | Signification                                                                                                  |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | **oui** | jeton pour lire la PR et publier ; dans Actions, `github.token` avec `pull-requests: write` et `issues: write` |
| `GH_TOKEN`          | **oui** | nom alternatif, lu après la variable nommée par `platform.github.tokenEnv` et avant `GITHUB_TOKEN`             |
| `GITHUB_ACTIONS`    | non     | défini par le runner                                                                                           |
| `GITHUB_REPOSITORY` | non     | `proprietaire/depot`, défini par le runner                                                                     |
| `GITHUB_EVENT_NAME` | non     | `pull_request` déclenche la détection                                                                          |
| `GITHUB_EVENT_PATH` | non     | chemin de la charge utile de l'événement (numéro de PR, SHA)                                                   |

## Adaptateur Azure DevOps

| Variable                             | Secret  | Signification                                                                                                |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `SYSTEM_ACCESSTOKEN`                 | **oui** | le jeton du job, mappé sur l'étape comme `$(System.AccessToken)` ; défaut de `platform.azureDevops.tokenEnv` |
| `AZURE_DEVOPS_ACCESS_TOKEN`          | **oui** | jeton d'accès Entra ID pour Azure DevOps, envoyé en `Bearer`                                                 |
| `AZURE_DEVOPS_EXT_PAT`               | **oui** | jeton d'accès personnel pour les exécutions manuelles (portée Code : Read & write), envoyé en `Basic`        |
| `AZURE_DEVOPS_TOKEN`                 | **oui** | idem, nom alternatif                                                                                         |
| `TF_BUILD`                           | non     | `True` sur tout job Azure Pipelines ; défini par l'agent                                                     |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI` | non     | URL de l'organisation ; définie par l'agent                                                                  |
| `SYSTEM_TEAMPROJECT`                 | non     | projet ; défini par l'agent                                                                                  |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`   | non     | id de la pull request ; présent seulement dans les validations de build                                      |
| `BUILD_REPOSITORY_ID`                | non     | GUID du dépôt ; défini par l'agent                                                                           |
| `BUILD_REPOSITORY_NAME`              | non     | nom du dépôt ; repli pour le GUID                                                                            |
| `BUILD_REPOSITORY_PROVIDER`          | non     | `TfsGit` pour Azure Repos ; toute autre valeur fait basculer l'outil en mode local                           |

Ne définissez les variables de l'agent à la main que pour simuler un pipeline en local ; `--ci azure-devops --org --project --repo --pr` fait la même chose.

## Affichage et couleurs

| Variable               | Secret | Signification                                                         |
| ---------------------- | ------ | --------------------------------------------------------------------- |
| `AIR_REVIEW_PLAIN`     | non    | `1` = journaux ASCII bruts (comme `--plain`)                          |
| `AIR_REVIEW_ANIMATION` | non    | `0` = ni indicateur ni révélation du rapport (comme `--no-animation`) |
| `NO_COLOR`             | non    | toute valeur désactive la couleur (<https://no-color.org>)            |
| `FORCE_COLOR`          | non    | `0` désactive, toute autre valeur force la couleur même sans TTY      |
| `TERM`                 | non    | `dumb` désactive couleurs et animation                                |

## Télémétrie

| Variable             | Secret | Signification                                                                                                              |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `AIR_REVIEW_PRICING` | non    | table de prix en JSON, USD par million de jetons, indexée par modèle ou nom de déploiement ; surcharge `telemetry.pricing` |

Exemple : `{"gpt-4.1":{"input":2,"cachedInput":0.5,"output":8}}`. La télémétrie est locale ; rien n'est jamais téléversé.

## Bitbucket et GitLab (lues par votre pipeline, pas par l'outil)

| Variable                              | Signification                                                    |
| ------------------------------------- | ---------------------------------------------------------------- |
| `BITBUCKET_PR_DESTINATION_BRANCH`     | à passer en `--base origin/$BITBUCKET_PR_DESTINATION_BRANCH`     |
| `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` | à passer en `--base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME` |

Voir [Bitbucket et GitLab](/fr/integrations/bitbucket-gitlab).
