# Conscience du contexte

« Contextuel » signifie que le relecteur voit comment **ce** dépôt fait déjà le même genre de chose. Un nouveau composant est jugé à côté de deux ou trois composants existants ; une modification de traduction est jugée à côté de son fichier de langue jumeau. Cette page explique ce que le planificateur sélectionne, pourquoi, et comment l'auditer avant de payer le moindre jeton.

## Pourquoi c'est important

Un modèle qui ne voit qu'un diff peut juger la syntaxe et les bonnes pratiques générales. Il ne peut pas savoir que votre dépôt nomme ses conteneurs `*.container.ts`, que chaque service expose déjà un sujet `destroy$`, ou que `fr.json` doit refléter `en.json` clé pour clé. Soit il invente une « convention » qui n'existe pas, soit il reste muet sur la vraie. Le planificateur comble ce manque avec des preuves, pas avec plus de texte de prompt.

## Le planificateur d'exemplaires

Pour chaque fichier modifié, le planificateur (`src/context/exemplars.ts`) :

1. **Détermine le type du fichier** d'après son nom : `order.container.ts` → `container.ts`, `fr.json` → `json`, `Button.tsx` → `tsx`.
2. **Trouve les fichiers existants du même type** qui ne font pas partie du changement, en ignorant les sorties de build, les dépendances et les binaires.
3. **Les classe par proximité** : même répertoire, puis répertoire frère, puis même dossier de fonctionnalité, puis n'importe où dans le dépôt. Dans un répertoire, les fichiers de la même famille de noms (`slider.ts` pour `slider-thumb.ts`) passent devant les voisins sans rapport, et les fichiers barils `index.*` passent en dernier.
4. **Décide combien il en faut** : un nouveau fichier reçoit jusqu'à trois exemplaires, un fichier largement réécrit deux, une petite modification un, un fichier de traduction ou de test un.
5. **Envoie chaque exemplaire en entier** quand il est court, sinon ses 120 premières lignes, dans deux budgets : `context.maxEvidenceTokens` (30 000 jetons par défaut) et `context.maxContextRequests` (20 fichiers par défaut).

## Les modules liés

Le planificateur résout les **imports relatifs** du changement et envoie l'API exportée de ces modules du dépôt (`related-modules`). Le relecteur peut alors vérifier qu'une méthode appelée existe et a la bonne forme, au lieu de le deviner d'après le nom de l'import.

## Le profil du dépôt

Un profil d'un paragraphe, indépendant du langage, est construit à partir de la liste des fichiers suivis et de `package.json` : langages, frameworks, gestionnaire de paquets, outils de test, dossiers de traduction, configuration de lint. Il coûte quelques centaines de jetons et cadre les attentes du modèle (un dépôt Jest ne doit pas recevoir de conseils Vitest).

## La règle « sans précédent »

Quand un nouveau fichier n'a **aucun précédent** dans le dépôt (aucun autre fichier de ce type), le planificateur le dit explicitement dans le prompt. Le relecteur est alors invité à proposer des pratiques largement acceptées, étiquetées `FRAMEWORK` ou `HEURISTIC`, et il lui est interdit de fabriquer une `REPO_CONVENTION`. C'est la différence entre « votre dépôt fait X » (qui doit être prouvable) et « le guide de style Angular recommande X » (qui est une affirmation générale).

## Auditer le plan avec `inspect`

```bash
air-review inspect --base origin/main
```

`inspect` affiche, sans aucun appel au modèle :

- les fichiers modifiés et leurs types ;
- pour chaque exemplaire, la raison de son choix (« même répertoire, même type », « fichier de langue jumeau ») et sa taille ;
- les modules liés et leurs symboles exportés ;
- le profil du dépôt ;
- le coût estimé en jetons du paquet de preuves par rapport aux deux budgets.

Si le plan semble faux (un exemplaire hors sujet, un budget atteint), ajustez `context.maxEvidenceTokens` ou `context.maxContextRequests` dans la configuration et relancez `inspect`. Rien n'a encore été payé.

Après une revue, `.air-review/context.md` consigne ce qui a réellement été envoyé, de sorte qu'un constat surprenant peut être retracé jusqu'aux preuves qui l'ont produit.

## Ce qui n'est pas construit

- **Recherche sémantique ou vectorielle** (`context.semanticFallback`) : non implémentée ; la sélection est structurelle.
- **Exploration agentique** : l'emplacement de modèle du planificateur (`models.roles.planner`) est réservé à une étape bornée où un modèle pourrait demander quelques lectures en lecture seule (lister un répertoire, lire un fichier, grep) avec un plafond strict, déclenchée seulement quand le plan structurel signale une incertitude. Il n'est pas appelé aujourd'hui.
- **Packs de frameworks** au-delà d'Angular. Le planificateur d'exemplaires et le profil fonctionnent déjà pour tout langage ; les règles déterministes et les faits structurels sont spécifiques à Angular pour l'instant.

Voir aussi [Fonctionnement](/fr/concepts/how-it-works) et la section `context` de la [Configuration](/fr/reference/configuration#context).
