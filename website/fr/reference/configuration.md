# Configuration

Chaque option a une valeur par défaut, donc une configuration minimale peut être presque vide. Le schéma de référence, lisible par la machine, est `schema/air-review.schema.json` dans le dépôt (régénérez-le avec `npm run schema`).

## Découverte du fichier et priorité

1. `--config <file>` ou `AIR_REVIEW_CONFIG` ;
2. sinon `air-review.yaml`, `air-review.yml`, `air-review.json` ou `air-review.toml` dans le répertoire courant ;
3. les variables d'environnement surchargent le fichier et fonctionnent même sans fichier ([Variables d'environnement](/fr/reference/environment)) ;
4. les drapeaux de la ligne de commande (`--model`, `--base`, ...) surchargent les deux.

`air-review config set/unset` préserve les commentaires en YAML. Les fichiers TOML sont réécrits par le sérialiseur, donc les commentaires en TOML ne sont pas conservés.

## Exemple complet

```yaml
version: 1
provider: openai # identifiant de preset ; voir : air-review example providers
frameworks: [angular]

endpoint:
  baseUrl: https://api.openai.com/v1 # défaut du preset
  apiKeyEnv: OPENAI_API_KEY # défaut du preset
  timeoutMs: 120000
  headers: {}

models:
  default: gpt-4o-mini # repli pour tous les rôles
  roles:
    triage: gpt-4o-mini # décide du niveau de complexité
    planner: gpt-4o-mini # réservé : déterministe aujourd'hui
    reviewer: gpt-4.1 # passe de raisonnement forte (appel 1)
    verifier: gpt-4o-mini # vérifier et calibrer avant publication (appel 2)

context:
  strategy: structural-selective
  maxContextRequests: 20
  maxEvidenceTokens: 30000

review:
  severities:
    publish: [BLOCKER, CRITICAL, MAJOR, MINOR]
  gate:
    severities: [BLOCKER, CRITICAL]
    minimumConfidence: 0.9
  maxFindings: 40

memory:
  backend: pr-ledger # pr-ledger | local | none
cache:
  enabled: true
  dir: .air-review/cache

privacy:
  redactSecrets: true
  sendFullFiles: false

telemetry:
  enabled: true
  log: .air-review/telemetry.jsonl
  pricing:
    gpt-4.1: { input: 2, cachedInput: 0.5, output: 8 }
    gpt-4o-mini: { input: 0.15, cachedInput: 0.075, output: 0.6 }

platform:
  provider: local # local | github | azure-devops
  publish: false
  local:
    base: origin/main
```

## Sections

### `provider` et `models`

| Clé                            | Défaut                     | Signification                                                                                                                                                                      |
| ------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                     | `openai`                   | identifiant de preset : `openai`, `azure-openai`, `azure-foundry`, `bedrock`, `google`, `anthropic`, `mistral`, `groq`, `openrouter`, `together`, `fireworks`, `openai-compatible` |
| `models.default`               | suggestion du preset       | repli pour tous les rôles                                                                                                                                                          |
| `models.roles.reviewer`        | `models.default`           | modèle de raisonnement fort, appel 1                                                                                                                                               |
| `models.roles.verifier`        | `models.default`           | modèle petit à moyen, appel 2                                                                                                                                                      |
| `models.roles.planner`         | relecteur, puis défaut     | réservé ; le planificateur est déterministe et n'appelle pas de modèle                                                                                                             |
| `models.roles.triage`          | planificateur, puis défaut | modèle de triage (bon marché) qui décide du niveau de complexité ; voir `routing` et `models.tiers` dans docs/configuration.md du dépôt                                            |
| `models.tiers.light` / `heavy` | rôle standard              | relecteur/vérificateur par niveau de complexité (`reviewer`, `verifier`)                                                                                                           |

Le moteur consomme des rôles, pas des modèles. Sur Azure, la valeur est toujours le **nom du déploiement**.

### `endpoint`

| Clé                  | Défaut                                           | Signification                                                                                                                               |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`            | preset                                           | racine du point de terminaison, sans le chemin de chat ; les points de terminaison Foundry de ressource ou de projet reçoivent `/openai/v1` |
| `apiKeyEnv`          | preset                                           | nom de la variable d'environnement qui contient la clé                                                                                      |
| `apiKey`             | –                                                | valeur directe de la clé ; à éviter, préférez `apiKeyEnv`                                                                                   |
| `auth`               | `api-key`                                        | `api-key` (en-tête du preset) ou `bearer` (forcer `Authorization: Bearer`, pour Entra ID et OAuth)                                          |
| `api`                | `auto`                                           | protocole : `auto` (bascule sur Responses en cas de `400 unsupported`), `chat-completions`, `responses`                                     |
| `apiKeyHeader`       | preset (`authorization` ou `api-key`)            | en-tête qui porte la clé                                                                                                                    |
| `apiKeyPrefix`       | preset (`Bearer ` ou vide)                       | préfixe devant la clé                                                                                                                       |
| `chatPath`           | `/chat/completions`                              | chemin des chat completions                                                                                                                 |
| `modelsPath`         | `/models`                                        | utilisé par `models` et `doctor`                                                                                                            |
| `listModels`         | preset                                           | `false` quand le point de terminaison n'a pas de route `/models` (Azure, Bedrock, Anthropic)                                                |
| `timeoutMs`          | `120000`                                         | délai HTTP par appel au modèle                                                                                                              |
| `headers`            | `{}`                                             | en-têtes statiques supplémentaires                                                                                                          |
| `temperature`        | preset (omis sur Azure)                          | nombre, ou `null` pour omettre                                                                                                              |
| `maxTokensParameter` | `max_tokens` (`max_completion_tokens` sur Azure) | nom du paramètre de limite de jetons                                                                                                        |

### `frameworks`

```yaml
frameworks: [angular]
```

Packs de contexte à activer. `angular` est livré aujourd'hui (règle de cycle de vie des abonnements, conventions conteneur/présentateur, faits Angular). Le planificateur d'exemplaires et le profil du dépôt sont indépendants du langage et toujours actifs.

### `context`

| Clé                  | Défaut                 | Signification                                                                  |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `strategy`           | `structural-selective` | la seule stratégie aujourd'hui                                                 |
| `semanticFallback`   | `false`                | le repli vectoriel ou sémantique n'est pas construit                           |
| `maxContextRequests` | `20`                   | nombre maximal de fichiers du dépôt lus comme preuves par revue                |
| `maxEvidenceTokens`  | `30000`                | nombre maximal de jetons d'exemplaires et de modules liés envoyés au relecteur |

`air-review inspect` montre le plan et son coût estimé en jetons avant tout appel au modèle. Voir [Conscience du contexte](/fr/concepts/contextual-awareness).

### `review`

| Clé                      | Défaut                              | Signification                                                     |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| `severities.publish`     | `[BLOCKER, CRITICAL, MAJOR, MINOR]` | quelles sévérités peuvent devenir des commentaires                |
| `gate.severities`        | `[BLOCKER, CRITICAL]`               | quels constats ouverts font échouer l'exécution avec le code `10` |
| `gate.minimumConfidence` | `0.9`                               | un constat sous cette confiance ne bloque jamais                  |
| `maxFindings`            | `40`                                | plafond par exécution                                             |

### `memory` et `cache`

| Clé              | Défaut              | Signification                                                                                                                                                     |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory.backend` | `pr-ledger`         | `pr-ledger` garde l'état dans les commentaires ou fils de PR ; `local` écrit `.air-review/state.json` ; `none` désactive la lecture et l'avancement de la mémoire |
| `cache.enabled`  | `true`              | cache adressé par contenu des réponses du modèle ; `false` désactive la réutilisation et l'écriture                                                               |
| `cache.dir`      | `.air-review/cache` | emplacement du cache                                                                                                                                              |

L'adaptateur local écrit toujours `.air-review/state.json`, quel que soit `memory.backend`. Le cache est reconstructible et n'est jamais la vérité.

### `privacy`

| Clé             | Défaut  | Signification                                                              |
| --------------- | ------- | -------------------------------------------------------------------------- |
| `redactSecrets` | `true`  | retirer les motifs de secrets connus de tout ce qui est envoyé à un modèle |
| `sendFullFiles` | `false` | seuls le delta et les preuves ciblées sont envoyés                         |

### `telemetry`

| Clé       | Défaut                        | Signification                                                                             |
| --------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `enabled` | `true`                        | enregistrer l'usage par rôle en local                                                     |
| `log`     | `.air-review/telemetry.jsonl` | une ligne JSON par exécution ; reste local                                                |
| `pricing` | `{}`                          | par modèle ou déploiement : `input`, `cachedInput`, `output` en USD par million de jetons |

`AIR_REVIEW_PRICING` (JSON) surcharge `telemetry.pricing`. Tous les déploiements appelés doivent avoir un prix pour une estimation totale. Rien n'est jamais téléversé ; le fichier est à vous, à joindre comme artefact CI si vous le souhaitez.

### `platform`

```yaml
platform:
  provider: local # local | github | azure-devops
  publish: false # true = publier sans --publish
  github:
    owner: acme # facultatif ; détecté en CI
    repo: storefront
    tokenEnv: GITHUB_TOKEN # puis GH_TOKEN, GITHUB_TOKEN
    apiBaseUrl: https://api.github.com # GitHub Enterprise
  azureDevops:
    organizationUrl: https://dev.azure.com/acme # facultatif ; détecté dans Azure Pipelines
    project: Shop
    repository: storefront # nom ou GUID
    tokenEnv: SYSTEM_ACCESSTOKEN # puis AZURE_DEVOPS_ACCESS_TOKEN, AZURE_DEVOPS_EXT_PAT, AZURE_DEVOPS_TOKEN
    apiVersion: "7.1"
  local:
    base: origin/main # référence de base par défaut des revues locales
```

En mode local, le diff est la base de fusion entre `base` et le commit extrait. En mode GitHub sans jeton, les lectures passent par l'API non authentifiée et toute tentative de publication échoue avec le code `40` et un message explicite.
