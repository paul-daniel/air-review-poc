# Fonctionnement

`air-review` est un pipeline fixe, pas un agent autonome. Chaque exécution fait les mêmes étapes dans le même ordre, fait au plus deux appels au modèle, et laisse une trace lisible de chaque décision. Cette page explique le pipeline, les deux appels et l'ossature déterministe qui les entoure.

## Le pipeline

```text
git diff (base de fusion … head)
  → analyser le diff, lire les faits du projet (package.json, tsconfig, version du framework)
  → règles déterministes (scan de secrets, libération des abonnements Angular, conteneur/présentateur)
  → plan de contexte : choisir les fichiers existants que le relecteur doit voir
  → appel 1 au modèle, « relecteur » : diff + preuves → constats en JSON
  → vérificateur déterministe (retirer les ancrages hors diff, les doublons, les sévérités non publiables)
  → appel 2 au modèle, « vérificateur » : revérifier chaque constat contre le code head cité
  → réconcilier avec l'exécution précédente (même id quand les lignes bougent, résoudre, rouvrir)
  → barrière de politique (code de sortie 10 si des constats bloquants restent)
  → publier : commentaires GitHub, fils Azure DevOps, ou .air-review/ en local
```

Le diff est calculé depuis la **base de fusion** entre la référence de base et le commit extrait, ce qui correspond à la sémantique d'une pull request : seul ce que la branche ajoute est relu, pas ce que la branche cible a gagné entre-temps. C'est pourquoi les pipelines ont besoin d'un clone complet (`fetch-depth: 0`, `fetchDepth: 0`).

## Trois rôles, deux appels au modèle

| Rôle                                   | Travail                                                                                                                           | Appel au modèle aujourd'hui ?                                                                                           | Modèle recommandé                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Planificateur de contexte              | décider quels fichiers existants le relecteur doit voir, et combien                                                               | **Non** : sélection déterministe d'exemplaires ; son emplacement de modèle est réservé à une étape d'exploration bornée | petit et rapide (réservé)              |
| Relecteur (`models.roles.reviewer`)    | raisonner sur le changement avec le paquet de preuves                                                                             | **Oui, appel 1**                                                                                                        | modèle de code ou de raisonnement fort |
| Vérificateur (`models.roles.verifier`) | vérifier chaque constat contre le code head cité, écarter les constats non prouvés ou en double, recalibrer sévérité et confiance | **Oui, appel 2**                                                                                                        | petit à moyen                          |

Une exécution typique coûte donc deux appels : le relecteur, puis le vérificateur. Elle en coûte zéro avec `--deterministic-only`, et zéro encore sur un push répété où le head et la configuration n'ont pas changé (le registre dit « skipped »).

### Appel 1 : le relecteur

Le relecteur reçoit, dans une enveloppe explicite de données non fiables :

- le diff, bloc par bloc ;
- des faits structurels sur les fichiers modifiés (symboles, faits Angular, conventions détectées) ;
- le **paquet de preuves** construit par le planificateur : exemplaires du même type, API exportée des modules importés, profil du dépôt ([Conscience du contexte](/fr/concepts/contextual-awareness)) ;
- les constats déterministes déjà établis, pour qu'il ne les duplique pas.

Il répond en JSON structuré : des constats avec sévérité, confiance, portée, origine de la règle, ancrage (fichier et lignes côté head) et une suggestion. La prose ou les blocs de code autour du JSON sont tolérés.

### Entre les appels : le vérificateur déterministe

Du logiciel, pas un modèle, retire ce qui peut être rejeté exactement : les constats ancrés hors du diff, les doublons produits par le modèle d'un constat déterministe (par chevauchement de lignes), les sévérités que la configuration ne publie pas, tout ce qui dépasse `review.maxFindings`. Les constats déterministes sont **verrouillés** à ce stade : le modèle peut écarter un doublon qu'il a lui-même produit, jamais le constat d'analyse statique.

### Appel 2 : le vérificateur

Le vérificateur voit chaque constat restant avec le code source de la révision head autour de son ancrage (8 lignes de chaque côté). Il peut écarter une affirmation que le code ne soutient pas, baisser ou monter la confiance, et ajuster la sévérité. C'est ce qui fait de « cette méthode n'existe pas » une affirmation vérifiable plutôt qu'une supposition.

## L'ossature déterministe

Le modèle n'est pas le produit ; les preuves qu'on lui donne le sont. Tout ce que le logiciel peut décider exactement reste déterministe :

- **Analyse du diff et extraction des symboles**, avec le compilateur TypeScript comme bibliothèque.
- **Règles** (`DeterministicRule`) : scan de secrets (rapportés en `BLOCKER` et caviardés avant que quoi que ce soit ne quitte la machine), cycle de vie des abonnements Angular, conventions du dépôt.
- **Identité des constats** : `règle + fichier + symbole (+ ordinal)`, jamais le numéro de ligne, pour que les constats gardent leur id et leur fil de commentaires quand le code bouge. Les constats du modèle gardent leur id entre exécutions même quand le modèle renomme sa règle : même fichier à trois lignes près compte comme le même constat, fils ouverts en priorité.
- **Réconciliation** : les constats inchangés gardent leur état, ceux dont le code a changé et ne se reproduit plus sont résolus, un constat résolu qui réapparaît est rouvert.
- **La barrière de politique** : les constats ouverts dans `review.gate.severities` avec une confiance au moins égale à `review.gate.minimumConfidence` font échouer l'exécution avec le code `10`.
- **Le registre et le cache** : [Mémoire et confidentialité](/fr/concepts/memory-and-privacy).

## Origines des règles et taxonomie des constats

Chaque constat indique d'où vient sa règle, car c'est ce qui le rend digne de confiance, ou non :

| Origine           | Exemple                                    | Autorité   | Comportement                                       |
| ----------------- | ------------------------------------------ | ---------- | -------------------------------------------------- |
| `PROJECT_CONFIG`  | rigueur du tsconfig, politique de sécurité | très forte | vérifié de façon déterministe quand c'est possible |
| `FRAMEWORK`       | API de cycle de vie Angular                | forte      | ajusté à la version réellement utilisée            |
| `REPO_CONVENTION` | séparation conteneur/présentateur          | variable   | exige plusieurs précédents pertinents              |
| `HEURISTIC`       | « cela pourrait être plus lisible »        | faible     | rarement bloquant                                  |

| Champ     | Valeurs                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| sévérité  | `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`                               |
| confiance | `0..1`, indépendante de la sévérité                                           |
| portée    | `IN_PR` (corriger ici), `FOLLOW_UP` (tâche séparée), `REPO_WIDE` (systémique) |

Sévérité et confiance sont des champs séparés, donc un constat incertain mais grave est rapporté honnêtement au lieu d'être promu ou écarté en silence. La dette existante du dépôt est détectée mais jamais imitée : un changement qui reproduit un motif connu comme mauvais reçoit un constat `IN_PR` pour la nouvelle occurrence, pas une demande de refonte du dépôt.

## Limite connue

Les constats sur la façon dont le changement interagit avec du code **non modifié** sont ancrés sur des lignes inchangées et sont aujourd'hui écartés par la règle d'ancrage strict plutôt que publiés en `FOLLOW_UP`. La feuille de route le signale comme un point à revoir.

## Où vivent les pièces

```text
src/
  contracts/    ModelProvider / ScmAdapter / types de constats et d'état
  config/       schéma, défauts, découverte, surcharges d'environnement, hachage
  model/        fournisseur compatible OpenAI, presets, routage des rôles, normalisation des sorties
  context/      analyse du diff, enveloppe git, faits TypeScript, profil du dépôt, planificateur d'exemplaires
  framework/    règles déterministes + détection des conventions Angular
  review/       prompts, relecteur, vérificateur, barrière, réconciliation, pipeline
  scm/          adaptateurs github, azure-devops et local, détection de la CI
  state/        registre de PR + rendu des commentaires de constats
  cache/        cache local adressé par contenu
  security/     caviardage des secrets, détection d'injection de prompt
  cli/          câblage commander et implémentation de chaque commande
```

Ajouter une plateforme ou un fournisseur ne touche jamais au moteur de revue : un nouveau SCM est un `ScmAdapter`, un nouvel éditeur est un preset, un nouveau pack de framework est un ensemble de `DeterministicRule` plus des faits structurels.
