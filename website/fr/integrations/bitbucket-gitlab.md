# Bitbucket Pipelines et GitLab CI

`air-review` n'a pas encore d'adaptateur Bitbucket ni GitLab : il ne peut pas lire une pull request Bitbucket ou une merge request GitLab via leurs API, ni y poster des commentaires. Il peut tout de même relire le changement en **mode local** dans le job, faire échouer le job sur des constats bloquants, et conserver le résumé comme artefact. Cette page montre comment.

## Ce que donne `--ci local`

- Le diff est calculé localement depuis la base de fusion entre la branche cible et le commit du job, comme une pull request.
- Les constats sont affichés dans le journal du job et écrits dans `.air-review/summary.md`.
- Le code de sortie `10` fait échouer le job quand la barrière trouve des constats bloquants.
- Le registre (`.air-review/state.json`) est local à l'espace de travail du job, donc chaque exécution est une revue complète sauf si vous mettez le dossier en cache entre les exécutions.

## Bitbucket Pipelines

### 1. Ranger les réglages du fournisseur

**Repository settings** → **Pipelines** → **Repository variables** → **Add variable**. Cochez **Secured** pour la clé. Les variables sécurisées sont masquées dans les journaux et ne peuvent pas être relues.

| Type      | Nom                         | Exemple                 |
| --------- | --------------------------- | ----------------------- |
| ordinaire | `AIR_REVIEW_PROVIDER`       | `azure-foundry`         |
| ordinaire | `AIR_REVIEW_BASE_URL`       | le point de terminaison |
| ordinaire | `AIR_REVIEW_MODEL_REVIEWER` | nom de déploiement      |
| ordinaire | `AIR_REVIEW_MODEL_VERIFIER` | nom de déploiement      |
| sécurisée | `AIR_REVIEW_API_KEY`        | la clé                  |

| Quoi faire                                            | Ce que vous obtenez                    | Où le ranger                                             |
| ----------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Ajouter les variables de dépôt, la clé en **Secured** | Des variables exportées à chaque étape | Variables du dépôt (ou de l'espace de travail) Bitbucket |

Source : [Variables and secrets](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/).

### 2. Écrire le pipeline

Bitbucket clone les 50 derniers commits par défaut ; une base de fusion a besoin de l'historique complet (`clone: depth: full`). Dans un pipeline de pull request, `BITBUCKET_PR_DESTINATION_BRANCH` contient la branche cible et `BITBUCKET_PR_ID` l'identifiant de la pull request.

```yaml
# bitbucket-pipelines.yml
image: node:22

clone:
  depth: full # le diff est calculé depuis la base de fusion

pipelines:
  pull-requests:
    "**":
      - step:
          name: Air Review
          script:
            - npm install -g air-review
            - git fetch origin "$BITBUCKET_PR_DESTINATION_BRANCH"
            - air-review doctor --plain
            - air-review review --ci local --base "origin/$BITBUCKET_PR_DESTINATION_BRANCH" --plain
          artifacts:
            - .air-review/summary.md
            - .air-review/telemetry.jsonl
```

La section `pull-requests` ne tourne que pour les pull requests, donc la variable de destination est toujours définie. `--publish` est inutile ici (le mode local écrit seulement dans `.air-review/`).

| Quoi faire                         | Ce que vous obtenez                                      | Où le ranger |
| ---------------------------------- | -------------------------------------------------------- | ------------ |
| Commiter `bitbucket-pipelines.yml` | Une étape de revue qui échoue sur les constats bloquants | Le dépôt     |

Source : [Git clone behavior](https://support.atlassian.com/bitbucket-cloud/docs/git-clone-behavior/).

## GitLab CI

### 1. Ranger les réglages du fournisseur

Projet → **Settings** → **CI/CD** → **Variables** → **Add variable**. Pour la clé, cochez **Mask variable** (et **Protect variable** si seules les branches protégées doivent la voir). Vérifiez dans les réglages du projet ; les libellés exacts peuvent varier selon la version de GitLab.

| Quoi faire                                  | Ce que vous obtenez              | Où le ranger                              |
| ------------------------------------------- | -------------------------------- | ----------------------------------------- |
| Ajouter les variables CI/CD, la clé masquée | Des variables exportées aux jobs | Variables du projet (ou du groupe) GitLab |

### 2. Écrire le job

Ne lancez le job que dans les pipelines de merge request, où `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` est défini. `GIT_DEPTH: 0` désactive le clone superficiel (les nouveaux projets ont une profondeur par défaut de 20).

```yaml
# .gitlab-ci.yml
air-review:
  image: node:22
  stage: test
  variables:
    GIT_DEPTH: 0 # historique complet : le diff est calculé depuis la base de fusion
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm install -g air-review
    - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - air-review doctor --plain
    - air-review review --ci local --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --plain
  artifacts:
    when: always
    paths:
      - .air-review/summary.md
      - .air-review/telemetry.jsonl
```

| Quoi faire                            | Ce que vous obtenez                                           | Où le ranger |
| ------------------------------------- | ------------------------------------------------------------- | ------------ |
| Commiter le job dans `.gitlab-ci.yml` | Un job de merge request qui échoue sur les constats bloquants | Le dépôt     |

Source : [Predefined variables](https://docs.gitlab.com/ci/variables/predefined_variables/), [réglage du clone superficiel](https://docs.gitlab.com/ci/pipelines/settings/).

## Installer l'outil dans le job

Les deux extraits utilisent `npm install -g air-review`, ce qui suppose que le paquet est publié sur un registre accessible au job. Sinon, clonez le dépôt `air-review` dans le job, lancez `npm ci && npm run build`, et appelez `node <chemin>/dist/cli/index.js` à la place de `air-review`.

## Variables d'environnement

| Variable                                                           | Valeur                    | Secret  | Définie par                   |
| ------------------------------------------------------------------ | ------------------------- | ------- | ----------------------------- |
| `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_MODEL_*` | réglages du fournisseur   | non     | variables CI                  |
| `AIR_REVIEW_API_KEY` (ou la variable de clé du preset)             | clé du fournisseur        | **oui** | variable CI sécurisée/masquée |
| `BITBUCKET_PR_DESTINATION_BRANCH`, `BITBUCKET_PR_ID`               | branche cible et id de PR | non     | Bitbucket                     |
| `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `CI_MERGE_REQUEST_IID`      | branche cible et id de MR | non     | GitLab                        |

Aucun jeton SCM n'est nécessaire : le mode local n'appelle jamais l'API de Bitbucket ni de GitLab.

## Vérifier

`air-review doctor --plain` dans le job doit montrer le test ou la liste de modèles du fournisseur qui réussit et « SCM: local ». Ouvrez ensuite une pull request ou une merge request de test et lisez le journal du job et l'artefact `summary.md`.

## Erreurs fréquentes

| Symptôme                      | Cause                                    | Correction                                                                   |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `Could not resolve base ref`  | Branche cible non récupérée              | Gardez la ligne `git fetch origin "$CIBLE"`                                  |
| Erreur de base de fusion      | Clone superficiel                        | `clone: depth: full` (Bitbucket) ou `GIT_DEPTH: 0` (GitLab)                  |
| La revue tourne à chaque push | Job non restreint aux pipelines de PR/MR | Section `pull-requests:` (Bitbucket) ou règle `merge_request_event` (GitLab) |
| Rien n'est publié             | Attendu : pas d'adaptateur               | Lisez le journal du job ou l'artefact `summary.md`                           |

## Ce que dit la feuille de route

Un adaptateur Bitbucket est prévu, « de la même forme que celui d'Azure » (l'adaptateur Azure DevOps sert de modèle : une implémentation de `ScmAdapter` qui lit la pull request, calcule le diff avec le `git` local, et garde le registre dans les commentaires de la pull request). Il vient après le banc de qualité, l'explorateur de contexte borné et les packs de frameworks supplémentaires. Un adaptateur GitLab n'est pas encore planifié ; la même interface est l'endroit où il irait. En attendant, le mode local dans le job est la voie prise en charge.
