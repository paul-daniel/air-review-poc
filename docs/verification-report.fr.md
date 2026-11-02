# Vérification Air Review — 6 octobre 2026

La CLI dispose maintenant d’un parcours local reproductible pour préparer un
premier test avec **Microsoft Foundry new et clé API**.

## Résultats

- Tests : 138 réussis, avec 15 instantanés de référence pour la sortie terminal.
- Suite de bout en bout existante : réussie (27 vérifications).
- Nouvelle suite API simulée : 13 vérifications réussies, dont format Foundry,
  contexte entre deux revues, cache, facturation, JSON invalide et erreur 401.
- Dépôt d’essai créé : `test/fixtures/work/airreview-demo`, scénario `demo-01-bugs`.
- Premier passage local exécuté : **1 finding MAJOR attendu**, aucun finding de
  subscription sur l’exemple correct ni sur la dette historique.
- Consommation de ce passage : **0 entrée, 0 sortie, 0 cache, 0 raisonnement ; 0 USD**.
- Test HTTP simulé : 2 000 tokens d’entrée dont 800 en cache, 400 tokens de
  sortie dont 160 de raisonnement ; estimation synthétique **0,006 USD** avec
  les tarifs fictifs du test. Coût cloud réellement engagé : **0 USD**.

## Corrections principales

Sélection des fournisseurs par variables d’environnement ; endpoint Foundry v1 ;
paramètres compatibles avec les modèles de raisonnement Azure ; prix par
déploiement incluant le cache ; conservation des tokens même si le JSON reçu
est invalide ; absence de faux total lorsqu’un tarif ou l’usage manque.

Rapport Markdown local automatique, notes de contexte et ledger conservés ;
relance forcée sur le bon diff ; maintien du code de sortie bloquant lors d’un
skip ; échec modèle signalé par le code 30 sans avancer l’état ; changement
sans rapport dans le même fichier ne résolvant plus un défaut existant.

TypeScript est une dépendance d’exécution, car l’analyse structurelle utilise
son compilateur. Le minimum Node est aligné sur Node 22.12 pour l’outillage du dépôt.

L’interface terminal utilise désormais les couleurs par défaut : sévérité,
chemins, syntaxe, fond du code et plage concernée. Les findings présentent une
explication naturelle, une recommandation et, si pertinent, un exemple de code ;
preuves et confiance restent en métadonnées. La mise en forme appartient au
renderer, pas au modèle. Les formats JSON et Markdown partagent les mêmes données.
Un essai sur pseudo-terminal a confirmé le spinner et l’apparition progressive
du rapport. Les modes couleur, sans couleur, plain et JSON ont aussi été testés
via la CLI compilée. Les instantanés couvrent notamment les petits terminaux,
les longs chemins, les plages de plusieurs lignes et les niveaux de confiance.

## Limites et prochain essai

**Aucun appel réel à Azure n’a été effectué.** Il faut encore renseigner la
ressource Foundry, le nom du déploiement compatible Chat Completions, la clé
dans l’environnement et les tarifs de ce déploiement. La compatibilité a été
vérifiée dans la documentation officielle et par simulation du protocole ;
les droits Azure, le modèle réel, sa qualité et sa facture restent à mesurer.

La simulation vérifie les mécanismes, pas la capacité d’un modèle à trouver le
bug de remise ni à résister aux injections. Le corpus contient ces cas pour
l’évaluation humaine. Les règles Angular restent des heuristiques structurelles
et la résolution des findings repose sur les lignes modifiées, pas sur une
preuve sémantique de correction. Le planner est déterministe ; le reviewer et
le verifier font les appels LLM. Un endpoint partagé est utilisé par les rôles.

GitHub et le Git local sont implémentés. Azure Pipelines peut lancer la CLI en
mode local, mais la publication native Azure Repos/Bitbucket reste à développer.
Les garde-fous de budget monétaire et un benchmark réel de précision ne sont
pas implémentés. Les options contextuelles du document R&D décrivent une cible
plus large que l’analyse structurelle actuelle.

Suivre [le guide de premier test](first-local-test.fr.md) pour les commandes,
les fichiers de mémoire et le calcul des coûts.
