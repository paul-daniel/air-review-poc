# Codes de sortie

`air-review` suit un contrat de codes de sortie fixe, pour qu'un pipeline distingue une barrière échouée d'une installation cassée.

| Code | Signification                      | Ce que le pipeline doit faire                                          | Première chose à vérifier                                                       |
| ---- | ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `0`  | revue terminée, barrière passée    | continuer                                                              | –                                                                               |
| `10` | revue terminée, barrière échouée   | faire échouer la vérification : des constats bloquants restent ouverts | les constats dans la sortie ; `review.gate` dans la configuration               |
| `20` | configuration invalide             | faire échouer le job comme erreur d'infrastructure                     | `air-review doctor` ; identifiant de preset ; URL du point de terminaison       |
| `30` | fournisseur ou modèle indisponible | faire échouer le job comme erreur d'infrastructure                     | variable de clé, URL de base, nom de modèle ou de déploiement, limites de débit |
| `40` | échec SCM ou API                   | faire échouer le job comme erreur d'infrastructure                     | portée et mappage du jeton, numéro de PR, permissions                           |
| `50` | défaillance interne du moteur      | faire échouer le job ; la signaler                                     | relancer avec `--json`, ouvrir un ticket avec la sortie                         |

## Ce qui fait échouer la barrière

Une exécution sort avec `10` quand au moins un constat **ouvert** a une sévérité listée dans `review.gate.severities` (défaut `BLOCKER`, `CRITICAL`) **et** une confiance au moins égale à `review.gate.minimumConfidence` (défaut `0.6`). Tout le reste est rapporté mais ne bloque pas. Les constats déterministes (secrets, fuites d'abonnements) portent leur propre confiance, et un secret détecté est un `BLOCKER`.

Pour changer la politique :

```bash
air-review config set review.gate.minimumConfidence 0.65
air-review config set review.gate.severities '["BLOCKER"]'
```

## Dans un pipeline

- **Azure Pipelines** : une sortie non nulle fait échouer l'étape ; en politique de validation de build avec **Policy requirement : Required**, `10` bloque la pull request. Utilisez **Optional** pendant un essai.
- **GitHub Actions** : une sortie non nulle fait échouer le job et la vérification ; ajoutez `continue-on-error: true` à l'étape pendant un essai.
- **Bitbucket, GitLab** : une sortie non nulle fait échouer le job ; `allow_failure: true` (GitLab) ou un `|| true` en fin de script la rend consultative.

`doctor` sort avec le code du pire problème trouvé (`30`, `40`, `20`), ce qui le rend utilisable comme étape de pré-vol.
