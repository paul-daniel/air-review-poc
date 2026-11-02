# Premier test local — Microsoft Foundry « new »

Air Review est une CLI qui lit un dépôt Git et appelle des API de modèles. Le
mode local conserve la mémoire dans `.air-review/`, sans PR ni base externe.
Le document de recherche sert de référence d’architecture : ses propositions
ne sont pas toutes des fonctionnalités déjà implémentées.

## 1. Essai gratuit, prêt à lancer

Depuis le dépôt AirReview2 :

```bash
npm run demo
cd test/fixtures/work/airreview-demo
node ../../../../dist/cli/index.js review --ci local --base main --deterministic-only
```

Le dépôt généré possède une branche `main` et quatre étapes commitées. Il reste
sur `demo-01-bugs`. La génération refuse d’écraser un dossier existant ; pour un
autre exemplaire : `node scripts/demo.mjs /tmp/mon-autre-demo` depuis AirReview2.
Le corpus contient des sources Angular pour analyse statique, pas une application
web à démarrer. Aucune installation Angular n’est nécessaire pour le revoir.

Attendu : une subscription sans nettoyage dans `widget.component.ts`. La
subscription correcte de `safe.component.ts` et la dette préexistante de
`legacy.component.ts` ne doivent pas être signalées. Le calcul de remise erroné
dans `price.ts` sert à évaluer le modèle, pas les règles déterministes.
Le guide humain `.demo/expected.md` reste hors des fichiers suivis par Git.

Le premier essai déterministe consomme **0 token et 0 USD**. Pour tester le
transport HTTP, les compteurs et les erreurs sans payer un fournisseur :

```bash
# Depuis AirReview2
npm run test:api
```

Cette suite ouvre uniquement une API factice sur `127.0.0.1`. Les tokens et
montants renvoyés par celle-ci sont synthétiques, pas une mesure de Foundry.

## 2. Premier appel réel à Foundry

Dans le terminal où sera lancée la CLI, définir :

```bash
export AIR_REVIEW_PROVIDER=azure-foundry
export AIR_REVIEW_BASE_URL='https://RESSOURCE.services.ai.azure.com/openai/v1'
export AIR_REVIEW_MODEL='NOM_DU_DEPLOIEMENT'
# AIR_REVIEW_API_KEY doit contenir ta clé, fournie par ton environnement/secret store.
```

`AIR_REVIEW_MODEL` suffit pour utiliser le même déploiement pour tous les rôles.
Pour séparer les modèles, définir `AIR_REVIEW_MODEL_REVIEWER` et
`AIR_REVIEW_MODEL_VERIFIER` ; le planner est actuellement déterministe et
n’effectue aucun appel API, même si un modèle lui est associé.

Utiliser **le nom du déploiement**, et un modèle qui accepte **Chat Completions**
et le mode JSON. Un modèle limité à Responses ou à une API native différente
n’est pas pris en charge par cet adaptateur. Aucun SDK projet Foundry n’est requis.

Trois formes d’endpoint sont documentées par Microsoft et toutes fonctionnent :
l’endpoint de ressource `https://RESSOURCE.openai.azure.com`, l’endpoint de
ressource Foundry `https://RESSOURCE.services.ai.azure.com`, et l’endpoint de
**projet** `https://RESSOURCE.services.ai.azure.com/api/projects/PROJET`. Colle
celui que le portail affiche : la CLI ajoute `/openai/v1` elle-même. L’appel
part vers `/openai/v1/chat/completions`, avec l’en-tête `api-key` (clé) ou
`Authorization: Bearer` (jeton Entra ID via `AIR_REVIEW_ACCESS_TOKEN`), sans
paramètre `api-version`. Les anciens endpoints `/models` avec une version datée
ne sont pas le défaut.

Pour Azure, la CLI omet `temperature` et utilise `max_completion_tokens` afin
de permettre les modèles de raisonnement. Si un modèle tiers du catalogue
exige `max_tokens`, définir `AIR_REVIEW_MAX_TOKENS_PARAMETER=max_tokens`.
`endpoint.temperature` permet une valeur explicite (ou `null` pour omission).

Depuis le corpus :

```bash
node ../../../../dist/cli/index.js doctor
node ../../../../dist/cli/index.js review --ci local --base main --force --no-cache
```

`doctor` valide la configuration mais **ne valide pas l’authentification ni le
déploiement Azure** lorsque la liste des modèles est désactivée. Le premier
`review` effectue la vérification réelle et peut être facturé. `dry-run` effectue
aussi des appels payants ; seul `--deterministic-only` évite les appels modèles.
La revue porte sur les commits : commiter les changements avant de tester.

## 3. Coût lisible, par modèle et par rôle

Récupérer dans Azure les prix applicables au modèle/version, au type de
déploiement et à la région. Fournir les prix en **USD pour un million de tokens**,
avec pour clé le **nom du déploiement utilisé par la CLI**.

Exemple purement fictif, à remplacer avant de mesurer Foundry :

```bash
export AIR_REVIEW_PRICING='{"NOM_DU_DEPLOIEMENT":{"input":2,"cachedInput":0.5,"output":8}}'
```

La même table peut figurer dans `telemetry.pricing` du YAML. Les variables
d’environnement ont priorité. Un fichier `.env` n’est pas chargé automatiquement.

Formule :

```text
((entrée − entrée en cache) × tarif entrée
 + entrée en cache × tarif cache
 + sortie × tarif sortie) / 1 000 000
```

Les tokens de raisonnement sont un sous-ensemble de la sortie : ils ne sont
pas facturés une seconde fois. Les tokens cachés ici désignent les tokens
d’entrée servis depuis le cache du fournisseur. Une valeur non fournie par
l’API est affichée `n/a`, pas zéro. Si le détail cache manque, le montant est
estimé au tarif d’entrée normal et un avertissement le précise.

Un prix de modèle manquant, un prix cache manquant alors que du cache est
rapporté, ou des totaux absents rendent le coût `n/a`. Un appel qui produit du
JSON invalide reste comptabilisé si l’API renvoie son usage. Une erreur réseau
peut laisser le montant inconnu. Le montant exclut les frais hors tokens,
les taxes et les engagements de capacité : la facture Azure reste la référence.

## 4. Rapport et mémoire locale

Chaque revue locale écrit automatiquement :

| Fichier                       | Utilité                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `.air-review/summary.md`      | Rapport court : défauts, tokens, cache, raisonnement, coût et usage par rôle |
| `.air-review/review.json`     | Même synthèse structurée                                                     |
| `.air-review/context.md`      | Notes lisibles : défauts détaillés, preuves, états et historique             |
| `.air-review/state.json`      | Ledger avec marqueurs, relu par la CLI ; ne pas éditer manuellement          |
| `.air-review/telemetry.jsonl` | Historique des consommations de chaque exécution                             |
| `.air-review/cache/`          | Résultats locaux réutilisables, distincts du cache facturé par Azure         |

La mémoire envoyée au reviewer est une synthèse des findings précédents,
accompagnée du nouveau diff et des faits structurels reconstruits. Ce n’est
pas une conversation persistante hébergée chez Azure. Les notes Markdown
sont destinées à la lecture et ne constituent pas de nouvelles instructions
pour le modèle. Aucun secret API n’a à figurer dans ces fichiers.

Ces fichiers jouent le rôle de mémoire et de rapport sans PR ; il n’y a pas
une obligation de trois commentaires. Sur GitHub, l’outil utilise un ledger,
un résumé et des commentaires pour les findings. En CI locale, restaurer puis
archiver `.air-review/` avec une clé distincte par dépôt et PR/branche ; éviter
les exécutions concurrentes sur le même répertoire d’état.

## 5. Rejouer la vie d’un défaut

Après une revue initiale avec la même configuration :

```bash
# Aucun nouvel appel : même commit et même configuration.
node ../../../../dist/cli/index.js review --ci local --base main

# Changement sans rapport dans le même fichier : défaut toujours ouvert.
git checkout demo-02-unrelated
node ../../../../dist/cli/index.js review --ci local --base main

# Correction : défaut résolu.
git checkout demo-03-fixed
node ../../../../dist/cli/index.js review --ci local --base main

# Régression : défaut rouvert avec le même identifiant.
git checkout demo-04-reopened
node ../../../../dist/cli/index.js review --ci local --base main

node ../../../../dist/cli/index.js telemetry
node ../../../../dist/cli/index.js explain
```

Ajouter `--deterministic-only` à **chaque** revue pour rejouer ces étapes
sans cloud. `--force --no-cache` permet une nouvelle mesure complète contre
l’API ; il peut coûter de l’argent. Une erreur du reviewer/verifier renvoie
`30`, produit un rapport incomplet et n’avance pas le ledger. Une revue
bloquante renvoie `10`, y compris lors d’une relance sans changement.

## Sources vérifiées le 6 octobre 2026

- [Microsoft Foundry — API v1 et les deux domaines d’inférence](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle)
- [Microsoft Foundry — modèles de raisonnement et paramètres](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning)
- [AWS Bedrock — Chat Completions et authentification par clé](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html)
- [Google Gemini — compatibilité OpenAI](https://ai.google.dev/gemini-api/docs/openai)

Les couleurs sont activées par défaut, sans option supplémentaire. Le code
affiche son langage, ses numéros de ligne et la plage concernée en surbrillance.
Le terminal interactif ajoute un indicateur de progression et une apparition
rapide du rapport. `--no-animation` coupe le mouvement ; `--color=auto` active
la détection automatique du terminal. `NO_COLOR` et `--color=never` désactivent
les couleurs ; `--color=always` les force. Réserver `--plain` aux journaux
sans couleurs ni animation. `--json` reste toujours sans mise en forme.
