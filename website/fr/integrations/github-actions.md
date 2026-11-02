# GitHub Actions

`air-review` relit les pull requests GitHub depuis un workflow `pull_request` et publie des commentaires de revue en ligne, un commentaire de résumé et un commentaire d'état caché. Le jeton intégré du workflow suffit ; aucun jeton personnel n'est nécessaire.

Ce guide suppose qu'un fournisseur de modèles est déjà configuré ([Microsoft Foundry](/fr/integrations/microsoft-foundry), [Amazon Bedrock](/fr/integrations/amazon-bedrock) ou [un autre fournisseur](/fr/integrations/other-providers)).

## 1. Ranger les réglages du fournisseur

Dépôt → **Settings** → **Secrets and variables** → **Actions**.

- Onglet **Variables** → **New repository variable** pour chaque valeur non secrète.
- Onglet **Secrets** → **New repository secret** pour la clé.

| Type       | Nom                         | Exemple                                             |
| ---------- | --------------------------- | --------------------------------------------------- |
| Variable   | `AIR_REVIEW_PROVIDER`       | `azure-foundry`                                     |
| Variable   | `AIR_REVIEW_BASE_URL`       | `https://my-foundry-resource.services.ai.azure.com` |
| Variable   | `AIR_REVIEW_MODEL_REVIEWER` | `review-codex`                                      |
| Variable   | `AIR_REVIEW_MODEL_VERIFIER` | `critic-mini`                                       |
| Variable   | `AIR_REVIEW_PRICING`        | `{"review-codex":{"input":1.25,"output":10}}`       |
| **Secret** | `AIR_REVIEW_API_KEY`        | la clé du fournisseur                               |

Les secrets et variables d'organisation fonctionnent de la même façon et sont visibles par tous les dépôts que vous autorisez.

| Quoi faire                                    | Ce que vous obtenez                                                       | Où le ranger                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Créer les variables et le secret sous Actions | Des valeurs lisibles comme `vars.NOM` et `secrets.NOM` dans les workflows | **Variables** et **secrets** du dépôt GitHub (ou de l'organisation) |

Source : [Store information in variables](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables), [Using secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## 2. Donner les bonnes permissions au jeton du workflow

Le jeton automatique (`github.token`, aussi exposé comme `GITHUB_TOKEN`) est créé pour chaque job. Ses permissions se règlent avec la clé `permissions`. La revue a besoin de :

- `contents: read` pour récupérer le code ;
- `pull-requests: write` pour poster des commentaires de revue en ligne ;
- `issues: write` pour les commentaires de résumé et d'état (les commentaires de conversation d'une PR sont des commentaires d'issue dans l'API GitHub).

| Quoi faire                           | Ce que vous obtenez                         | Où le ranger                           |
| ------------------------------------ | ------------------------------------------- | -------------------------------------- |
| Ajouter le bloc `permissions` au job | Un jeton qui peut lire le code et commenter | Le fichier de workflow ; rien à copier |

Source : [Automatic token authentication](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication).

## 3. Ajouter le workflow

Créez `.github/workflows/air-review.yml` (le dépôt fournit le même fichier sous `.github/workflows/air-review.example.yml`) :

```yaml
name: air-review

on:
  pull_request:

jobs:
  air-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # historique complet : le diff est calculé depuis la base de fusion

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Installer air-review
        run: npm install -g air-review

      - name: Revue
        env:
          GITHUB_TOKEN: ${{ github.token }}
          AIR_REVIEW_PROVIDER: ${{ vars.AIR_REVIEW_PROVIDER }}
          AIR_REVIEW_BASE_URL: ${{ vars.AIR_REVIEW_BASE_URL }}
          AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
          AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
          AIR_REVIEW_PRICING: ${{ vars.AIR_REVIEW_PRICING }}
          AIR_REVIEW_API_KEY: ${{ secrets.AIR_REVIEW_API_KEY }}
        run: air-review review --publish --plain

      - name: Conserver le journal de télémétrie
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: air-review-telemetry
          path: .air-review/telemetry.jsonl
          if-no-files-found: ignore
```

Remarques :

- Dans un workflow `pull_request`, la charge utile de l'événement fournit le propriétaire, le dépôt et le numéro de PR ; aucun drapeau `--owner/--repo/--pr` n'est nécessaire.
- Si `air-review` n'est pas publié sur un registre accessible, récupérez le dépôt `air-review` dans une seconde étape `actions/checkout` (avec `path:`), lancez-y `npm ci && npm run build`, et appelez `node <chemin>/dist/cli/index.js` à la place.
- Si `air-review.yaml` dans votre dépôt définit déjà le fournisseur et les modèles, les lignes `AIR_REVIEW_*` sont facultatives ; les variables d'environnement l'emportent sur le fichier.
- Le code de sortie `10` fait échouer le job quand la barrière trouve des constats bloquants ; la vérification se comporte donc comme le build et les tests. Ajoutez `continue-on-error: true` à l'étape pendant une période d'essai.

| Quoi faire                      | Ce que vous obtenez                      | Où le ranger                       |
| ------------------------------- | ---------------------------------------- | ---------------------------------- |
| Commiter le fichier de workflow | Une vérification sur chaque pull request | `.github/workflows/air-review.yml` |

## 4. Le cas des forks

Pour les événements `pull_request` venant d'un dépôt forké, GitHub donne au workflow un `GITHUB_TOKEN` **en lecture seule** et ne transmet **pas** les secrets du dépôt. Deux conséquences :

- `AIR_REVIEW_API_KEY` est vide, donc l'appel au modèle échoue avec le code `30` ;
- même avec une clé, la publication échouerait avec le code `40`.

Réservez la publication aux pull requests du même dépôt :

```yaml
- name: Revue
  if: github.event.pull_request.head.repo.full_name == github.repository
  # ... mêmes env et run que ci-dessus
```

Pour les forks, vous pouvez ajouter une seconde étape qui lance `air-review dry-run --deterministic-only --plain` (sans clé, sans publication, zéro appel au modèle) pour que les contributeurs aient quand même les vérifications structurelles dans le journal. N'utilisez pas `pull_request_target` pour donner les secrets aux builds de forks : le code récupéré n'est pas de confiance.

| Quoi faire                                        | Ce que vous obtenez                                               | Où le ranger           |
| ------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| Conditionner l'étape de publication au même dépôt | Aucune vérification en échec ni secret exposé sur les PR de forks | Le fichier de workflow |

Source : [Events that trigger workflows : pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## 5. Exécutions locales contre GitHub (facultatif)

Pour une exécution depuis votre machine, créez un **jeton d'accès personnel à granularité fine** (Settings → Developer settings → Personal access tokens) avec : pull requests en lecture, commentaires de pull request en écriture, issues en écriture. Exportez-le comme `GITHUB_TOKEN` ou `GH_TOKEN`.

```bash
export GITHUB_TOKEN=github_pat_...
air-review doctor
air-review inspect --ci github --owner acme --repo storefront --pr 483
air-review dry-run --ci github --owner acme --repo storefront --pr 483
air-review review  --ci github --owner acme --repo storefront --pr 483 --publish
```

Sans jeton, l'outil lit quand même les dépôts **publics** via l'API non authentifiée (60 requêtes par heure) et refuse de publier. GitHub Enterprise : définissez `platform.github.apiBaseUrl` dans la configuration.

## Variables d'environnement

| Variable                                                                                 | Valeur                                                           | Secret  | Définie par                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------- | ------------------------------ |
| `GITHUB_TOKEN`                                                                           | `github.token` dans Actions ; un PAT à granularité fine en local | **oui** | vous, dans le `env` de l'étape |
| `GH_TOKEN`                                                                               | Nom alternatif lu après `GITHUB_TOKEN`                           | **oui** | vous                           |
| `GITHUB_ACTIONS`, `GITHUB_REPOSITORY`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`          | Détection de la PR (propriétaire/dépôt, numéro)                  | non     | le runner                      |
| `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_MODEL_*`, `AIR_REVIEW_PRICING` | réglages du fournisseur                                          | non     | **variables** du dépôt         |
| `AIR_REVIEW_API_KEY`                                                                     | clé du fournisseur                                               | **oui** | **secret** du dépôt            |

## Vérifier

Ajoutez une étape temporaire avant la revue, avec le même bloc `env` :

```yaml
- run: air-review doctor --plain
```

Attendu : le test ou la liste des modèles du fournisseur réussit, « SCM: github » avec le propriétaire, le dépôt et le numéro de PR, et le jeton trouvé dans `GITHUB_TOKEN`. Ouvrez une pull request de test et lancez `air-review dry-run --plain` d'abord ; passez à `review --publish` quand la sortie vous convient.

## Erreurs fréquentes

| Symptôme                                                     | Cause                                                | Correction                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `no GitHub token` à la publication                           | `GITHUB_TOKEN` absent du `env` de l'étape            | Ajoutez `GITHUB_TOKEN` au `env` de l'étape avec l'expression `github.token` |
| `403` en postant des commentaires                            | `pull-requests: write` ou `issues: write` manquant   | Ajoutez le bloc `permissions` au job                                        |
| `403` sur une PR de fork                                     | Jeton en lecture seule sur les forks                 | Conditionnez l'étape au même dépôt (étape 4)                                |
| Code `30` avec une clé vide                                  | Les secrets ne sont pas transmis aux builds de forks | Idem                                                                        |
| `Could not resolve base ref`                                 | Clone superficiel                                    | `fetch-depth: 0` sur `actions/checkout`                                     |
| `GitHub review requires owner, repo and pull request number` | Pas un événement `pull_request` (par exemple `push`) | Déclenchez sur `pull_request`, ou passez `--owner --repo --pr`              |
| Lectures limitées                                            | API non authentifiée (60 requêtes par heure)         | Fournissez un jeton                                                         |

Plus de cas dans [Dépannage](/fr/troubleshooting).
