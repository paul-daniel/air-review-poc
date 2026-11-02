# Poste de développeur

Comment lancer `air-review` sur votre propre machine, contre votre branche de travail, sans jamais commiter une clé. Le résultat est écrit dans `.air-review/summary.md` ; rien n'est publié.

## 1. Garder les clés hors de Git avec `.env`

Créez un fichier `.env` à la racine du dépôt que vous relisez (ou dans votre répertoire personnel) et assurez-vous qu'il est ignoré :

```bash
cat >> .gitignore <<'EOF'
.env
.env.*
.air-review/
EOF
```

Écrivez ensuite les variables de votre fournisseur. Le modèle `.env.example` du dépôt `air-review` liste toutes les variables prises en charge avec une valeur d'exemple.

```bash
# .env (jamais commité)
AIR_REVIEW_PROVIDER=azure-foundry
AIR_REVIEW_BASE_URL=https://my-foundry-resource.services.ai.azure.com
AIR_REVIEW_MODEL_REVIEWER=review-codex
AIR_REVIEW_MODEL_VERIFIER=critic-mini
AZURE_AI_API_KEY=...
```

Chargez-le dans le shell courant :

```bash
set -a; source .env; set +a
```

::: tip direnv
Avec [direnv](https://direnv.net/) installé, ajoutez un `.envrc` contenant `dotenv` à côté du `.env` et lancez `direnv allow` une fois. Les variables se chargent quand vous entrez dans le répertoire et se déchargent quand vous en sortez. Ajoutez aussi `.envrc` à `.gitignore`, ou commitez un `.envrc` qui ne contient que `dotenv` et gardez les valeurs dans `.env`.
:::

::: danger Ne commitez jamais une clé
`air-review` scanne le diff à la recherche de motifs de secrets connus et les signale comme constat BLOCKER, ce qui protège les branches de vos collègues, mais la protection la plus sûre reste une entrée dans `.gitignore`. Si une clé atteint un dépôt distant, régénérez-la immédiatement dans la console du fournisseur.
:::

| Quoi faire                                         | Ce que vous obtenez                                   | Où le ranger                                                       |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Écrire `.env`, l'ignorer, le charger dans le shell | Les variables du fournisseur dans votre environnement | `.env` (ignoré par Git) ou votre profil de shell ; jamais le dépôt |

## 2. Écrire la configuration avec `air-review init`

Lancez `init` une fois à la racine du dépôt à relire. Il écrit un `air-review.yaml` commenté pour le preset choisi et ajoute `.air-review/` à `.gitignore`.

```bash
air-review init --provider azure-foundry --base-url https://my-foundry-resource.services.ai.azure.com --base origin/main
air-review init --provider openai --ci github
air-review init --provider bedrock --ci azure-devops
```

Le fichier ne contient aucun secret : seulement le preset, l'URL du point de terminaison, le **nom de la variable** de clé (`apiKeyEnv`) et les modèles des rôles. Commitez-le pour que chaque coéquipier et le pipeline partagent les mêmes réglages. Les presets à URL de substitution (`azure-openai`, `azure-foundry`, `openai-compatible`) refusent de tourner sans `--base-url`.

Modifier plus tard sans ouvrir le fichier :

```bash
air-review config                                   # configuration effective, secrets masqués
air-review config set models.roles.reviewer gpt-4.1
air-review config set review.gate.minimumConfidence 0.95
```

| Quoi faire                     | Ce que vous obtenez           | Où le ranger           |
| ------------------------------ | ----------------------------- | ---------------------- |
| `air-review init --provider …` | `air-review.yaml` sans secret | Le dépôt (commitez-le) |

## 3. Choisir la branche de base

En mode local, le diff est la base de fusion entre une **référence de base** et le commit extrait, exactement comme une pull request. La base par défaut est `origin/main` (`platform.local.base`). Récupérez-la d'abord, puis relisez :

```bash
git fetch origin main
air-review dry-run                        # contre platform.local.base
air-review dry-run --base origin/develop  # une autre branche cible
air-review dry-run --base main            # une branche locale marche aussi
```

`Could not resolve base ref` signifie que la référence n'existe pas localement : récupérez-la ou passez `--base`.

| Quoi faire                                   | Ce que vous obtenez              | Où le ranger                                                                 |
| -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| Choisir la branche que votre changement vise | Un diff en forme de pull request | `platform.local.base` dans `air-review.yaml`, ou `--base` à chaque exécution |

## 4. Relire, relire encore avec `--force`

```bash
air-review inspect                        # ce que voit l'outil, sans appel au modèle
air-review dry-run                        # revue complète, rien de publié
air-review dry-run --deterministic-only   # règles structurelles seules, gratuit
air-review dry-run --force                # relire le même head
air-review dry-run --no-cache             # ignorer les réponses de modèle en cache
```

Une seconde exécution sur le même head avec la même configuration dit « skipped » : le registre connaît déjà ce commit. `--force` le relit quand même (après un changement de modèle ou de prompt, par exemple). `--no-cache` contourne le cache adressé par contenu sans toucher au registre.

Les exécutions locales utilisent toujours le registre local (`.air-review/state.json`) : un constat garde son identifiant quand vous corrigez un autre fichier, est résolu quand son code ne le reproduit plus, et se rouvre si vous le réintroduisez.

## 5. Lire `.air-review/summary.md`

Après chaque exécution locale :

```bash
cat .air-review/summary.md     # le tableau récapitulatif, tel qu'il apparaîtrait dans une PR
cat .air-review/context.md     # ce qui a été envoyé au modèle et pourquoi
air-review explain             # constats mémorisés avec leurs identifiants
air-review explain arf_7d0b9f  # preuves complètes et cycle de vie d'un constat
air-review telemetry --last 5  # jetons, estimation de coût, durée par exécution
```

`summary.md` liste chaque constat ouvert avec sa sévérité, sa confiance, son fichier, sa ligne et le résultat de la barrière. `context.md` montre les exemplaires et les modules liés sélectionnés par le planificateur : c'est le moyen le plus rapide de comprendre pourquoi le modèle a dit ce qu'il a dit.

## Variables d'environnement

| Variable                                               | Valeur                                                                       | Secret  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- | ------- |
| `AIR_REVIEW_PROVIDER`                                  | identifiant de preset                                                        | non     |
| `AIR_REVIEW_BASE_URL`                                  | point de terminaison (presets à substitution)                                | non     |
| `AIR_REVIEW_MODEL_REVIEWER` / `_VERIFIER`              | modèles ou noms de déploiement                                               | non     |
| la variable de clé du preset, ou `AIR_REVIEW_API_KEY`  | la clé                                                                       | **oui** |
| `AIR_REVIEW_ACCESS_TOKEN`                              | jeton Entra ID / OAuth à la place d'une clé                                  | **oui** |
| `AIR_REVIEW_CONFIG`                                    | chemin du fichier de configuration s'il n'est pas dans le répertoire courant | non     |
| `AIR_REVIEW_PLAIN`, `AIR_REVIEW_ANIMATION`, `NO_COLOR` | réglages d'affichage                                                         | non     |

## Vérifier

```bash
air-review doctor
air-review dry-run --deterministic-only   # gratuit
air-review dry-run                        # première exécution payante
```

## Erreurs fréquentes

| Symptôme                                 | Cause                                               | Correction                                                     |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `Could not resolve base ref`             | `origin/main` non récupérée, ou autre branche cible | `git fetch origin main` ou `--base <ref>`                      |
| La revue dit « skipped »                 | Même head et même configuration déjà relus          | `--force`                                                      |
| `init` refuse de tourner                 | Preset à URL de substitution                        | Passez `--base-url`                                            |
| `air-review.yaml` existe déjà            | Protection contre l'écrasement                      | `air-review init --force`                                      |
| Code de sortie `20`                      | Configuration invalide ou fournisseur manquant      | `air-review doctor`, vérifiez l'identifiant de preset et l'URL |
| Le terminal affiche des codes ANSI bruts | Visionneuse de journaux sans couleurs               | `--plain` ou `NO_COLOR=1`                                      |

Plus de cas dans [Dépannage](/fr/troubleshooting).
