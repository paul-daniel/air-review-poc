# Amazon Bedrock

`air-review` parle à Amazon Bedrock via son API Chat Completions compatible OpenAI, authentifiée par une **clé d'API Bedrock** (un jeton bearer). La signature AWS SigV4 n'est pas implémentée : la clé est le seul identifiant que l'outil accepte.

Identifiant de preset : `bedrock`.

## 1. Activer l'accès aux modèles et choisir une Région

Bedrock est régional. La clé d'API, le point de terminaison et la disponibilité des modèles sont tous liés à une Région. Choisissez-la d'abord et utilisez la même partout.

Des points de terminaison Bedrock Runtime existent dans ces Régions (octobre 2026) : `us-east-1`, `us-east-2`, `us-west-2`, `ca-central-1`, `sa-east-1`, `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-central-1`, `eu-central-2`, `eu-north-1`, `eu-south-1`, `eu-south-2`, `ap-south-1`, `ap-south-2`, `ap-northeast-1`, `ap-northeast-2`, `ap-northeast-3`, `ap-southeast-1`, `ap-southeast-2`, plus les Régions GovCloud. Tous les modèles ne sont pas dans toutes les Régions : ouvrez la fiche du modèle dans **Models at a glance** et lisez son tableau de Régions.

| Quoi faire                                         | Ce que vous obtenez                 | Où le ranger                                         |
| -------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Choisir une Région où vos modèles sont disponibles | Un code de Région comme `eu-west-3` | Dans `AIR_REVIEW_BASE_URL` (étape 3) ; pas un secret |

Source : [Bedrock endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html), [Models at a glance](https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html).

## 2. Générer une clé d'API (console AWS)

Connectez-vous à la console AWS avec une identité IAM autorisée à utiliser la console Bedrock, ouvrez <https://console.aws.amazon.com/bedrock>, et sélectionnez **API keys** dans le volet de navigation gauche. Deux onglets :

- **Short-term API keys** → **Generate short-term API keys**. La clé dure au plus 12 heures ou jusqu'à la fin de votre session console, hérite des permissions de votre identité IAM, et c'est ce qu'AWS recommande en production.
- **Long-term API keys** → **Generate long-term API keys** → choisissez une expiration, éventuellement **Advanced permissions**, puis **Generate**. Cela crée un utilisateur IAM avec des politiques attachées. AWS qualifie les clés longue durée de « pour l'exploration seulement ».

Changez la Région de la console avant de générer : une clé ne fonctionne que dans la Région où elle a été générée (sinon l'API répond `Credential should be scoped to a valid region`).

::: warning Quelle clé pour quel usage

- **Votre poste** : une clé courte durée, régénérée quand elle expire.
- **Un pipeline** : une clé longue durée dans le magasin de secrets de la CI est le plus simple, et un compromis raisonnable si vous plafonnez son expiration (la condition `iam:ServiceSpecificCredentialAgeDays` peut imposer un maximum, par exemple 90 jours) et la faites tourner. L'alternative plus propre consiste à donner au job des identifiants AWS et à émettre une clé courte durée à l'exécution avec le paquet `aws-bedrock-token-generator` (Python, JavaScript ou Java), puis à l'exporter comme `AWS_BEARER_TOKEN_BEDROCK` pour l'étape de revue.
  :::

| Quoi faire                                       | Ce que vous obtenez                                           | Où le ranger                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Console Bedrock → **API keys** → générer une clé | Un jeton bearer (les clés longue durée commencent par `ABSK`) | `AWS_BEARER_TOKEN_BEDROCK` : shell ou `.env` ignoré par Git en local ; **secret** GitHub ou variable **secrète** Azure DevOps en CI |

Source : [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).

## 3. Choisir le point de terminaison

Bedrock expose deux hôtes compatibles OpenAI. Les deux acceptent la clé d'API en `Authorization: Bearer`.

| Hôte                                 | URL de base                                                | Remarques                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bedrock-mantle`                     | `https://bedrock-mantle.<region>.api.aws/v1`               | Point de terminaison de compatibilité : tout le catalogue via Chat Completions, et le seul avec une liste `/models`. Identifiants de modèle sans suffixe de version (`openai.gpt-oss-120b`). Quelques modèles sont servis sous `/openai/v1` au lieu de `/v1` ; le tableau **Programmatic Access** de la fiche du modèle le précise. |
| `bedrock-runtime` (défaut du preset) | `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | Recommandé par AWS pour les nouvelles applications. Pas de route `/models`. Identifiants avec suffixe de version (`openai.gpt-oss-120b-1:0`).                                                                                                                                                                                       |

Le défaut du preset est `https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1`, l'hôte recommandé par AWS. Changez la Région (ou passez à `bedrock-mantle`) avec `AIR_REVIEW_BASE_URL`.

| Quoi faire                                 | Ce que vous obtenez               | Où le ranger                                                                                 |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Construire l'URL de base pour votre Région | La racine du point de terminaison | `AIR_REVIEW_BASE_URL` (variable, pas un secret) ou `endpoint.baseUrl` dans `air-review.yaml` |

Source : [Chat Completions API on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html).

## 4. Choisir les identifiants de modèle

Les identifiants de modèle sont ceux de Bedrock, lus sur la fiche du modèle, pas les noms des éditeurs. Le preset propose `openai.gpt-oss-120b-1:0` pour le relecteur et `openai.gpt-oss-20b-1:0` pour le vérificateur (ce sont les graphies `bedrock-runtime` ; sur `bedrock-mantle`, utilisez `openai.gpt-oss-120b` et `openai.gpt-oss-20b`). Les modèles Anthropic Claude, Amazon Nova, DeepSeek, Meta Llama, Mistral et Qwen sont aussi disponibles ; lisez chaque fiche pour son identifiant exact, ses Régions et l'URL de base qu'elle documente.

Sur `bedrock-mantle`, listez ce que votre clé peut voir :

```bash
curl -s https://bedrock-mantle.eu-west-3.api.aws/v1/models -H "Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK" | head -c 2000
```

| Quoi faire                                          | Ce que vous obtenez     | Où le ranger                                                               |
| --------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| Copier les identifiants de modèle depuis les fiches | Un identifiant par rôle | `AIR_REVIEW_MODEL_REVIEWER`, `AIR_REVIEW_MODEL_VERIFIER` (pas des secrets) |

## Variables d'environnement

| Variable                          | Valeur                                                                                                     | Secret  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| `AIR_REVIEW_PROVIDER`             | `bedrock`                                                                                                  | non     |
| `AIR_REVIEW_BASE_URL`             | `https://bedrock-mantle.<region>.api.aws/v1` ou `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | non     |
| `AIR_REVIEW_MODEL_REVIEWER`       | Identifiant Bedrock du modèle puissant                                                                     | non     |
| `AIR_REVIEW_MODEL_VERIFIER`       | Identifiant Bedrock du petit modèle                                                                        | non     |
| `AWS_BEARER_TOKEN_BEDROCK`        | La clé d'API (ou `AIR_REVIEW_API_KEY` avec la même valeur)                                                 | **oui** |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER` | `max_tokens` si un modèle refuse `max_completion_tokens`                                                   | non     |
| `AIR_REVIEW_PRICING`              | Table de prix JSON indexée par identifiant de modèle, USD par million de jetons                            | non     |

Équivalent `air-review.yaml` :

```yaml
version: 1
provider: bedrock
endpoint:
  baseUrl: https://bedrock-runtime.eu-west-3.amazonaws.com/openai/v1
  apiKeyEnv: AWS_BEARER_TOKEN_BEDROCK
models:
  roles:
    reviewer: openai.gpt-oss-120b
    verifier: openai.gpt-oss-20b
    planner: openai.gpt-oss-20b
```

Extrait de pipeline (GitHub Actions ; le groupe de variables Azure DevOps fonctionne pareil) :

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: bedrock
    AIR_REVIEW_BASE_URL: ${{ vars.AIR_REVIEW_BASE_URL }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
    AWS_BEARER_TOKEN_BEDROCK: ${{ secrets.AWS_BEARER_TOKEN_BEDROCK }}
  run: air-review review --publish --plain
```

## Vérifier

```bash
air-review doctor
```

Attendu : le point de terminaison résolu dans votre Région, l'identifiant trouvé dans `AWS_BEARER_TOKEN_BEDROCK`, et un test réussi par modèle (le preset n'a pas de liste de modèles, donc `doctor` teste). Puis :

```bash
air-review dry-run --base origin/main
```

## Erreurs fréquentes

| Symptôme                                        | Cause                                                                                                                                                    | Correction                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Credential should be scoped to a valid region` | La clé a été générée dans une autre Région                                                                                                               | Régénérez la clé dans la Région du point de terminaison, ou changez la Région du point de terminaison |
| `401` / `403`                                   | Clé courte durée expirée, clé longue durée désactivée, ou permission IAM manquante (`bedrock:CallWithBearerToken`, `bedrock-mantle:CallWithBearerToken`) | Régénérez la clé ; vérifiez les politiques IAM de l'utilisateur de la clé                             |
| `model ... isn't supported on this route`       | Mauvais préfixe de chemin pour ce modèle sur `bedrock-mantle`                                                                                            | Utilisez l'URL de base du tableau **Programmatic Access** de la fiche                                 |
| `404 UnknownOperationException` sur `/models`   | `bedrock-runtime` n'a pas de liste de modèles                                                                                                            | Utilisez `bedrock-mantle` pour lister, ou ignorez (`doctor` teste à la place)                         |
| Modèle introuvable                              | Identifiant suffixé sur `bedrock-mantle` (ou l'inverse)                                                                                                  | `openai.gpt-oss-120b` sur Mantle, `openai.gpt-oss-120b-1:0` sur Runtime                               |
| Accès refusé pour un modèle                     | Accès au modèle non activé dans ce compte ou cette Région                                                                                                | Vérifiez l'accès aux modèles dans la console Bedrock pour cette Région                                |

Plus de cas dans [Dépannage](/fr/troubleshooting).
