# Autres fournisseurs

Tous les fournisseurs ci-dessous parlent le protocole OpenAI Chat Completions, donc l'intégration tient toujours aux mêmes trois faits : un **identifiant de preset**, une **variable de clé** et, pour une passerelle maison, une **URL de base**. Le preset remplit l'URL et les conventions d'en-têtes du fournisseur ; tout ce qu'il règle peut être surchargé dans la section `endpoint` d'`air-review.yaml`.

Pour chaque fournisseur vous trouverez d'où vient la clé, les variables, et un extrait de pipeline. Rangez la clé comme secret dans votre CI (**secret** GitHub, variable **secrète** Azure DevOps ou Key Vault) et dans un `.env` ignoré par Git en local ; jamais dans un fichier commité.

::: tip Les chemins des consoles changent
Les pages de création de clé ci-dessous ont été vérifiées le 2026-10-11. Si un libellé diffère, cherchez « API keys » dans la console du fournisseur ou suivez la documentation liée.
:::

## Résumé

| Preset              | Fournisseur      | URL de base par défaut                                    | Variable de clé      | `/models`    |
| ------------------- | ---------------- | --------------------------------------------------------- | -------------------- | ------------ |
| `openai`            | OpenAI           | `https://api.openai.com/v1`                               | `OPENAI_API_KEY`     | oui          |
| `anthropic`         | Anthropic        | `https://api.anthropic.com/v1`                            | `ANTHROPIC_API_KEY`  | non          |
| `google`            | Google Gemini    | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY`     | oui          |
| `mistral`           | Mistral          | `https://api.mistral.ai/v1`                               | `MISTRAL_API_KEY`    | oui          |
| `groq`              | Groq             | `https://api.groq.com/openai/v1`                          | `GROQ_API_KEY`       | oui          |
| `openrouter`        | OpenRouter       | `https://openrouter.ai/api/v1`                            | `OPENROUTER_API_KEY` | oui          |
| `together`          | Together AI      | `https://api.together.ai/v1`                              | `TOGETHER_API_KEY`   | oui          |
| `fireworks`         | Fireworks AI     | `https://api.fireworks.ai/inference/v1`                   | `FIREWORKS_API_KEY`  | oui          |
| `openai-compatible` | Votre passerelle | obligatoire (`AIR_REVIEW_BASE_URL`)                       | `AIR_REVIEW_API_KEY` | configurable |

`AIR_REVIEW_API_KEY` fonctionne toujours comme alternative générique à la variable de clé du preset, ce qui est pratique quand un seul nom de secret CI doit servir à tous les fournisseurs.

## OpenAI

- **Clé** : plateforme OpenAI → votre profil ou les réglages de l'organisation → **API keys** → créer une clé. La clé n'est affichée qu'une fois.
- **Modèles** : `gpt-4.1` en relecteur, `gpt-4o-mini` en vérificateur est la suggestion du preset.

```bash
export AIR_REVIEW_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export AIR_REVIEW_MODEL_REVIEWER=gpt-4.1
export AIR_REVIEW_MODEL_VERIFIER=gpt-4o-mini
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: openai
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: gpt-4.1
    AIR_REVIEW_MODEL_VERIFIER: gpt-4o-mini
  run: air-review review --publish --plain
```

Documentation : [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat).

## Anthropic

- **Clé** : Claude Console → **Settings** → **API keys** (<https://platform.claude.com/settings/keys>).
- **Point de terminaison** : la couche de compatibilité OpenAI d'Anthropic à `https://api.anthropic.com/v1`. Anthropic la présente comme un moyen de tester et comparer des modèles plutôt qu'une voie de production à long terme ; l'API native de Claude n'est pas utilisée par `air-review`.
- **Limite connue** : la couche de compatibilité ignore `response_format`. `air-review` demande du JSON dans le prompt et analyse les réponses enveloppées de prose ou de blocs de code, donc les revues fonctionnent, mais attendez-vous à une nouvelle tentative d'analyse de temps en temps. Les identifiants de modèle sont les noms des modèles Claude, par exemple `claude-sonnet-4-6`.

```bash
export AIR_REVIEW_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export AIR_REVIEW_MODEL_REVIEWER=claude-sonnet-4-6
export AIR_REVIEW_MODEL_VERIFIER=claude-haiku-4-5
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: anthropic
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
  run: air-review review --publish --plain
```

Documentation : [OpenAI SDK compatibility](https://platform.claude.com/docs/en/api/openai-sdk).

## Google Gemini

- **Clé** : Google AI Studio → **Get API key** (<https://aistudio.google.com/>). Il s'agit de l'API Gemini pour développeurs, pas de Vertex AI.
- **Point de terminaison** : `https://generativelanguage.googleapis.com/v1beta/openai`.

```bash
export AIR_REVIEW_PROVIDER=google
export GEMINI_API_KEY=AIza...
export AIR_REVIEW_MODEL_REVIEWER=gemini-3.8-flash
export AIR_REVIEW_MODEL_VERIFIER=gemini-3.8-flash
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: google
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
  run: air-review review --publish --plain
```

Documentation : [OpenAI compatibility for the Gemini API](https://ai.google.dev/gemini-api/docs/openai).

## Mistral

- **Clé** : Mistral Studio (<https://console.mistral.ai/>) → **API keys** ; vérifiez dans la console, le libellé exact peut différer.
- **Modèles** : `mistral-large-latest` en relecteur, `mistral-small-latest` en vérificateur est la suggestion du preset.

```bash
export AIR_REVIEW_PROVIDER=mistral
export MISTRAL_API_KEY=...
export AIR_REVIEW_MODEL_REVIEWER=mistral-large-latest
export AIR_REVIEW_MODEL_VERIFIER=mistral-small-latest
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: mistral
    MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: mistral-large-latest
    AIR_REVIEW_MODEL_VERIFIER: mistral-small-latest
  run: air-review review --publish --plain
```

Documentation : [Mistral API reference](https://docs.mistral.ai/api/).

## Groq

- **Clé** : Groq Console → **API Keys** (<https://console.groq.com/keys>).
- **Point de terminaison** : `https://api.groq.com/openai/v1`. Les identifiants de modèle sont ceux listés dans la console.

```bash
export AIR_REVIEW_PROVIDER=groq
export GROQ_API_KEY=gsk_...
export AIR_REVIEW_MODEL_REVIEWER=<identifiant de modèle depuis la console>
air-review models   # liste ce que la clé peut utiliser
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: groq
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
  run: air-review review --publish --plain
```

Documentation : [Groq OpenAI compatibility](https://console.groq.com/docs/openai).

## OpenRouter

- **Clé** : OpenRouter → votre compte → **Keys** ; vérifiez sur le site, le libellé exact peut différer.
- **Modèles** : les identifiants sont des slugs `editeur/modele` (par exemple `openai/gpt-4.1`). `air-review models` les liste.

```bash
export AIR_REVIEW_PROVIDER=openrouter
export OPENROUTER_API_KEY=sk-or-...
export AIR_REVIEW_MODEL_REVIEWER=openai/gpt-4.1
export AIR_REVIEW_MODEL_VERIFIER=openai/gpt-4o-mini
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: openrouter
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
  run: air-review review --publish --plain
```

Documentation : [OpenRouter quickstart](https://openrouter.ai/docs/quickstart).

## Together AI

- **Clé** : réglages Together → **API keys** (<https://api.together.ai/settings/projects/~current/api-keys>).
- **Point de terminaison** : le défaut du preset est `https://api.together.ai/v1`. La documentation actuelle de Together indique `https://api.together.ai/v1` ; si le défaut répond par une erreur DNS ou de certificat, définissez `AIR_REVIEW_BASE_URL=https://api.together.ai/v1`.

```bash
export AIR_REVIEW_PROVIDER=together
export TOGETHER_API_KEY=...
export AIR_REVIEW_MODEL_REVIEWER=<identifiant de modèle depuis la console>
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: together
    TOGETHER_API_KEY: ${{ secrets.TOGETHER_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
  run: air-review review --publish --plain
```

Documentation : [Together OpenAI API compatibility](https://docs.together.ai/docs/openai-api-compatibility).

## Fireworks AI

- **Clé** : console Fireworks → réglages du compte → **API keys** ; vérifiez dans la console, le libellé exact peut différer.
- **Point de terminaison** : `https://api.fireworks.ai/inference/v1`. Les identifiants de modèle ressemblent à `accounts/fireworks/models/<nom>`.

```bash
export AIR_REVIEW_PROVIDER=fireworks
export FIREWORKS_API_KEY=fw_...
export AIR_REVIEW_MODEL_REVIEWER=<identifiant de modèle depuis la console>
```

```yaml
- name: Revue
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: fireworks
    FIREWORKS_API_KEY: ${{ secrets.FIREWORKS_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
  run: air-review review --publish --plain
```

Documentation : [Fireworks OpenAI compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility).

## Passerelle maison (`openai-compatible`)

Pour une passerelle interne (LiteLLM, une façade d'API management, un proxy d'éditeur) qui expose `/chat/completions` :

```bash
export AIR_REVIEW_PROVIDER=openai-compatible
export AIR_REVIEW_BASE_URL=https://llm-gateway.example.internal/v1
export AIR_REVIEW_API_KEY=...
export AIR_REVIEW_MODEL_REVIEWER=<nom routé par la passerelle>
```

Tout le format d'échange est réglable dans `air-review.yaml` :

```yaml
provider: openai-compatible
endpoint:
  baseUrl: https://llm-gateway.example.internal/v1
  apiKeyEnv: AIR_REVIEW_API_KEY
  apiKeyHeader: authorization # ou "x-api-key", "api-key"
  apiKeyPrefix: "Bearer " # "" pour une clé nue
  chatPath: /chat/completions
  modelsPath: /models
  listModels: true # false quand la passerelle n'a pas de route /models
  timeoutMs: 120000
  headers:
    X-Org: platform-team # en-têtes statiques supplémentaires (routage, centre de coût)
```

Passerelles OAuth : mettez le jeton de courte durée dans `AIR_REVIEW_ACCESS_TOKEN` (envoyé en `Authorization: Bearer`) plutôt qu'une clé.

## Vérifier

```bash
air-review doctor      # clé trouvée ? point de terminaison joignable ? modèles résolus ?
air-review models      # ce que propose le point de terminaison, et quel rôle utilise quoi
air-review dry-run --base origin/main
```

## Erreurs fréquentes

| Symptôme                                 | Cause                                                               | Correction                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `401`                                    | Clé absente ou fausse, ou mauvais nom de variable                   | `doctor` indique quelle variable a été lue ; définissez celle-là                              |
| `404` sur chat completions               | Identifiant de modèle inconnu de ce point de terminaison            | `air-review models` ; copiez un identifiant exact                                             |
| `429`                                    | Limite de débit du fournisseur                                      | Vérificateur plus petit, réessayer plus tard, ou augmenter `endpoint.timeoutMs`               |
| Erreur d'analyse de la réponse du modèle | Fournisseur sans mode JSON (couche de compatibilité Anthropic)      | Généralement rattrapé automatiquement ; choisissez un modèle qui suit bien les consignes JSON |
| `ENOTFOUND` / erreur de certificat       | Mauvaise URL de base (par exemple le changement d'hôte de Together) | Définissez `AIR_REVIEW_BASE_URL` à l'URL de la documentation du fournisseur                   |

Plus de cas dans [Dépannage](/fr/troubleshooting).
