---
layout: home

hero:
  name: air-review
  text: Revue de code par IA, contextuelle, pour vos pull requests
  tagline: Un outil en ligne de commande qui lit un changement comme le ferait un collègue senior, vérifie ses constats contre le code, et se souvient de ce qu'il a déjà relu. Fonctionne sur GitHub et Azure DevOps avec n'importe quelle API de modèle compatible OpenAI.
  actions:
    - theme: brand
      text: Démarrer
      link: /fr/guide/getting-started
    - theme: alt
      text: Intégrer dans votre pipeline
      link: /fr/integrations/microsoft-foundry

features:
  - icon: 🔍
    title: Contextuel, pas juste un diff
    details: Avant tout appel au modèle, le planificateur sélectionne des fichiers existants du même type, l'API exportée des modules importés et un profil du dépôt en un paragraphe. Le modèle voit comment votre dépôt fait déjà les choses.
  - icon: ✅
    title: Vérifié avant publication
    details: Des règles déterministes traitent ce que le logiciel peut décider exactement. Un second appel, moins cher, revérifie chaque constat contre le vrai code et écarte ce qu'il ne peut pas prouver. Le code de sortie 10 bloque la fusion.
  - icon: 🔁
    title: Incrémental, avec une mémoire dans la pull request
    details: L'état de la revue vit dans les commentaires ou les fils de la PR, jamais sur un serveur. Les pushs suivants sont incrémentaux, les constats gardent leur identité quand le code bouge, et rien n'est relu deux fois.
---
