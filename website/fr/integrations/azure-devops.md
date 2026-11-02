# Azure DevOps (Azure Repos + Azure Pipelines)

`air-review` relit les pull requests Azure Repos depuis une exécution de validation de build Azure Pipelines et publie ses constats sous forme de fils de discussion dans la pull request. Rien n'est stocké en dehors d'Azure DevOps : la mémoire de la revue vit dans la pull request elle-même.

Ce guide suppose qu'un fournisseur de modèles est déjà configuré ([Microsoft Foundry](/fr/integrations/microsoft-foundry), [Amazon Bedrock](/fr/integrations/amazon-bedrock) ou [un autre fournisseur](/fr/integrations/other-providers)).

## 1. Décider comment l'outil s'installe dans le job

Le pipeline a besoin de la commande `air-review` sur l'agent. Deux options :

- **Depuis npm** : `npm install -g air-review`, si le paquet est publié sur npmjs.com ou sur votre registre privé (Azure Artifacts). C'est ce que fait le YAML ci-dessous.
- **Depuis le dépôt** : clonez le dépôt `air-review` dans une seconde étape `checkout`, lancez `npm ci && npm run build`, et appelez `node <chemin>/dist/cli/index.js` à la place de `air-review`.

| Quoi faire                                     | Ce que vous obtenez                              | Où le ranger                                   |
| ---------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| Choisir une méthode d'installation sur l'agent | Une commande `air-review` qui marche dans le job | L'étape d'installation d'`azure-pipelines.yml` |

## 2. Créer le groupe de variables

Pipelines → **Library** → **+ Variable group**. Nommez-le `air-review`. Sous **Variables**, **+ Add** pour chaque nom ci-dessous. Cliquez l'**icône cadenas** à côté d'`AIR_REVIEW_API_KEY` pour en faire un secret. **Save**.

| Type       | Nom                         | Exemple                                                              |
| ---------- | --------------------------- | -------------------------------------------------------------------- |
| Variable   | `AIR_REVIEW_PROVIDER`       | `azure-foundry`                                                      |
| Variable   | `AIR_REVIEW_BASE_URL`       | `https://my-foundry-resource.services.ai.azure.com`                  |
| Variable   | `AIR_REVIEW_MODEL_REVIEWER` | `review-codex`                                                       |
| Variable   | `AIR_REVIEW_MODEL_VERIFIER` | `critic-mini`                                                        |
| Variable   | `AIR_REVIEW_MODEL_PLANNER`  | `critic-mini`                                                        |
| Variable   | `AIR_REVIEW_PRICING`        | `{"review-codex":{"input":1.25,"output":10}, ...}`                   |
| **Secret** | `AIR_REVIEW_API_KEY`        | la clé du fournisseur (inutile si vous utilisez des jetons Entra ID) |

Autorisez ensuite le pipeline : ouvrez le groupe → **Pipeline permissions** → **+** → sélectionnez votre pipeline. Sans cela, la première exécution s'arrête sur une erreur d'autorisation de ressource.

::: tip Key Vault plutôt qu'un secret en clair
Pour garder la clé dans Azure Key Vault, créez le groupe de variables avec le bouton **Link secrets from an Azure key vault as variables** activé, sélectionnez votre connexion de service et votre coffre, **Authorize**, puis **+ Add** le secret nommé `AIR_REVIEW_API_KEY`. La connexion de service a besoin des permissions **Get** et **List** sur les secrets du coffre. Voir [Link a variable group to Key Vault](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/link-variable-groups-to-key-vaults).
:::

::: warning Les variables secrètes ne sont pas exportées automatiquement
Azure Pipelines expose les variables ordinaires aux scripts comme variables d'environnement, mais les variables **secrètes** doivent être mappées explicitement sur l'étape : `env: AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)`. Le YAML ci-dessous le fait.
:::

| Quoi faire                                | Ce que vous obtenez                                       | Où le ranger                                                                              |
| ----------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Créer le groupe de variables `air-review` | Les réglages du fournisseur disponibles à chaque pipeline | Groupe de variables de la Library ; la clé en variable **secrète** ou en secret Key Vault |

Source : [Manage variable groups](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups).

## 3. Accorder la permission Contribute to pull requests au service de build

Les fils sont publiés avec l'identité du job, le service de build. Il doit être autorisé à commenter les pull requests.

1. **Project settings** → **Repositories** → sélectionnez votre dépôt → **Security**.
2. Dans la zone de recherche, tapez `Build Service` et sélectionnez **`<Project> Build Service (<Organization>)`**. Si votre organisation ne limite pas la portée d'autorisation des jobs, l'identité est **`Project Collection Build Service (<Organization>)`**.
3. Passez **Contribute to pull requests** à **Allow**. Les changements s'enregistrent automatiquement.

L'identité de service de build à l'échelle du projet n'existe qu'après une première exécution du pipeline. Si vous ne la trouvez pas, lancez le pipeline une fois (il échouera en `403` à la publication), puis revenez.

| Quoi faire                                                         | Ce que vous obtenez                                        | Où le ranger                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------- |
| Autoriser **Contribute to pull requests** pour le service de build | Le jeton du job peut créer et mettre à jour les fils de PR | Sécurité du dépôt ; rien à copier |

Source : [Set Git repository permissions](https://learn.microsoft.com/en-us/azure/devops/repos/git/set-git-repository-permissions), [Job access tokens](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/access-tokens).

## 4. Écrire le pipeline

`System.AccessToken` est le jeton du job. Il n'est pas exporté aux scripts par défaut ; mappez-le sur l'étape de revue sous le nom `SYSTEM_ACCESSTOKEN`. L'adaptateur lit cette variable, puis `AZURE_DEVOPS_ACCESS_TOKEN`, `AZURE_DEVOPS_EXT_PAT`, `AZURE_DEVOPS_TOKEN`.

```yaml
# azure-pipelines.yml
trigger: none # lancé par la politique de branche (validation de build), pas au push
pr:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest

variables:
  - group: air-review # variables AIR_REVIEW_* ; AIR_REVIEW_API_KEY marquée secrète

steps:
  - checkout: self
    fetchDepth: 0 # historique complet : le diff est calculé localement depuis la base de fusion
    persistCredentials: true

  - task: NodeTool@0
    inputs:
      versionSpec: "22.x"

  - script: npm install -g air-review
    displayName: Installer air-review

  - script: air-review review --publish --plain
    displayName: Air Review
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken) # le jeton du job n'est pas exporté par défaut
      AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY) # les variables secrètes doivent être mappées explicitement

  - publish: .air-review/telemetry.jsonl
    artifact: air-review-telemetry
    condition: always()
    displayName: Conserver le journal de télémétrie
```

Variante sans clé avec Microsoft Entra ID (Foundry) : remplacez la ligne `AIR_REVIEW_API_KEY` par la tâche `AzureCLI@2` de [Microsoft Foundry, étape 5b](/fr/integrations/microsoft-foundry#_5b-identifiant-option-b-microsoft-entra-id-sans-cle), qui pose `AIR_REVIEW_ACCESS_TOKEN` comme variable secrète pour l'étape de revue.

Pourquoi ces réglages :

- `fetchDepth: 0` : l'adaptateur lit la PR via l'API REST mais calcule le diff avec le `git` local de l'agent (base de fusion entre cible et source, puis `git diff`). Un clone superficiel ne peut pas calculer de base de fusion ; l'outil s'arrête alors avec un message qui renvoie ici.
- `--plain` : journaux ASCII sans couleurs ni animation. `AIR_REVIEW_PLAIN=1` fait pareil.
- `trigger: none` + `pr:` : l'exécution est déclenchée par la politique de branche, donc `SYSTEM_PULLREQUEST_PULLREQUESTID` est défini et l'adaptateur est détecté automatiquement. Sur un build qui n'est pas une pull request (un build CI de `main`), l'outil avertit et relit localement contre `platform.local.base` au lieu d'échouer.

| Quoi faire                                                                 | Ce que vous obtenez                     | Où le ranger                   |
| -------------------------------------------------------------------------- | --------------------------------------- | ------------------------------ |
| Commiter `azure-pipelines.yml` et créer le pipeline à partir de ce fichier | Un pipeline qui relit les pull requests | Le dépôt (aucun secret dedans) |

Source : [System.AccessToken](https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables).

## 5. Attacher le pipeline comme politique de validation de build

**Project settings** → **Repositories** → votre dépôt → **Policies** → **Branch Policies** → `main` → **Build validation** → **+**. Dans **Set build policy** : choisissez le **Build pipeline**, **Trigger** : Automatic, **Policy requirement** : Required, une **Build expiration**, et éventuellement un **Display name**. **Save**.

Le code de sortie `10` (constats bloquants) fait échouer la validation ; la revue se comporte donc comme le build et les tests. Les codes `30` et `40` font échouer le build comme erreurs d'infrastructure. Mettez **Policy requirement** à Optional pendant une période d'essai si vous ne voulez pas encore bloquer les fusions.

| Quoi faire                                                  | Ce que vous obtenez                                                      | Où le ranger                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| Ajouter une politique Build validation sur la branche cible | Chaque PR vers `main` passe par la revue avant de pouvoir être complétée | Politique de branche ; rien à copier |

Source : [Branch policies : build validation](https://learn.microsoft.com/en-us/azure/devops/repos/git/branch-policies#set-build-validation).

## 6. Exécutions manuelles avec un PAT

Pour lancer la revue d'une pull request depuis votre machine, créez un jeton d'accès personnel : menu utilisateur → **Personal access tokens** → **+ New Token** → portée **Code : Read & write**. Puis, depuis un clone complet du dépôt qui possède la PR :

```bash
export AZURE_DEVOPS_EXT_PAT=<pat>          # ou SYSTEM_ACCESSTOKEN
git fetch origin main
air-review doctor  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review dry-run --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review review  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --publish
```

Variante sans clé depuis une Azure CLI connectée (jeton valable environ une heure ; `499b84ac-1321-427f-aa17-267ca6975798` est l'identifiant de ressource d'Azure DevOps) :

```bash
export AZURE_DEVOPS_ACCESS_TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
```

`--repo` accepte le nom du dépôt ou son GUID. Pour Azure DevOps Server, `--org` est l'URL de la collection (`https://tfs.example.com/tfs/DefaultCollection`). Les jetons de forme JWT sont envoyés en `Bearer`, les PAT en `Basic`.

| Quoi faire                          | Ce que vous obtenez | Où le ranger                                                                                         |
| ----------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| Créer un PAT avec Code Read & write | Un jeton opaque     | `AZURE_DEVOPS_EXT_PAT` dans votre shell ou un `.env` ignoré par Git ; jamais dans un fichier commité |

::: danger
Un PAT agit en votre nom. Donnez-lui la durée de vie la plus courte possible et révoquez-le à la fin de l'essai. Préférez la forme sans clé `az account get-access-token`.
:::

## 7. Les fils comme mémoire

| Fil            | Contenu                                                                                      | Statut                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| état           | l'enveloppe `air-review:state` lisible par la machine (SHA, constats, empreintes, métriques) | `closed`, donc replié                                                                    |
| résumé         | le tableau récapitulatif `Air Review`                                                        | `active` tant que la barrière échoue, `closed` une fois passée                           |
| un par constat | le constat, ancré côté head du fichier                                                       | `active` ; passé à `fixed` avec une courte réponse quand le constat ne se reproduit plus |

Chaque commentaire porte un marqueur caché `air-review:`, de sorte que l'exécution suivante retrouve et met à jour ses propres fils au lieu d'en poster des doublons. Les constats gardent leur fil quand le code bouge, car leur identité est `règle + fichier + symbole`, pas le numéro de ligne. Une garde relit la PR avant d'écrire : si un push plus récent est arrivé entre-temps, rien n'est publié. Le fil d'état ne contient que des faits, jamais le raisonnement du modèle. Voir [Mémoire et confidentialité](/fr/concepts/memory-and-privacy).

## Variables d'environnement

| Variable                                                                                 | Valeur                                                               | Secret  | Définie par                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- | --------------------------------------------- |
| `SYSTEM_ACCESSTOKEN`                                                                     | `$(System.AccessToken)`, mappé sur l'étape de revue                  | **oui** | vous, dans le `env` de l'étape                |
| `AZURE_DEVOPS_ACCESS_TOKEN`                                                              | jeton Entra ID pour les exécutions manuelles (`Bearer`)              | **oui** | vous, en local                                |
| `AZURE_DEVOPS_EXT_PAT` / `AZURE_DEVOPS_TOKEN`                                            | PAT pour les exécutions manuelles (`Basic`)                          | **oui** | vous, en local                                |
| `TF_BUILD`                                                                               | `True` sur tout job Azure Pipelines ; déclenche la détection         | non     | l'agent                                       |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`                                                       | id de la PR ; présent seulement dans les validations de build        | non     | l'agent                                       |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`                                                     | URL de l'organisation                                                | non     | l'agent                                       |
| `SYSTEM_TEAMPROJECT`                                                                     | projet                                                               | non     | l'agent                                       |
| `BUILD_REPOSITORY_ID` / `BUILD_REPOSITORY_NAME`                                          | GUID ou nom du dépôt                                                 | non     | l'agent                                       |
| `BUILD_REPOSITORY_PROVIDER`                                                              | `TfsGit` pour Azure Repos ; toute autre valeur bascule en mode local | non     | l'agent                                       |
| `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_MODEL_*`, `AIR_REVIEW_PRICING` | réglages du fournisseur                                              | non     | groupe de variables                           |
| `AIR_REVIEW_API_KEY` ou `AIR_REVIEW_ACCESS_TOKEN`                                        | identifiant du fournisseur                                           | **oui** | secret du groupe de variables ou `AzureCLI@2` |

Épinglage facultatif dans `air-review.yaml` (tout est détecté dans le pipeline ; utile seulement pour raccourcir les exécutions manuelles) :

```yaml
platform:
  provider: azure-devops
  publish: true # publier sans --publish
  azureDevops:
    organizationUrl: https://dev.azure.com/acme
    project: Shop
    repository: storefront
    tokenEnv: SYSTEM_ACCESSTOKEN
    apiVersion: "7.1"
```

## Vérifier

Dans le pipeline, ajoutez une étape temporaire avant la revue :

```yaml
- script: air-review doctor --plain
  env:
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
    AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)
```

Attendu : le test du fournisseur réussit, « SCM: azure-devops » avec l'organisation, le projet, le dépôt et l'id de PR, et « token found in SYSTEM_ACCESSTOKEN ». Lancez ensuite le pipeline sur une pull request de test avec `air-review dry-run --plain` d'abord ; passez à `review --publish` quand la sortie vous convient.

## Erreurs fréquentes

| Symptôme                                                | Cause                                                                   | Correction                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `403` à chaque écriture de fil                          | Le service de build n'a pas **Contribute to pull requests**             | Étape 3 ; vérifiez quelle identité (projet ou collection) le job utilise                           |
| `401` d'Azure DevOps                                    | `SYSTEM_ACCESSTOKEN` non mappé sur l'étape                              | Ajoutez `env: SYSTEM_ACCESSTOKEN: $(System.AccessToken)`                                           |
| `Could not resolve base ref` / erreur de base de fusion | Clone superficiel                                                       | `fetchDepth: 0` sur `checkout: self`                                                               |
| La revue tourne « localement » et ne publie rien        | Pas une validation de PR, ou fournisseur de dépôt différent de `TfsGit` | Attachez le pipeline comme politique de validation de build ; vérifiez `BUILD_REPOSITORY_PROVIDER` |
| `Azure DevOps review is missing: --org ...`             | Exécution manuelle sans les localisateurs                               | Passez `--org --project --repo --pr`                                                               |
| `401` du fournisseur alors que la partie SCM marche     | `AIR_REVIEW_API_KEY` est secrète et n'a pas été mappée sur l'étape      | Ajoutez `env: AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)`                                           |
| « resource not authorized » à la mise en file           | Le pipeline n'est pas autorisé à utiliser le groupe de variables        | Library → le groupe → **Pipeline permissions** → ajoutez le pipeline                               |

Plus de cas dans [Dépannage](/fr/troubleshooting). Les points de terminaison REST utilisés par l'adaptateur (api-version 7.1) sont listés dans le fichier `docs/azure-devops.md` du dépôt.
