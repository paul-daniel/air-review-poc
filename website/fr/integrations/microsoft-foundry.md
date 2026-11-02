# Microsoft Foundry

Ce guide vous mène d'un abonnement Azure vide à une configuration `air-review` opérationnelle sur Microsoft Foundry (anciennement Azure AI Foundry), avec une clé d'API ou un jeton Microsoft Entra ID sans clé. Chaque étape dit quoi faire, ce que vous obtenez, et où le ranger.

Identifiant de preset : `azure-foundry`. Les ressources Azure OpenAI (preset `azure-openai`, `https://<resource>.openai.azure.com`) suivent les mêmes étapes ; seule la variable de clé par défaut change (`AZURE_OPENAI_API_KEY`).

::: tip Avant de commencer
Les libellés des portails changent. Chaque étape ci-dessous a été vérifiée le 2026-10-11 sur les pages Microsoft Learn liées dans l'étape. Si un libellé diffère, suivez la page liée.
:::

## 1. Créer une ressource Foundry (portail Azure)

Dans le portail Azure, ouvrez le formulaire de création d'une ressource Foundry : <https://portal.azure.com/#create/Microsoft.CognitiveServicesAIFoundry>. Renseignez **Subscription**, **Resource group**, **Region** et **Name**, puis **Review + create**. Le type de ressource est `AIServices` ; dans le portail elle apparaît sous **Foundry** → **Foundry**.

Il faut le rôle **Contributor** ou **Owner** sur l'abonnement ou le groupe de ressources pour la créer.

En ligne de commande si vous préférez :

```bash
az login
az group create --name rg-air-review --location swedencentral
az cognitiveservices account create \
  --name my-foundry-resource \
  --resource-group rg-air-review \
  --kind AIServices --sku S0 \
  --location swedencentral \
  --custom-domain my-foundry-resource \
  --assign-identity --allow-project-management true
```

| Quoi faire                                                   | Ce que vous obtenez                                                                                        | Où le ranger                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Créer la ressource (type `AIServices`) dans le portail Azure | Un nom de ressource et un groupe de ressources ; le point de terminaison apparaît sur la page **Overview** | Nulle part pour l'instant ; le nom n'est pas un secret |

Source : [Create a Foundry resource](https://learn.microsoft.com/en-us/azure/ai-services/multi-service-resource).

## 2. Créer un projet (portail Foundry, facultatif)

Ouvrez <https://ai.azure.com>, vérifiez que le bouton **New Foundry** est activé, sélectionnez le nom du projet en haut à gauche, puis **Create new project**. Un projet est créé sur une ressource Foundry ; le portail crée la ressource pour vous si vous avez sauté l'étape 1.

Un projet donne un **point de terminaison de projet** de la forme `https://<resource>.services.ai.azure.com/api/projects/<project>`. La page **Home** du projet montre ce point de terminaison et une clé d'API.

| Quoi faire                                           | Ce que vous obtenez                                     | Où le ranger                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Créer un projet (ou réutiliser le projet par défaut) | Le point de terminaison de projet, sur la page **Home** | Plus tard, dans `AIR_REVIEW_BASE_URL` (variable, pas un secret) |

Source : [Create a project](https://learn.microsoft.com/en-us/azure/foundry/how-to/create-projects).

## 3. Déployer des modèles

Dans le portail Foundry, sélectionnez **Discover** en haut à droite, puis **Models** dans le volet gauche. Choisissez un modèle, ouvrez sa fiche, puis **Deploy** → **Default settings** (ou **Custom settings** pour changer le nom et le type de déploiement). Répétez pour chaque rôle à pourvoir.

- Le **nom du déploiement** est ce que `air-review` envoie dans le champ `model`. Par défaut il vaut le nom du modèle ; vous pouvez le renommer.
- Ensuite, **Build** → **Models** liste vos déploiements. La page de détail d'un déploiement montre son point de terminaison et ses clés.
- Il faut le rôle **Cognitive Services Contributor** (ou équivalent) sur la ressource pour créer des déploiements.

Quels modèles fonctionnent :

- Tout ce qui répond à l'API OpenAI **Chat Completions** : les modèles Azure OpenAI (`gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, ...) et les Foundry Models vendus par Azure (DeepSeek, Grok, MAI, Mistral, Llama, ...).
- Les déploiements qui ne parlent que l'**API Responses**, comme `gpt-5-codex`, fonctionnent aussi : le premier appel utilise Chat Completions, le déploiement répond `400 unsupported`, et l'outil bascule sur `/openai/v1/responses` pour le reste de l'exécution. Rien à configurer. `AIR_REVIEW_API=responses` évite le test.
- Les modèles partenaires d'Azure Marketplace exigent un abonnement Marketplace avant déploiement (le portail le demande).

Un bon point de départ : un déploiement puissant pour le rôle `reviewer` (un modèle de classe codex ou `gpt-4.1`), un petit déploiement pour le rôle `verifier` (`gpt-4.1-mini`). Voir [Choisir les modèles](/fr/concepts/choosing-models).

| Quoi faire                                               | Ce que vous obtenez                                                        | Où le ranger                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Déployer un modèle par rôle depuis **Discover → Models** | Un nom de déploiement par rôle (par exemple `review-codex`, `critic-mini`) | `AIR_REVIEW_MODEL_REVIEWER`, `AIR_REVIEW_MODEL_VERIFIER` (variables, pas des secrets) |

Source : [Deploy Foundry Models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/deploy-foundry-models), [v1 API model support](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle#model-support).

## 4. Récupérer le point de terminaison

Microsoft documente trois formes de point de terminaison, et les trois fonctionnent. Collez celle que le portail vous montre ; `air-review` ajoute `/openai/v1` lui-même et n'a jamais besoin d'un paramètre `api-version`.

| Ce que montre le portail                          | Forme                                                             | Fonctionne avec                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Point de terminaison d'une ressource Azure OpenAI | `https://<resource>.openai.azure.com`                             | Clé d'API ou Entra ID                                        |
| Point de terminaison d'une ressource Foundry      | `https://<resource>.services.ai.azure.com`                        | Clé d'API ou Entra ID                                        |
| Point de terminaison d'un projet Foundry          | `https://<resource>.services.ai.azure.com/api/projects/<project>` | Entra ID (recommandé) ; clé de projet quand elle est activée |

Où le lire : portail Azure → votre ressource → **Overview** (champ **Endpoint**), ou **Resource Management** → **Keys and Endpoint**. Dans le portail Foundry, la page **Home** du projet montre le point de terminaison de projet.

| Quoi faire                                                | Ce que vous obtenez           | Où le ranger                                                                                               |
| --------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Copier le point de terminaison dans **Keys and Endpoint** | L'URL du point de terminaison | `AIR_REVIEW_BASE_URL` : shell, `.env`, variable GitHub ou groupe de variables Azure DevOps (pas un secret) |

Source : [v1 API: base URL formats](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle), [modèles de raisonnement sur le point de terminaison de projet](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-chat-reasoning).

## 5a. Identifiant, option A : clé d'API

Portail Azure → votre ressource → **Resource Management** → **Keys and Endpoint** → copiez **KEY 1** (ou KEY 2). Voir les clés demande un rôle de gestion comme **Cognitive Services Contributor** ; le rôle d'inférence seule **Cognitive Services OpenAI User** ne les voit pas.

La clé voyage dans l'en-tête `api-key` ; le preset s'en charge.

| Quoi faire                          | Ce que vous obtenez              | Où le ranger                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copier KEY 1 dans Keys and Endpoint | Une clé de 32 caractères ou plus | `AZURE_AI_API_KEY` (ou `AIR_REVIEW_API_KEY`). En local : export dans le shell ou `.env` ignoré par Git. En CI : **secret** GitHub, variable **secrète** du groupe Azure DevOps (icône cadenas) ou Key Vault |

::: danger Les clés sont des secrets
Ne collez jamais une clé dans `air-review.yaml`, un YAML de pipeline ou une discussion. Régénérez-la depuis **Keys and Endpoint** → **Regenerate** si elle fuit.
:::

Source : [Role-based access control : Keys and Endpoint](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/role-based-access-control).

## 5b. Identifiant, option B : Microsoft Entra ID (sans clé)

Microsoft recommande Entra ID. Aucune clé à faire tourner ; un jeton de courte durée (environ une heure) est émis pour une identité qui a un rôle sur la ressource.

### Attribuer le rôle

Portail Azure → votre ressource → **Access control (IAM)** → **Add** → **Add role assignment** → rôle **Cognitive Services OpenAI User** → **Members** : votre utilisateur (en local) ou le principal de service de la connexion de service de votre pipeline (en CI) → **Review + assign**. L'attribution peut prendre jusqu'à cinq minutes pour s'appliquer.

### En local

```bash
az login
export AIR_REVIEW_ACCESS_TOKEN="$(az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv)"
```

Le jeton est un JWT ; l'outil l'envoie automatiquement en `Authorization: Bearer` (`AIR_REVIEW_AUTH=bearer` est implicite). La portée est `https://ai.azure.com/.default`. Relancez l'`export` quand une commande répond `401`.

### Dans Azure Pipelines

Un `az login` interactif est impossible dans un pipeline. Utilisez une **connexion de service Azure Resource Manager** et la tâche `AzureCLI@2`, qui se connecte avec l'identité de la connexion de service. La tâche émet le jeton et le passe à l'étape de revue comme variable secrète :

```yaml
steps:
  - task: AzureCLI@2
    displayName: Obtenir un jeton Foundry
    inputs:
      azureSubscription: my-service-connection # connexion de service Azure Resource Manager
      scriptType: bash
      scriptLocation: inlineScript
      inlineScript: |
        TOKEN="$(az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv)"
        echo "##vso[task.setvariable variable=AIR_REVIEW_ACCESS_TOKEN;issecret=true]$TOKEN"

  - script: air-review review --publish
    displayName: Air Review
    env:
      AIR_REVIEW_ACCESS_TOKEN: $(AIR_REVIEW_ACCESS_TOKEN) # les variables secrètes doivent être mappées explicitement
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

Attribuez **Cognitive Services OpenAI User** à l'identité de la connexion de service (son principal de service ou son identité managée) sur la ressource Foundry. Le pipeline complet est dans [Azure DevOps](/fr/integrations/azure-devops).

| Quoi faire                                                          | Ce que vous obtenez              | Où le ranger                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Attribuer **Cognitive Services OpenAI User**, puis émettre un jeton | Un JWT valable environ une heure | `AIR_REVIEW_ACCESS_TOKEN` : variable de shell en local ; variable secrète de pipeline posée par `AzureCLI@2` en CI. Jamais dans un fichier |

Source : [Entra ID authentication](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/managed-identity), [tâche AzureCLI@2](https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/azure-cli-v2), [variables secrètes depuis un script](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/set-variables-scripts).

## 6. Variables de prix (facultatif)

Les points de terminaison Azure ne renvoient pas de prix. Pour obtenir une estimation en dollars dans la sortie et dans le résumé, donnez à `air-review` une table de prix indexée par **nom de déploiement**, en USD par million de jetons :

```bash
export AIR_REVIEW_PRICING='{"review-codex":{"input":1.25,"cachedInput":0.125,"output":10},"critic-mini":{"input":0.4,"cachedInput":0.1,"output":1.6}}'
```

La même table peut vivre dans `air-review.yaml` sous `telemetry.pricing`. Chaque déploiement appelé doit avoir un prix pour qu'un total apparaisse ; `cachedInput` est facultatif. Lisez les tarifs à jour sur la page de prix Azure de votre région ; ils changent.

| Quoi faire                                      | Ce que vous obtenez                  | Où le ranger                                                                                 |
| ----------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Écrire la table de prix par déploiement en JSON | Une ligne de coût à chaque exécution | Variable `AIR_REVIEW_PRICING` (pas un secret) ou `telemetry.pricing` dans la config commitée |

## Variables d'environnement

| Variable                          | Valeur                                                                                                 | Secret  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| `AIR_REVIEW_PROVIDER`             | `azure-foundry` (ou `azure-openai` pour une ressource Azure OpenAI)                                    | non     |
| `AIR_REVIEW_BASE_URL`             | Point de terminaison de ressource ou de projet ; `/openai/v1` est ajouté automatiquement               | non     |
| `AIR_REVIEW_MODEL_REVIEWER`       | Nom du déploiement du modèle puissant                                                                  | non     |
| `AIR_REVIEW_MODEL_VERIFIER`       | Nom du déploiement du petit modèle                                                                     | non     |
| `AIR_REVIEW_MODEL_PLANNER`        | Réservé ; le planificateur est déterministe aujourd'hui. Pointez-le sur le déploiement du vérificateur | non     |
| `AZURE_AI_API_KEY`                | Option A : la clé de Keys and Endpoint (`AZURE_OPENAI_API_KEY` pour `azure-openai`)                    | **oui** |
| `AIR_REVIEW_API_KEY`              | Option A, variante : la même clé sous le nom générique                                                 | **oui** |
| `AIR_REVIEW_ACCESS_TOKEN`         | Option B : jeton Entra ID pour la portée `https://ai.azure.com/.default`                               | **oui** |
| `AIR_REVIEW_API`                  | `auto` (défaut), `responses` ou `chat-completions`                                                     | non     |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER` | `max_completion_tokens` (défaut Azure) ou `max_tokens` pour un modèle tiers qui l'exige                | non     |
| `AIR_REVIEW_PRICING`              | Table de prix JSON indexée par nom de déploiement                                                      | non     |

Équivalent `air-review.yaml` (commité, sans secret) :

```yaml
version: 1
provider: azure-foundry
endpoint:
  baseUrl: https://my-foundry-resource.services.ai.azure.com
  apiKeyEnv: AZURE_AI_API_KEY # ignoré quand AIR_REVIEW_ACCESS_TOKEN est défini
models:
  roles:
    reviewer: review-codex
    verifier: critic-mini
    planner: critic-mini
telemetry:
  pricing:
    review-codex: { input: 1.25, cachedInput: 0.125, output: 10 }
    critic-mini: { input: 0.4, cachedInput: 0.1, output: 1.6 }
```

## Vérifier

```bash
air-review doctor
```

Attendu : le point de terminaison résolu en `…/openai/v1`, l'identifiant trouvé dans `AZURE_AI_API_KEY` ou `AIR_REVIEW_ACCESS_TOKEN`, et une ligne de test par déploiement distinct avec un temps de réponse. Azure n'a pas de liste `/models`, donc `doctor` envoie une requête de chat minimale par déploiement (quelques jetons) pour prouver la clé, l'URL et les noms de déploiement.

```bash
air-review dry-run --base origin/main
```

Attendu : une revue complète, rien de publié, un bloc « Usage & cost » avec de vrais comptes de jetons.

## Erreurs fréquentes

| Symptôme                                       | Cause                                                                        | Correction                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `401` sur chaque test                          | Mauvaise clé, jeton pour la mauvaise portée, ou jeton expiré                 | Recopiez KEY 1 ; émettez le jeton avec `--resource https://ai.azure.com` ; relancez l'`export`      |
| `403` / `PermissionDenied` avec Entra ID       | L'identité n'a pas de rôle sur la ressource, ou l'attribution est récente    | Attribuez **Cognitive Services OpenAI User** sur la ressource ; attendez jusqu'à cinq minutes       |
| `404` sur un déploiement                       | Le modèle de rôle est un identifiant de modèle, pas votre nom de déploiement | Utilisez le nom de déploiement de **Build → Models**                                                |
| `400 The requested operation is unsupported`   | Le déploiement ne parle que l'API Responses                                  | Rien : `AIR_REVIEW_API=auto` bascule tout seul ; fixez `responses` pour éviter le test              |
| `400` au sujet de `max_tokens` / `temperature` | Un modèle tiers refuse les défauts Azure                                     | `AIR_REVIEW_MAX_TOKENS_PARAMETER=max_tokens` ; fixez `endpoint.temperature` explicitement si besoin |
| Erreurs `api-version` dans de vieux exemples   | Ces exemples visent la génération précédente de l'API                        | Ignorez-les ; la route v1 n'a pas d'`api-version`                                                   |
| Pas de ligne de coût                           | Un déploiement appelé manque dans la table de prix                           | Donnez un prix à chaque déploiement utilisé par `reviewer` et `verifier`                            |

Plus de cas dans [Dépannage](/fr/troubleshooting).
