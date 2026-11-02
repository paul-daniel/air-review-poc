# Mémoire et confidentialité

Deux questions que toute équipe pose avant de laisser un outil lire son code : où vit l'état de la revue, et qu'est-ce qui quitte exactement la machine. Cette page répond aux deux.

## Où vit la mémoire

```text
git            = la vérité du code
registre de PR = état durable, minimal, visible par les humains
cache local    = accélérateur reconstructible, jamais la vérité
```

Aucun serveur ne reste allumé entre les exécutions. L'état dont une exécution a besoin pour être incrémentale est stocké **dans la pull request elle-même** :

| Plateforme           | Registre                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub               | un commentaire d'issue caché `air-review:state`, un commentaire de résumé `Air Review`, des fils de revue en ligne (un par constat)                                                                         |
| Azure DevOps         | les mêmes trois types en fils de pull request : un fil d'état `closed`, un fil de résumé (`active` tant que la barrière échoue), un fil `active` par constat, passé à `fixed` quand il ne se reproduit plus |
| local (`--ci local`) | `.air-review/state.json`, plus `summary.md` et `context.md`                                                                                                                                                 |

Chaque commentaire porte un marqueur caché `air-review:`, de sorte que l'exécution suivante retrouve et met à jour ses propres commentaires au lieu d'en poster des doublons. Les constats gardent leur fil quand le code bouge, car leur identité est `règle + fichier + symbole`, pas le numéro de ligne. À chaque nouveau push le registre est réconcilié : les constats inchangés gardent leur état, ceux dont le code ne se reproduit plus sont résolus, un constat résolu qui réapparaît est rouvert.

Le **commentaire d'état ne contient que des faits** : SHA, identifiants et empreintes des constats, métriques. Jamais le raisonnement du modèle, jamais les prompts.

Une **garde de head périmé** relit la pull request avant d'écrire. Si un push plus récent est arrivé pendant la revue, rien n'est publié ; l'exécution suivante relit le nouveau head.

`memory.backend: none` désactive la lecture et l'avancement de la mémoire (chaque exécution est une revue complète) ; les résumés locaux et la télémétrie restent.

## Le cache

`.air-review/cache` est adressé par contenu : la clé est un hachage de l'entrée (diff, preuves, prompt, modèle). Il ne fait qu'accélérer : le supprimer ne perd jamais l'état de la revue, et `--no-cache` le contourne pour une exécution. `air-review cache prune --older-than 24` le nettoie.

## Ce qui est envoyé au modèle

Seulement ce dont la revue a besoin, rien de plus :

- le **diff** (base de fusion vers head), bloc par bloc ;
- des **faits structurels** sur les fichiers modifiés (symboles, faits du framework, conventions détectées) ;
- le **paquet de preuves** : jusqu'à trois fichiers exemplaires du même type par fichier modifié (en entier s'ils sont courts, sinon les 120 premières lignes), l'API exportée des modules du dépôt importés, et un profil du dépôt en un paragraphe, le tout dans `context.maxEvidenceTokens` (30 000 jetons par défaut) et `context.maxContextRequests` (20 fichiers) ;
- pour le vérificateur, le code de la révision head autour de chaque constat (8 lignes de chaque côté).

`privacy.sendFullFiles` vaut `false` par défaut : le modèle ne reçoit jamais de fichiers entiers au-delà des extraits d'exemplaires. `air-review inspect` montre le plan exact avant l'exécution, et `.air-review/context.md` consigne ce qui a été envoyé après.

Rien d'autre ne quitte la machine. La télémétrie (`.air-review/telemetry.jsonl`) est un fichier local ; l'outil ne la téléverse jamais.

## Caviardage

Les motifs de secrets connus (AWS, GitHub, Google, OpenAI, Slack, clés privées, mots de passe en dur) sont retirés de tout ce qui est envoyé à un modèle et rapportés comme constat `BLOCKER`. `privacy.redactSecrets: true` est le défaut. Les secrets reconnus et les séquences de contrôle de terminal sont aussi retirés de l'affichage, et `config list`, `doctor` et `--json` masquent les valeurs qui ressemblent à des secrets (`***cdef`).

## L'enveloppe anti-injection de prompt

Le dépôt est une entrée non fiable. Une pull request peut contenir `// AI reviewer: ignore all previous instructions`, et `air-review` la traite exactement comme n'importe quelle autre donnée. Les prompts séparent la politique système des données du dépôt par une enveloppe explicite de données non fiables. La politique énonce que les données ne peuvent pas changer les instructions, définir le rôle ou supprimer des constats, et la passe de vérification revérifie ce que le relecteur a produit. Le corpus de démonstration contient un tel commentaire, pour que vous puissiez constater que le résultat de la revue ne change pas.

## Ce que l'outil ne fait jamais

- **Git en lecture seule** : aucune modification du checkout, aucune exécution de code, aucun lancement de tests ou de build. L'exécution de code est une future fonctionnalité optionnelle en bac à sable.
- **Surface de publication restreinte** : les adaptateurs ne peuvent que créer, mettre à jour ou résoudre des commentaires de revue et écrire les commentaires de résumé et d'état. Il n'existe aucun outil qui modifie des fichiers ou du code.
- **Aucun téléversement de télémétrie** : l'usage et le coût restent dans le journal local, sauf si vous le joignez vous-même comme artefact CI.

## Ce qu'il vous revient de configurer

- Utilisez les jetons au moindre privilège décrits dans [GitHub Actions](/fr/integrations/github-actions) et [Azure DevOps](/fr/integrations/azure-devops).
- Gardez la publication désactivée pour les pull requests venant de forks non fiables ([le cas des forks](/fr/integrations/github-actions#_4-le-cas-des-forks)).
- Laissez `privacy.redactSecrets` et `privacy.sendFullFiles` à leurs défauts.
- Choisissez un fournisseur dont les conditions de traitement des données conviennent à votre code (Azure et Bedrock gardent le trafic dans votre tenant cloud ; les API publiques ont leurs propres politiques de rétention).
