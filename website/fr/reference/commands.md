# Commandes

Chaque commande a sa propre aide avec des exemples :

```bash
air-review --help            # toutes les commandes, les flux courants, les codes de sortie
air-review help review       # identique à : air-review review --help
air-review example           # extraits à copier-coller, sujet par sujet
```

## Options globales

Acceptées par toutes les commandes, avant ou après le nom de la commande.

| Option            | Effet                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--config <file>` | utiliser un fichier de configuration précis (défaut : `air-review.{yaml,yml,json,toml}` dans le répertoire courant) |
| `--plain`         | sortie ASCII brute pour les journaux de CI (ni couleurs ni animation)                                               |
| `--color [mode]`  | `always` (défaut), `auto` pour détecter le terminal, ou `never` ; `--color` seul signifie `always`                  |
| `--no-color`      | désactiver les couleurs (`NO_COLOR` est aussi respecté)                                                             |
| `--no-animation`  | désactiver l'indicateur de progression et la révélation du rapport                                                  |
| `--ascii`         | séparateurs ASCII, sans animation                                                                                   |
| `--version`       | afficher la version                                                                                                 |

## Options SCM

Partagées par `review`, `dry-run` et `inspect`.

| Option             | Effet                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| `--ci <mode>`      | `auto` (défaut), `github`, `azure-devops` ou `local`                                 |
| `--base <ref>`     | référence de base en mode local (défaut : `platform.local.base`, soit `origin/main`) |
| `--owner <owner>`  | propriétaire GitHub (avec `--ci github`)                                             |
| `--repo <repo>`    | nom du dépôt GitHub, ou nom ou GUID du dépôt Azure Repos                             |
| `--pr <number>`    | numéro de pull request (GitHub) ou id (Azure DevOps)                                 |
| `--org <url>`      | URL de l'organisation Azure DevOps, par exemple `https://dev.azure.com/acme`         |
| `--project <name>` | projet Azure DevOps                                                                  |

En mode `auto`, l'adaptateur est choisi d'après la configuration (`platform.provider`), puis d'après l'environnement : événement `pull_request` de GitHub Actions, Azure Pipelines (`TF_BUILD` plus un id de pull request), sinon local.

## init

Écrit une configuration commentée pour un preset de fournisseur. Échoue clairement quand un preset a besoin d'une vraie URL (`azure-openai`, `azure-foundry`, `openai-compatible`). Ajoute aussi `.air-review/` à `.gitignore`.

```bash
air-review init
air-review init --provider azure-openai --base-url https://my-res.openai.azure.com/openai/v1
air-review init --provider google --ci github
air-review init --provider bedrock --ci azure-devops
```

| Option                     | Effet                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| `--provider <name>`        | identifiant de preset (défaut `openai`)                                   |
| `--base-url <url>`         | URL du point de terminaison (obligatoire pour les presets à substitution) |
| `--framework <list>`       | frameworks séparés par des virgules (défaut `angular`)                    |
| `--ci <mode>`              | `github`, `azure-devops` ou `local` (défaut `local`)                      |
| `--model <model>`          | modèle par défaut, aussi utilisé comme relecteur                          |
| `--planner-model <model>`  | modèle du rôle planificateur                                              |
| `--verifier-model <model>` | modèle du rôle vérificateur                                               |
| `--base <ref>`             | référence de base en mode local (défaut `origin/main`)                    |
| `--force`                  | écraser un fichier de configuration existant                              |

## doctor

Vérifie la validité de la configuration, la résolution du point de terminaison, la présence de l'identifiant, la liste ou les tests de modèles, git, l'accès SCM et le cache, dans l'ordre où ils vous gêneraient. Le code de sortie reflète le pire problème (`30` fournisseur, `40` SCM, `20` configuration). Sur les points de terminaison sans `/models` (Azure, Bedrock, Anthropic), il envoie une requête minimale par déploiement de rôle distinct.

```bash
air-review doctor
air-review doctor --json
```

## example

Des extraits à copier-coller sans lire de manuel.

```bash
air-review example                 # aperçu des fournisseurs + liste des sujets
air-review example azure-foundry   # un fournisseur : yaml + env + commandes
air-review example ci-github
air-review example ci-azure
air-review example config
air-review example local
air-review example --all
```

## inspect

Montre ce que l'outil comprend, sans appeler de modèle : métadonnées de la PR, fichiers modifiés, faits structurels, conventions détectées, secrets repérés, et le plan de contexte (exemplaires, modules liés, profil du dépôt) avec la raison de chaque choix et le coût estimé en jetons.

```bash
air-review inspect --base origin/main
air-review inspect --ci github --owner acme --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --diff            # afficher aussi le diff brut
air-review inspect --json
```

## review et dry-run

Le flux principal. `dry-run` est exactement `review --dry-run` : il ne peut jamais publier. Sans `--publish` (ou `platform.publish: true`), `review` est aussi une exécution à blanc.

```bash
air-review dry-run                            # branche locale contre platform.local.base
air-review dry-run --base origin/main
air-review review --publish                   # GitHub / Azure DevOps : commentaires ; local : .air-review/
air-review review --ci github --owner acme --repo storefront --pr 483 --dry-run
air-review review --deterministic-only        # règles structurelles, zéro appel au modèle
air-review review --model gpt-4.1 --verifier-model gpt-4o-mini
air-review review --force                     # relire le même head
air-review review --json                      # résultat exploitable par un programme
```

| Option                     | Effet                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `--publish`                | publier les constats en commentaires ou fils de PR (`review` seulement)                 |
| `--dry-run`                | ne jamais publier, même si la configuration le demande (`review` seulement)             |
| `--model <model>`          | surcharger le modèle relecteur                                                          |
| `--planner-model <model>`  | surcharger le modèle planificateur (rôle réservé)                                       |
| `--reviewer-model <model>` | surcharger le modèle relecteur                                                          |
| `--verifier-model <model>` | surcharger le modèle vérificateur                                                       |
| `--deterministic-only`     | lancer les règles structurelles sans aucun appel au modèle                              |
| `--no-verifier`            | sauter la passe de vérification par le modèle (les vérifications déterministes restent) |
| `--no-cache`               | désactiver le cache local des résultats                                                 |
| `--force`                  | relire même si le head a déjà été relu                                                  |
| `--json`                   | sortie exploitable par un programme                                                     |

Codes de sortie : `0` barrière passée, `10` barrière échouée, `20` configuration, `30` fournisseur, `40` SCM, `50` interne. Voir [Codes de sortie](/fr/reference/exit-codes).

## explain

Sans identifiant : les constats mémorisés pour cette PR ou cette branche. Avec un identifiant : preuves complètes, suggestion et cycle de vie.

```bash
air-review explain
air-review explain arf_7d0b9f
air-review explain arf_7d0b9f --json
```

## models

Liste ce que propose le point de terminaison et quel rôle utilise chaque modèle. Affiche une note au lieu d'échouer quand le point de terminaison n'a pas de liste de modèles.

```bash
air-review models
air-review models --json
```

## telemetry

Exécutions récentes depuis `.air-review/telemetry.jsonl` : constats, jetons, appels au modèle, estimation de coût, durée et résultat de la barrière.

```bash
air-review telemetry
air-review telemetry --last 50 --json
```

## cache

Le cache est adressé par contenu et ne fait qu'accélérer ; le supprimer ne perd jamais l'état de la revue.

```bash
air-review cache                       # identique à : cache stats
air-review cache stats --json
air-review cache prune --older-than 24
air-review cache prune --kind review
```

## config

Chemins pointés ; les commentaires YAML sont préservés lors des modifications. `config` seul (ou `config list`) affiche la configuration effective avec les secrets masqués (`***cdef`).

```bash
air-review config
air-review config get models.roles.reviewer
air-review config set models.roles.reviewer mistral-large-latest
air-review config set review.gate.minimumConfidence 0.95
air-review config unset models.roles.planner
```

Les booléens et les nombres sont convertis. Les fichiers TOML sont réécrits par le sérialiseur, donc les commentaires des configurations TOML ne sont pas conservés.

## help

```bash
air-review help
air-review help review
air-review help config set
```

Les commandes inconnues reçoivent une suggestion de correction.
