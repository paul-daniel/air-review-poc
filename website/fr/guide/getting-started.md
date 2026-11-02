# Premiers pas

Ce tutoriel vous mène d'un clone vierge à une première vraie revue en un quart d'heure environ. Vous allez :

1. installer `air-review` depuis le dépôt ;
2. lancer une revue gratuite et hors ligne sur le corpus de démonstration (sans clé, sans appel au modèle) ;
3. lancer une première vraie revue avec un fournisseur de modèles ;
4. lire le résultat et les fichiers produits.

## Prérequis

- Node.js 22.12 ou plus récent (`node --version`).
- Git.
- Pour l'étape 3 seulement : une clé d'API ou un jeton pour un fournisseur de modèles. Les [guides d'intégration](/fr/integrations/microsoft-foundry) expliquent comment l'obtenir.

## 1. Installer depuis le dépôt

L'outil est un projet TypeScript. Compilez-le une fois, puis liez la commande `air-review` dans votre shell.

```bash
git clone <url-du-depot-air-review> air-review
cd air-review
npm install
npm run build
npm link
```

Vérifiez que la commande répond :

```bash
air-review --version
air-review --help
```

::: tip
`npm link` crée un lien symbolique global vers ce clone. Après avoir récupéré de nouveaux commits, relancez `npm run build` ; la commande liée utilise immédiatement la nouvelle version.
:::

## 2. La revue locale gratuite

Le dépôt fournit un générateur de petit corpus Git avec des défauts connus. Il ne coûte rien et ne demande aucun fournisseur.

```bash
npm run demo
```

La commande crée `test/fixtures/work/airreview-demo`, un dépôt Git positionné sur le tag `demo-01-bugs` (les scénarios ont été commités sur une branche `demo-scenarios`). La branche de base est `main`. Le corpus contient :

- `src/app/widget.component.ts` : un abonnement jamais libéré (une règle déterministe le détecte) ;
- `src/app/price.ts` : une formule de remise qui divise par 1 au lieu de 100, surmontée d'un commentaire d'injection de prompt (seul un modèle le détecte) ;
- `src/app/safe.component.ts` et `src/app/legacy.component.ts` : un composant correct et une dette préexistante qui ne doivent pas être signalés comme nouveaux.

Placez-vous dans le corpus et lancez uniquement les règles déterministes. `--deterministic-only` ne fait aucun appel au modèle :

```bash
cd test/fixtures/work/airreview-demo
air-review inspect --base main
air-review dry-run --base main --deterministic-only
```

Ce qu'il faut attendre :

- `inspect` affiche les fichiers modifiés, les faits structurels et le plan de contexte (quels fichiers existants seraient montrés à un modèle, et pourquoi). Aucun modèle n'est appelé.
- `dry-run --deterministic-only` rapporte un constat MAJOR sur `widget.component.ts`. `safe.component.ts` et `legacy.component.ts` restent propres. Le code de sortie est `0`, car la barrière par défaut ne bloque que sur `BLOCKER` et `CRITICAL`.

Le corpus a quatre scénarios étiquetés. `git checkout demo-02-unrelated`, `demo-03-fixed` et `demo-04-reopened` permettent de voir un constat rester ouvert, être résolu, puis se rouvrir avec le même identifiant. Le fichier `.demo/expected.md` du corpus décrit ce que chaque scénario doit produire.

## 3. Une première vraie revue

Choisissez un fournisseur et exportez ses variables. L'exemple ci-dessous utilise OpenAI ; tout autre fournisseur fonctionne de la même façon avec un autre identifiant de preset et une autre variable de clé (voir [Autres fournisseurs](/fr/integrations/other-providers), [Microsoft Foundry](/fr/integrations/microsoft-foundry) ou [Amazon Bedrock](/fr/integrations/amazon-bedrock)).

```bash
export AIR_REVIEW_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export AIR_REVIEW_MODEL_REVIEWER=gpt-4.1
export AIR_REVIEW_MODEL_VERIFIER=gpt-4o-mini
```

::: warning Les clés ne vont jamais dans un fichier commité
Exportez les clés dans votre shell ou placez-les dans un fichier `.env` listé dans `.gitignore`. Le [guide du poste de développeur](/fr/integrations/local-developer) montre une installation sûre avec `.env` et direnv.
:::

Vérifiez tout avant de payer le moindre jeton :

```bash
air-review doctor
```

`doctor` affiche le point de terminaison résolu, la variable d'où vient l'identifiant, les modèles de chaque rôle, ainsi que l'état de Git et de l'adaptateur SCM. Sur les points de terminaison sans liste de modèles (Azure), il envoie une minuscule requête de test par déploiement.

Lancez ensuite la revue complète, toujours sans rien publier :

```bash
air-review dry-run --base main
```

Avec un modèle relecteur capable, vous obtenez deux constats : l'abonnement non libéré (déterministe) et un constat CRITICAL sur `price.ts` (la formule de remise). Le commentaire d'injection de prompt dans `price.ts` ne doit rien changer au résultat.

## 4. Lire le résultat

Un constat affiche, dans cet ordre :

1. la sévérité, le fichier, la plage de lignes et un titre court ;
2. le code source de la plage concernée, coloré, pris dans la révision relue ;
3. l'explication, puis un exemple de correction quand le modèle en propose un ;
4. une ligne secondaire avec la confiance (0 à 1), l'origine de la règle (`PROJECT_CONFIG`, `FRAMEWORK`, `REPO_CONVENTION`, `HEURISTIC`) et la portée (`IN_PR`, `FOLLOW_UP`, `REPO_WIDE`).

L'en-tête sépare le nombre de constats du résultat de la politique : « gate passed » ou « gate failed ». Le dernier bloc, « Usage & cost », liste les jetons d'entrée, d'entrée en cache, de sortie et de raisonnement par rôle, le nombre d'appels, la durée, et une estimation en dollars quand les prix sont configurés (voir [Choisir les modèles](/fr/concepts/choosing-models)).

Options utiles :

```bash
air-review dry-run --base main --json > run.json   # résultat exploitable par un programme
air-review dry-run --base main --plain              # journaux ASCII pour la CI
air-review explain                                  # liste des constats mémorisés
air-review explain arf_7d0b9f                       # un constat avec ses preuves
```

## 5. Ce que contient `.air-review/`

Chaque revue locale écrit dans `.air-review/` à la racine du dépôt relu. `air-review init` ajoute ce dossier à `.gitignore` ; ajoutez-le vous-même si vous avez sauté `init`.

| Fichier           | Rôle                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `state.json`      | Le registre local : SHA relus, constats, identifiants et cycle de vie (ouvert, résolu, rouvert)     |
| `summary.md`      | Le résumé lisible de la dernière exécution, le même tableau que celui qui serait publié dans une PR |
| `context.md`      | Ce qui a été envoyé au modèle : exemplaires, modules liés, profil du dépôt                          |
| `telemetry.jsonl` | Une ligne JSON par exécution : jetons, appels, estimation de coût, durée, résultat de la barrière   |
| `cache/`          | Cache adressé par contenu des réponses du modèle ; peut être supprimé à tout moment                 |

Sur GitHub et Azure DevOps, le registre vit dans la pull request (commentaires ou fils) ; `.air-review/` ne contient alors que le cache, le journal de télémétrie et les résumés locaux.

## Et ensuite

- Mettre l'outil dans un pipeline : [Azure DevOps](/fr/integrations/azure-devops) ou [GitHub Actions](/fr/integrations/github-actions).
- Comprendre ce que voit le modèle et pourquoi : [Conscience du contexte](/fr/concepts/contextual-awareness).
- Régler la barrière et les modèles : [Configuration](/fr/reference/configuration), [Choisir les modèles](/fr/concepts/choosing-models).
