# Choisir les modèles

Le moteur consomme des **rôles**, pas des modèles. Vous décidez quel modèle remplit chaque rôle, et la même configuration fonctionne chez tous les fournisseurs parce que tous les presets parlent le même protocole. Cette page vous aide à choisir, et explique comment le coût est rapporté.

## Les rôles

| Rôle          | Clé de configuration    | Appelé ?      | Ce dont il a besoin                                                                           |
| ------------- | ----------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| relecteur     | `models.roles.reviewer` | oui, appel 1  | un raisonnement fort sur le code ; la qualité de la revue en dépend                           |
| vérificateur  | `models.roles.verifier` | oui, appel 2  | un JSON fiable, bon pour vérifier une affirmation contre un extrait cité ; peu coûteux        |
| planificateur | `models.roles.planner`  | non (réservé) | rien aujourd'hui ; mettez-y le modèle du vérificateur pour que la configuration soit complète |
| défaut        | `models.default`        | repli         | utilisé pour tout rôle non défini                                                             |

Si `planner` n'est pas défini, il se replie sur `reviewer`, puis sur `default`. Des surcharges par rôle existent en ligne de commande : `--model` (relecteur), `--reviewer-model`, `--verifier-model`, `--planner-model`.

## Un relecteur fort, un vérificateur bon marché

Le relecteur voit tout le paquet de preuves (jusqu'à 30 000 jetons) et doit raisonner dessus ; c'est là qu'un modèle de pointe ou de classe codex se rentabilise. Le vérificateur voit un constat à la fois avec 16 lignes de code ; un petit modèle fait cela très bien, et il tourne sur chaque constat, donc son prix compte plus que son brio.

Points de départ par fournisseur (noms de déploiement sur Azure) :

| Fournisseur       | Relecteur                                 | Vérificateur                  |
| ----------------- | ----------------------------------------- | ----------------------------- |
| OpenAI            | `gpt-4.1`                                 | `gpt-4o-mini`                 |
| Microsoft Foundry | un déploiement `gpt-5-codex` ou `gpt-4.1` | un déploiement `gpt-4.1-mini` |
| Amazon Bedrock    | `openai.gpt-oss-120b`                     | `openai.gpt-oss-20b`          |
| Google            | `gemini-3.8-flash`                        | `gemini-3.8-flash`            |
| Mistral           | `mistral-large-latest`                    | `mistral-small-latest`        |

Les modèles de raisonnement (`gpt-5-codex`, série `o`, DeepSeek R1) fonctionnent et produisent souvent les meilleures revues ; ils renvoient des **jetons de raisonnement** comptés en sortie et facturés comme tels. Les presets Azure omettent déjà `temperature` et envoient `max_completion_tokens`, donc ces modèles marchent sans réglage.

Observé sur le corpus de démonstration avec un relecteur codex et un vérificateur mini sur Foundry : deux appels, 13 à 20 secondes, environ 0,02 à 0,03 $ par revue, une partie de l'entrée étant servie depuis le cache de prompt du fournisseur.

## Moins d'appels quand c'est pertinent

- `--deterministic-only` : zéro appel au modèle ; seules les règles structurelles tournent. Gratuit, instantané, utile comme repli pour les pull requests de forks.
- `--no-verifier` : un seul appel ; le vérificateur déterministe tourne toujours. Moins cher, mais les constats du modèle sont publiés sans le second contrôle.
- Head et configuration inchangés : zéro appel, le registre dit « skipped ». `--force` passe outre.

## Rapport de coût

Chaque exécution se termine par un bloc d'usage :

```text
Usage & cost
Estimated cost (USD)  ~$0.0042 · 8.3 s · 2 API calls
Input   3,100 tokens · 1,000 from provider cache
Output  1,000 tokens · 200 reasoning
Cache is included in input; reasoning is included in output.
```

L'usage par rôle (planificateur, relecteur, vérificateur) est enregistré avec les jetons, les appels, les succès de cache et la durée. Le même enregistrement est ajouté à `.air-review/telemetry.jsonl`, et `air-review telemetry` montre les exécutions récentes. Rien n'est téléversé.

Le montant en dollars apparaît quand **chaque modèle appelé a un prix**. Les prix sont en USD par million de jetons, indexés par identifiant de modèle ou nom de déploiement :

```yaml
telemetry:
  pricing:
    review-codex: { input: 1.25, cachedInput: 0.125, output: 10 }
    critic-mini: { input: 0.4, cachedInput: 0.1, output: 1.6 }
```

ou, depuis l'environnement (surcharge le fichier) :

```bash
export AIR_REVIEW_PRICING='{"review-codex":{"input":1.25,"cachedInput":0.125,"output":10},"critic-mini":{"input":0.4,"cachedInput":0.1,"output":1.6}}'
```

`cachedInput` est facultatif ; les comptes d'entrée incluent les jetons en cache, les comptes de sortie incluent les jetons de raisonnement. Les prix changent : lisez-les sur la page de tarifs de votre fournisseur et gardez la table dans la configuration commitée pour que toute l'équipe voie la même estimation.

## Mélanger les fournisseurs

Aujourd'hui, tous les rôles partagent un seul point de terminaison. Les points de terminaison par rôle (un vérificateur bon marché chez un fournisseur, un relecteur fort chez un autre) sont sur la feuille de route ; en attendant, choisissez le fournisseur dont le catalogue a à la fois un modèle fort et un modèle bon marché.

## Vérifier avant de payer

```bash
air-review models                 # ce que propose le point de terminaison, et quel rôle utilise quoi
air-review doctor                 # teste chaque déploiement sur les points de terminaison sans liste
air-review inspect                # le paquet de preuves et son estimation en jetons, sans appel au modèle
```
