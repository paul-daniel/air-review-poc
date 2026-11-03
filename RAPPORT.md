# RAPPORT — air-review : du POC au MVP V1

Session autonome du 2 au 3 novembre 2026. Les deux dépôts cibles étaient vides ;
tout a été repackagé dedans et poussé :

- https://github.com/paul-daniel/air-review-poc — l'outil (ce dépôt)
- https://github.com/paul-daniel/air-review-test-repo — le terrain d'essai `atlas-shop`

## 1. Résumé

| Sujet                        | État                                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base de code retenue         | `~/Documents/ChatGPT/AirReview2` (TypeScript, la version la plus avancée : adaptateur Azure DevOps avec vote, ledger PR, vérifieur). Les dossiers Python `AirReviewer*` et le dépôt GitHub `airreview` (juin 2026) sont l'ancienne génération et n'ont pas été repris.           |
| Routage par complexité       | Fait : rôle **triage** + tiers `light` / `standard` / `heavy`, décision justifiée dans la sortie terminal, le commentaire de synthèse, le rapport et le JSON.                                                                                                                    |
| Intégration Foundry (new)    | Fait et **validé en réel** sur `airreview-resource` (route OpenAI v1 + jeton Entra ID). Provider `azure-foundry-agent` (prompt agents du Foundry Agent Service) implémenté d'après la doc officielle, **non testé en réel** (aucun projet Foundry avec agents n'existe encore).  |
| Format de la revue           | Fait : étude CodeRabbit / Qodo-PR-Agent / Copilot, format choisi et justifié dans `docs/review-format.md`.                                                                                                                                                                       |
| Observabilité                | Fait : trace par étape (durée, agent/modèle, tokens, coût), rapport `.air-review/reports/<run>.md                                                                                                                                                                                | json`, diagramme Mermaid du chemin réellement emprunté. |
| Azure DevOps (vrai reviewer) | Fait dans le code et couvert par des tests unitaires (vote 10 / 5 / -5 selon le verdict, statut PR optionnel, dédoublonnage des fils par marqueur, revue incrémentale, cache). **Pas de run en réel** (voir §5). Pipeline YAML prêt à l'emploi : `examples/azure-pipelines.yml`. |
| Dépôt de test                | Fait : monorepo `atlas-shop` (167 fichiers, ~9 400 lignes : Angular 19 + API Node + lib partagée), six branches de scénario documentées et **exécutées** (hors ligne, et scénarios 03/06 en réel sur Foundry).                                                                   |
| Documentation                | README, `docs/foundry.md`, `docs/review-format.md`, `docs/observability.md`, `docs/azure-devops.md`, `docs/architecture.md`, `docs/configuration.md`, sources citées.                                                                                                            |
| Tests                        | 32 fichiers, 229 tests unitaires verts (`npm test`), smoke test de bout en bout hors ligne vert (`npm run test:e2e`), lint et typage verts.                                                                                                                                      |

## 2. Ce qui a été fait, point par point

### 2.1 Audit de l'architecture multi-agent

L'existant avait de bonnes fondations (contrats `ModelProvider` / `ScmAdapter`,
sévérité séparée de la confiance, ledger dans la PR, vérifieur, secrets
masqués) mais un seul modèle « reviewer » pour tout, un rôle `planner` déclaré
mais jamais appelé, et aucune visibilité sur le coût de chaque étape.

Décisions prises (conformes à votre rapport de recherche : rôles logiques oui,
armée d'agents non, tout ce qui peut être déterministe reste déterministe) :

- **Quatre rôles** : `triage` (nouveau, bon marché), `planner` (réservé),
  `reviewer`, `verifier`. Chaque rôle = un modèle/déploiement/agent configurable.
- **Triage déterministe d'abord** (`src/review/triage.ts`) : nombre de
  fichiers, lignes, modules de premier niveau (`apps/web`, `libs/shared`…),
  nature des fichiers (traduction, docs, données, config, tests, code).
  Seuils par défaut : `light` ≤ 3 fichiers et ≤ 150 lignes dans un seul module,
  ou aucun code source (traduction/docs/données) ; `heavy` ≥ 10 fichiers ou
  ≥ 400 lignes ou ≥ 3 modules ; `standard` sinon.
- **Modèle de triage** consulté uniquement sur la bande ambiguë (`routing.mode:
hybrid`, défaut), jamais (`deterministic`) ou toujours (`model`).
- **Le choix est visible** : section « Routing » du terminal, du commentaire de
  synthèse et du rapport (tier, modèle reviewer/verifier, méthode, raisons) ;
  `air-review inspect` l'anticipe avant tout appel ; `--tier` force un tier.
- Comparaison faite avec le **model router** de Microsoft Foundry (un
  déploiement qui route chaque prompt) : complémentaire, pas remplaçant — notre
  triage décide par pull request, explique pourquoi, et choisit aussi le
  vérifieur. Source citée dans `docs/foundry.md`.

### 2.2 Intégration Foundry (new)

Deux chemins, vérifiés dans la documentation Microsoft (liens dans `docs/foundry.md`) :

1. `provider: azure-foundry` : route OpenAI v1 d'une ressource Foundry
   (`https://<res>.services.ai.azure.com/openai/v1`, nom de déploiement dans
   `model`, pas d'`api-version`, clé `api-key` ou jeton Entra ID de scope
   `https://ai.azure.com/.default`, bascule automatique vers l'API Responses).
   **Validé en réel** (voir §4).
2. `provider: azure-foundry-agent` : un _prompt agent_ Foundry par rôle,
   appelé via `POST {projet}/agents/{nom}/endpoint/protocols/openai/responses?api-version=v1`.
   Le script `scripts/foundry/sync-agents.mjs` crée/met à jour les cinq agents
   à partir des prompts de l'outil. Changer le modèle d'un rôle devient une
   opération Foundry, sans toucher au code.

Interchangeabilité par configuration : `models.roles.*`, `models.tiers.light|heavy.*`,
et les variables `AIR_REVIEW_MODEL_*`, `AIR_REVIEW_MODEL_REVIEWER_LIGHT|HEAVY`,
`AIR_REVIEW_MODEL_VERIFIER_LIGHT|HEAVY`, `AIR_REVIEW_ROUTING_MODE`. Exemple
commenté : `examples/air-review.foundry.yaml`. Procédure de mise en route en
huit étapes dans `docs/foundry.md`.

### 2.3 Format de la revue

Étude dans `docs/review-format.md` (sources : docs CodeRabbit, Qodo, PR-Agent,
GitHub Copilot). Format retenu :

- **Un commentaire de synthèse** mis à jour en place : verdict en première
  ligne (✅ Approuvé / ✅ Approuvé avec suggestions / ❌ Modifications
  demandées), routage, tableau des findings (sévérité, catégorie, emplacement,
  portée), « depuis la dernière revue » (résolus/rouverts), coût par étape et
  diagramme du workflow repliés.
- **Un fil par finding** : `🛑 CRITICAL · Correctness — titre`, emplacement,
  conséquence, **Fix :** phrase + bloc de code optionnel (bloc `suggestion`
  applicable en un clic sur GitHub quand le modèle déclare un remplacement
  exact), preuves, pied de page machine (portée, confiance, règle, id).
- Sévérité (BLOCKER…INFO), confiance (0–1) et portée (IN_PR / FOLLOW_UP /
  REPO_WIDE) restent trois axes distincts ; une **catégorie** (correctness,
  security, performance, maintainability, consistency, tests, docs) est ajoutée.
- Volontairement absents : poèmes, diagrammes de séquence, PR de correction automatique.

### 2.4 Observabilité

- `src/telemetry/trace.ts` : chaque étape (mémoire, delta, analyse, règles,
  triage, reviewer, vérification déterministe, vérifieur, réconciliation, gate,
  publication, verdict) est tracée avec statut (`done` / `cached` / `skipped` /
  `failed`), durée, rôle, modèle, tokens (entrée, cache, sortie, raisonnement)
  et coût estimé d'après `telemetry.pricing`.
- `src/telemetry/report.ts` : rapport Markdown + JSON par run dans
  `.air-review/reports/`, coût par étape et total, routage, findings, diagramme.
- `src/telemetry/workflow-diagram.ts` : flowchart Mermaid construit à partir de
  la trace (étapes sautées en gris pointillé, cache en bleu, tiers non retenus
  dessinés comme branches non prises) — pour voir où optimiser.
- Le journal `telemetry.jsonl` et `air-review telemetry` portent le tier et le verdict.

### 2.5 Azure DevOps : rôle de vrai reviewer

- **Vote** : le verdict devient un vote (10 approuvé, 5 approuvé avec
  suggestions, -5 en attente de l'auteur, 0 si la revue est incomplète) via
  `PUT …/reviewers/{id}` (api-version 7.1, doc citée). Jamais de merge.
- **Statut de PR** optionnel (`platform.azureDevops.status`) pour une
  stratégie de branche « Status ».
- **Pas de doublons** : avant toute création, l'adaptateur cherche le marqueur
  caché `<!-- air-review:finding:<id> -->` dans les fils existants et met à
  jour (ou répond, si l'auteur est une autre identité) ; un ledger perdu ne
  recrée plus de fil.
- **Cache / revue incrémentale** : même head + même configuration → aucun
  appel modèle, même avec `--publish` ; nouveau push → delta depuis le
  dernier head revu ; push qui ne touche que docs/binaires
  (`review.modelSkipKinds`) → aucun appel modèle, findings conservés ; cache
  local de résultats par contenu.
- Pipeline prêt à l'emploi : `examples/azure-pipelines.yml`, documenté dans
  `docs/azure-devops.md` (groupe de variables, permission « Contribute to pull
  requests », codes de sortie).

### 2.6 Dépôt de test `air-review-test-repo`

Voir le README et `scenarios/README.md` du dépôt. Monorepo `atlas-shop` :
`apps/web` (Angular 19, convention container/presenter, `takeUntilDestroyed`,
i18n en/fr/de), `apps/api` (Node 22 + TypeScript, couches contrôleur/service/
dépôt), `libs/shared` (modèles, monnaie, remises). Six branches de scénario :

| Branche                             | Attendu                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario/01-translation-only`      | tier light, aucun finding, approbation                                                                                                                                                                            |
| `scenario/02-classification-task`   | tier light, approbation                                                                                                                                                                                           |
| `scenario/03-order-returns-feature` | tier heavy (≥ 18 fichiers, 3 modules), approbation attendue                                                                                                                                                       |
| `scenario/04-repush-docs-only`      | second push sur la PR 03 : « rien de nouveau », 0 appel modèle, pas de doublon                                                                                                                                    |
| `scenario/05-clean-small-refactor`  | aucun finding → approbation automatique                                                                                                                                                                           |
| `scenario/06-defects`               | secret (BLOCKER, déterministe), fuite d'abonnement (MAJOR, déterministe), composant hors convention (MAJOR), bug pourcentage/fraction (modèle), injection de prompt ignorée → « en attente de l'auteur », exit 10 |

Les scénarios sont exécutables hors ligne (`provider: mock`, script
`scripts/review-scenarios.sh`) et en réel sur Foundry. Résultats observés le
3 novembre (détail dans `scenarios/README.md` du dépôt de test) :

| Scénario                 | Hors ligne (mock)                                          | En réel (Foundry)                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 traduction            | light, 1 appel, approuvé                                   | –                                                                                                                                                                                                                                                                                                              |
| 02 classification        | light, 1 appel, approuvé                                   | –                                                                                                                                                                                                                                                                                                              |
| 03 feature multi-modules | heavy, approuvé                                            | heavy (36 fichiers, 1 801 lignes, 3 modules), 2 appels, 74,6 s, ~0,14 $, approuvé avec suggestions : 2 findings du modèle à confiance 0,70 (non bloquants) sur `returns.service.ts`, non plantés, laissés dans la branche                                                                                      |
| 04 re-push docs          | « rien de nouveau », 0 appel, verdict conservé             | –                                                                                                                                                                                                                                                                                                              |
| 05 refactor propre       | standard, approuvé, 0 finding                              | –                                                                                                                                                                                                                                                                                                              |
| 06 défauts plantés       | standard, modifications demandées (3 règles déterministes) | standard choisi par le modèle de triage (conf. 0,9), 3 appels, 79,8 s, ~0,10 $ : BLOCKER secret, **CRITICAL « pourcentage utilisé comme multiplicateur absolu » (modèle, conf. 0,90)**, MAJOR container/presenter, MAJOR abonnement ; injection signalée et ignorée ; 2 doublons du modèle supprimés ; vote −5 |

### 2.7 Documentation

README (présentation, architecture avec diagramme, installation, Foundry,
Azure DevOps, lecture des rapports), `docs/` mis à jour, `CHANGELOG.md` 0.2.0,
site VitePress nettoyé des clés supprimées. Langue : anglais pour la
documentation du dépôt (cohérent avec l'existant et le site EN/FR), français
pour ce rapport.

## 3. Choix faits à votre place

1. **Base repackagée** : la version TypeScript `AirReview2` (octobre 2026),
   pas les versions Python. Importée telle quelle en premier commit, puis
   refactorisée par commits atomiques.
2. **Suppression** du provider Ollama « réservé », de la section de config
   `openai:` héritée et du flag `features` : moins de surface, zéro régression
   fonctionnelle (tests adaptés).
3. **Seuils de routage** par défaut (3 fichiers / 150 lignes ; 10 fichiers /
   400 lignes / 3 modules) : choisis pour que « un fichier de traduction » et
   « une tâche de classification » (2–3 fichiers) partent au tier light et
   qu'une PR multi-modules parte au tier heavy. À calibrer sur vos vraies PR.
4. **Docs et binaires ne déclenchent pas de revue modèle** (`review.modelSkipKinds`,
   défaut `[docs, binary]`) ; les traductions, elles, sont revues (tier light).
5. **Vote « approuvé avec suggestions » (5)** quand des findings non bloquants
   restent ouverts (désactivable : `platform.azureDevops.vote.approveWithSuggestions`).
6. **Même head = jamais revu deux fois**, même avec `--publish` ; `--force`
   pour re-publier.
7. **Provider `mock`** ajouté pour démos et tests hors ligne (marqueurs
   `// air-review:expect …` dans les diffs de test uniquement).
8. **Diagramme Mermaid** inclus tel quel dans le commentaire Azure DevOps
   (non rendu par Azure DevOps, rendu par GitHub et mermaid.live).

## 4. Vérifications réalisées

- `npm run check` (typage, lint, format, 229 tests) et `npm run test:e2e`
  (CLI complète hors ligne) : verts.
- **Foundry en réel** (ressource `airreview-resource`, Sweden Central, jeton
  Entra ID obtenu par `az login`, aucune clé stockée), sur le corpus de
  démonstration `scripts/demo.mjs` (3 fichiers : fuite d'abonnement, bug de
  remise, injection de prompt) :

| Run                            | Tier / reviewer                                  | Appels | Durée  | Coût estimé | Résultat                                                                                                           |
| ------------------------------ | ------------------------------------------------ | ------ | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `dry-run`                      | light / `airreview-planning-mini` (gpt-4.1-mini) | 2      | 5,2 s  | ~0,002 $    | fuite d'abonnement (déterministe) + 1 finding modèle, injection ignorée, approuvé avec suggestions                 |
| `dry-run --tier heavy --force` | heavy / `airreview-review-codex` (gpt-5-codex)   | 2      | 14,1 s | ~0,016 $    | bug « pourcentage traité comme fraction » trouvé (MAJOR), doublon du modèle supprimé par le vérifieur déterministe |

| `dry-run --force` avec `AIR_REVIEW_ROUTING_MODE=model` | standard, décidé par le modèle de triage `airreview-critic-mini` (conf. 0,8) | 3 | 17 s | ~0,021 $ | le triage coûte ~0,0004 $ et justifie son choix (« abonnements réactifs, injection de dépendances ») |

Plus les deux scénarios du dépôt de test (§2.6). Le rapport
`.air-review/reports/<run>.md` et le diagramme ont été relus.
Un défaut trouvé grâce à ce run : la sonde de `doctor` déclarait un
déploiement à raisonnement (gpt-5-codex) en échec (budget de 16 tokens
épuisé en raisonnement) — corrigé.

## 5. Ce qui n'a pas pu être fait ou vérifié

- **Azure DevOps en réel** : l'organisation `dev.azure.com/dantchatchouang`
  est adossée à un compte Microsoft personnel ; le jeton Entra ID de la
  session `az` est redirigé vers la page de connexion. Il faut un PAT
  (`SYSTEM_ACCESSTOKEN` / `AZURE_DEVOPS_EXT_PAT`), que je n'avais pas et que
  je n'ai pas cherché dans vos trousseaux. L'adaptateur est couvert par 20+
  tests avec un faux client HTTP ; le prochain run réel est documenté
  étape par étape dans `docs/azure-devops.md`. L'agent auto-hébergé
  `claude-mac` ne semblait pas démarré ; le pipeline n'a donc pas tourné.
- **Foundry Agent Service** (`azure-foundry-agent`, `sync-agents.mjs`) :
  implémenté d'après la documentation officielle et testé en `--dry-run`,
  pas d'appel réel (aucun projet Foundry avec agents n'existe dans la
  ressource).
- **Prix** : les tarifs dans les exemples sont des ordres de grandeur ;
  renseignez `telemetry.pricing` avec vos tarifs Azure.
- **Rôle `planner`** : toujours réservé (sélection d'exemplaires déterministe).

## 6. Prochaines étapes recommandées

1. Créer un PAT (Code read & write), rejouer `docs/azure-devops.md` sur une PR
   de `air-review-test-repo` (scénarios 06 puis 04) et vérifier vote, absence
   de doublons et run incrémental ; puis brancher `examples/azure-pipelines.yml`
   en build validation.
2. Calibrer les seuils de routage et les tarifs sur dix vraies PR, à partir des
   rapports `.air-review/reports/` (coût par tier, findings par tier).
3. Créer les prompt agents (`scripts/foundry/sync-agents.mjs`) et comparer les
   deux providers sur les mêmes PR.
4. Activer le modèle de triage sur la bande ambiguë avec un petit déploiement
   et mesurer sa valeur (confiance, coût).
5. Petit benchmark de précision (scénario 06 + quelques PR réelles) avant toute
   extension à d'autres frameworks.

---

## 7. Mise à jour du 3 novembre (matin) — après discussion

Décisions prises ensemble et appliquées :

| Décision                                                        | Fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SDK officiels pour Foundry** plutôt que le client HTTP maison | Oui. `openai` pour tous les modèles derrière la route `/openai/v1` (GPT, DeepSeek, Llama, Grok, Mistral, model router), SDK Anthropic Foundry pour Claude, `@azure/ai-projects` pour les prompt agents. Identifiants : clé API, jeton fourni, ou **sans clé** via `DefaultAzureCredential` (connexion `az login` en local, identité managée ou connexion de service en pipeline). `doctor` affiche lequel est utilisé. Le client HTTP maison ne sert plus qu'aux fournisseurs hors Azure. |
| **Claude disponible comme n'importe quel modèle**               | Oui. Un déploiement dont le nom commence par `claude` (ou écrit `claude:<déploiement>`) passe par la porte Anthropic de Foundry (`…/anthropic`, API Messages, source Microsoft citée dans `docs/foundry.md`). Il se choisit par rôle ou par tier dans la config, sans code. La version (Haiku, Sonnet, Opus 4.5…) est celle que vous déployez.                                                                                                                                            |
| **Échelle de sévérité et blocage**                              | BLOCKER / CRITICAL / MAJOR / MINOR / **NITPICK** / INFO. Tout ce qui est MINOR ou plus grave (confiance ≥ 0,6) bloque l'approbation ; NITPICK (préférence du reviewer) et INFO ne bloquent jamais. Prompts du reviewer et du vérifieur alignés.                                                                                                                                                                                                                                           |
| **Répondre dans le fil existant**                               | Oui. Quand un push touche le code d'une remarque ouverte sans la régler (ou qu'une remarque résolue revient), l'outil répond dans le même fil avec l'étape suivante, sans « tu as mal corrigé », et réactive le fil. Jamais de second fil.                                                                                                                                                                                                                                                |
| **Approbation = dernière étape de la pipeline**                 | Oui. Nouvelle commande `air-review approve`. Mode par défaut `vote.mode: pipeline` : l'étape de revue ne vote que « en attente de l'auteur » (code de sortie 10) ; `approve` tourne après build et tests (`condition: succeeded()`), relit la mémoire de la PR, refuse un head non revu, et vote 10 (ou 5 s'il ne reste que des nitpicks). L'outil ne complète jamais la PR.                                                                                                              |
| **Guide de démarrage simple**                                   | `docs/getting-started.md` et `docs/fr/demarrage.md` : quatre parties, 30 minutes, une vérification à chaque étape, tableau des pannes classiques.                                                                                                                                                                                                                                                                                                                                         |

Vérifications : 248 tests unitaires et le test de bout en bout hors ligne sont
verts ; en réel sur `airreview-resource`, `doctor` puis `dry-run` ont tourné
**sans aucune clé** (identité de votre session `az login` via
DefaultAzureCredential, SDK OpenAI) : tier light, 2 appels, 9,3 s, ~0,003 $,
bug de remise trouvé par gpt-4.1-mini. Les six scénarios du dépôt de test ont
été rejoués hors ligne avec la nouvelle règle de blocage.

Toujours non vérifié en réel : Claude sur Foundry (aucun déploiement Claude
sur la ressource ; à déployer depuis le catalogue, conditions Marketplace à
accepter), les prompt agents, et Azure DevOps (jeton PAT nécessaire). C'est
l'étape suivante que nous avons convenue : brancher la pipeline sur une PR du
dépôt de test et observer revue, réponses dans les fils, puis approbation.
