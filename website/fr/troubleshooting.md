# Dépannage

Partez du code de sortie, puis du symptôme. `air-review doctor` répond à la plupart des questions d'installation en une exécution.

## Codes de sortie

| Code | Signification                         | Première chose à vérifier                                            |
| ---- | ------------------------------------- | -------------------------------------------------------------------- |
| `0`  | revue terminée, barrière passée       | –                                                                    |
| `10` | barrière échouée : constats bloquants | les constats dans la sortie, la configuration `review.gate`          |
| `20` | configuration invalide                | `air-review doctor`, nom du fournisseur, URL du point de terminaison |
| `30` | fournisseur ou modèle indisponible    | variable de clé, URL de base, nom de modèle, limites de débit        |
| `40` | échec SCM ou API                      | portée et mappage du jeton, numéro de PR, permissions                |
| `50` | défaillance interne du moteur         | relancer avec `--json`, ouvrir un ticket avec la sortie              |

Détails dans [Codes de sortie](/fr/reference/exit-codes).

## Erreurs de fournisseur (code 30)

**`401` ou `403` du point de terminaison.** La clé est absente, fausse, expirée, ou dans le mauvais en-tête. `doctor` affiche le point de terminaison résolu et la variable d'où il a lu l'identifiant ; définissez cette variable. Azure attend l'en-tête `api-key` sans préfixe : les presets s'en chargent. Avec Entra ID, un `403` signifie généralement que l'identité n'a pas le rôle `Cognitive Services OpenAI User` sur la ressource, ou que l'attribution date de moins de cinq minutes. Dans Azure Pipelines, un `401` du fournisseur alors qu'Azure DevOps fonctionne signifie en général que la variable **secrète** n'a pas été mappée sur l'étape (`env: AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)`).

**`model not found` ou `404` sur chat completions.** Le modèle du rôle n'existe pas sur ce point de terminaison ; sur Azure, ce doit être le **nom du déploiement**. `air-review models` liste ce que propose le point de terminaison (quand une liste existe) ; `air-review config set models.roles.reviewer <nom>` le change. Sur Bedrock, `bedrock-mantle` veut des identifiants sans suffixe de version (`openai.gpt-oss-120b`), `bedrock-runtime` avec (`openai.gpt-oss-120b-1:0`).

**`400 The requested operation is unsupported`.** Le déploiement ne parle que l'API Responses (`gpt-5-codex`). Avec `AIR_REVIEW_API=auto` (défaut), l'outil bascule automatiquement ; fixez `responses` pour éviter le test.

**`400` au sujet de `max_tokens` ou `temperature`.** Un modèle tiers refuse les défauts Azure. Définissez `AIR_REVIEW_MAX_TOKENS_PARAMETER=max_tokens`, ou donnez une valeur explicite à `endpoint.temperature`.

**`429` ou réponses lentes.** Limite de débit du fournisseur. Pointez le vérificateur sur un modèle plus petit, réessayez plus tard, ou augmentez `endpoint.timeoutMs`. `air-review telemetry` montre la durée et le nombre d'appels par exécution.

**Erreur d'analyse de la réponse du modèle.** Le modèle a enveloppé son JSON de prose ou de blocs de code (toléré) ou a ignoré la consigne JSON (la couche de compatibilité d'Anthropic ignore `response_format`). Choisissez un modèle qui suit bien les consignes de format, ou réessayez.

**`Credential should be scoped to a valid region` (Bedrock).** La clé d'API a été générée dans une autre Région que le point de terminaison. Régénérez-la dans la bonne Région.

## Erreurs SCM (code 40)

**`no GitHub token` à la publication.** La lecture marche sans jeton ; la publication non. Dans GitHub Actions, mettez `GITHUB_TOKEN` dans le `env` de l'étape avec l'expression `github.token` et donnez au job `pull-requests: write` et `issues: write`. En local, exportez `GH_TOKEN` ou `GITHUB_TOKEN`, ou utilisez `--ci local`.

**`403` sur une pull request de fork (GitHub).** Le jeton est en lecture seule et les secrets sont absents sur les builds de forks. Conditionnez l'étape de publication avec `if: github.event.pull_request.head.repo.full_name == github.repository` ([le cas des forks](/fr/integrations/github-actions#_4-le-cas-des-forks)).

**`403` à chaque écriture de fil (Azure DevOps).** L'identité du service de build n'a pas **Contribute to pull requests** sur le dépôt. Project settings → Repositories → le dépôt → Security → `<Project> Build Service (<Organization>)` → Allow. Si l'organisation limite la portée d'autorisation des jobs, c'est l'identité à l'échelle du projet qu'il faut autoriser ([étape 3](/fr/integrations/azure-devops#_3-accorder-la-permission-contribute-to-pull-requests-au-service-de-build)).

**`401` d'Azure DevOps.** `SYSTEM_ACCESSTOKEN` n'est pas mappé sur l'étape : `env: SYSTEM_ACCESSTOKEN: $(System.AccessToken)`.

**`Azure DevOps review is missing: --org ...`** ou **`GitHub review requires owner, repo and pull request number`.** Une exécution manuelle sans les localisateurs, ou un build CI qui n'est pas une pull request. Passez `--org --project --repo --pr` (Azure) ou `--owner --repo --pr` (GitHub), ou lancez dans un build de pull request.

**La revue tourne « localement » dans Azure Pipelines et ne publie rien.** Le build n'est pas une validation de PR (pas de `SYSTEM_PULLREQUEST_PULLREQUESTID`), ou `BUILD_REPOSITORY_PROVIDER` n'est pas `TfsGit`. Attachez le pipeline comme politique de validation de build sur la branche cible.

**`Could not resolve base ref`** ou erreur de base de fusion. Le mode local utilise `origin/main` par défaut. Récupérez d'abord la branche cible (`git fetch origin main`) ou passez `--base <ref>`. Dans un pipeline, c'est presque toujours un clone superficiel : `fetch-depth: 0` (GitHub), `fetchDepth: 0` (Azure), `clone: depth: full` (Bitbucket), `GIT_DEPTH: 0` (GitLab).

**« resource not authorized » à la mise en file du pipeline (Azure DevOps).** Le pipeline n'est pas autorisé à utiliser le groupe de variables : Library → le groupe → Pipeline permissions → ajoutez le pipeline.

## Erreurs de configuration (code 20)

**`init` refuse de tourner.** Le preset a une URL de substitution (`azure-openai`, `azure-foundry`, `openai-compatible`) : passez `--base-url`. Un `air-review.yaml` existant n'est jamais écrasé sans `--force`.

**Le fournisseur `ollama` est refusé.** Les runtimes de modèles locaux ne sont pas pris en charge. Utilisez un fournisseur hébergé, ou `mock` pour un essai hors ligne.

**Option ou commande inconnue.** `air-review help <commande>` affiche les options acceptées ; les commandes inconnues reçoivent une suggestion de correction.

## Comportement de la revue

**La revue dit « skipped ».** Le SHA de head et la configuration ont déjà été relus. Utilisez `--force` pour relire, ou `air-review review --json` pour voir l'état enregistré.

**Des constats manquent après une petite correction.** La revue incrémentale ne revérifie que la surface modifiée. Les constats inchangés sont reportés ; ceux dont le code a changé et ne se reproduit plus sont résolus. `air-review explain` montre le registre courant ; `--force` lance une passe complète.

**Un constat que j'attendais n'est pas là.** S'il concerne des lignes inchangées, la règle d'ancrage strict l'a écarté (les constats doivent s'ancrer dans le diff). S'il s'agit d'une convention du dépôt, vérifiez avec `air-review inspect` que le planificateur a trouvé des précédents ; sans précédent, le modèle a pour consigne de ne pas inventer de convention.

**Pas de ligne de coût.** Un modèle ou déploiement appelé manque dans la table de prix. Donnez un prix à chaque modèle utilisé par `reviewer` et `verifier` ([Choisir les modèles](/fr/concepts/choosing-models#rapport-de-cout)).

**Le fichier de télémétrie grossit.** C'est une ligne JSON par exécution. Nettoyez-le comme n'importe quel journal, ou mettez `telemetry.enabled: false`.

## Affichage

**Le terminal affiche des codes ANSI bruts.** La visionneuse de journaux ne rend pas les couleurs : utilisez `--plain`, `--no-color` ou `NO_COLOR=1`. `AIR_REVIEW_PLAIN=1` le rend permanent en CI.

**Pas de couleurs alors que j'en veux.** `--color=always` (ou `--color` seul) passe outre l'environnement ; `FORCE_COLOR=1` fait de même.

## Déboguer une exécution

```bash
air-review inspect --base origin/main     # vue déterministe, sans appel au modèle
air-review doctor --json                  # tout sur la configuration, le fournisseur et le SCM
air-review review --json > run.json       # résultat structuré complet
air-review telemetry --last 5             # exécutions récentes avec jetons et durée
air-review explain                        # constats mémorisés et leur cycle de vie
```

Définissez `AIR_REVIEW_PLAIN=1` pour des journaux propres. Les notes de première exécution du dépôt (`docs/first-local-test.fr.md`, `docs/live-check.md`) déroulent une exécution complète sans clé sur Microsoft Foundry.
