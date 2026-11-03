# Démarrage : votre dépôt relu par air-review en 30 minutes

Vous avez un dépôt sur Azure DevOps et des modèles sur Microsoft Foundry. À la
fin de ce guide, chaque pull request est relue, commentée, puis approuvée ou
renvoyée à son auteur, automatiquement. Vous n'avez pas besoin de savoir
comment l'outil fonctionne à l'intérieur. Quatre parties, chacune finit par une
vérification.

_English version: [docs/getting-started.md](../getting-started.md)._

## Partie 1 — Foundry : deux modèles et une adresse (10 min)

1. Ouvrez [ai.azure.com](https://ai.azure.com) avec l'interrupteur **New Foundry** activé.
2. Créez une ressource Foundry (ou réutilisez-en une). Notez son nom.
3. Dans **Discover → Models**, déployez **deux** modèles avec **Default settings** :
   - un petit, pour les changements simples et les vérifications (par exemple `gpt-5-mini` ou `claude-haiku-4-5`) ;
   - un fort, pour les gros changements (par exemple `gpt-5` ou `claude-sonnet-4-5`).
     Gardez les noms des déploiements : vous les saisirez en partie 3.
4. Dans la page **Overview** de la ressource, copiez l'adresse de la forme
   `https://<ressource>.services.ai.azure.com` et, si vous préférez une clé à
   la connexion Azure, une **clé API**.

**Vérification :** les deux déploiements affichent **Succeeded** dans **Models + endpoints**.

## Partie 2 — Votre machine : un essai à blanc (5 min)

```bash
npm install -g github:paul-daniel/air-review-poc   # Node 22 nécessaire
cd votre-depot
az login                                            # ou : export AIR_REVIEW_API_KEY=<clé>
air-review init --provider azure-foundry --base-url https://<ressource>.services.ai.azure.com --ci azure-devops
```

Ouvrez le fichier `air-review.yaml` créé et mettez vos deux noms de
déploiement dans `models` (`reviewer`, `tiers.light.reviewer`,
`tiers.heavy.reviewer`, `triage`, `verifier`). Un déploiement Claude est
reconnu à son nom (`claude-…`) ; sinon écrivez-le `claude:<déploiement>`.

```bash
air-review doctor                        # tout est vert ?
air-review dry-run --base origin/main    # relit votre branche, ne publie rien
```

**Vérification :** `doctor` indique l'identifiant utilisé et teste chaque
déploiement ; `dry-run` affiche une ligne de routage (« light tier → … »), les
remarques et le coût. Commitez `air-review.yaml`.

## Partie 3 — Azure DevOps : la pipeline (10 min)

1. Copiez [examples/azure-pipelines.yml](../../examples/azure-pipelines.yml) à
   la racine de votre dépôt sous le nom `azure-pipelines.yml`. Remplacez les
   deux lignes `echo` par vos vraies commandes de build et de tests (ou supprimez-les).
2. **Pipelines → Library → + Variable group** nommé `air-review` avec :

   | Nom                                                    | Valeur                                                                 |
   | ------------------------------------------------------ | ---------------------------------------------------------------------- |
   | `AIR_REVIEW_PROVIDER`                                  | `azure-foundry`                                                        |
   | `AIR_REVIEW_BASE_URL`                                  | `https://<ressource>.services.ai.azure.com`                            |
   | `AIR_REVIEW_API_KEY` (cadenas)                         | la clé API, ou rien si vous activez l'étape de connexion Azure du YAML |
   | `AIR_REVIEW_MODEL_REVIEWER`                            | déploiement fort                                                       |
   | `AIR_REVIEW_MODEL_REVIEWER_LIGHT`                      | déploiement petit                                                      |
   | `AIR_REVIEW_MODEL_REVIEWER_HEAVY`                      | déploiement fort                                                       |
   | `AIR_REVIEW_MODEL_TRIAGE`, `AIR_REVIEW_MODEL_VERIFIER` | déploiement petit                                                      |

3. **Pipelines → New pipeline → Azure Repos Git → votre dépôt → Existing YAML file** → `azure-pipelines.yml` → Save (sans lancer).
4. **Project settings → Repositories → votre dépôt → Security** : sélectionnez
   **`<Projet> Build Service (<Organisation>)`** et mettez **Contribute to pull
   requests** sur _Allow_.
5. **Project settings → Repositories → votre dépôt → Policies → Branch policies → `main` → Build validation → +** : choisissez la pipeline, déclenchement _Automatic_, stratégie _Required_.

6. **Identifiants Foundry.** Sur une organisation d'entreprise avec des agents
   hébergés par Microsoft, préférez une **connexion de service Azure Resource
   Manager** (Project settings → Service connections → New → Azure Resource
   Manager, fédération d'identité) à une clé API : donnez à son identité le
   rôle **Azure AI User** sur la ressource Foundry et décommentez l'étape
   « Sign in to Azure » du YAML. Aucune clé à stocker ni à renouveler. Sur un
   agent auto-hébergé, le `az login` de l'agent suffit.
7. **Première exécution.** La première exécution s'arrête sur « This pipeline
   needs permission to access a resource » : ouvrez l'exécution, cliquez
   **View** puis **Permit** (pool d'agents, groupe de variables). Une fois par
   pipeline.

**Vérification :** aucune erreur à l'enregistrement. Si votre organisation n'a
pas encore d'agents hébergés (« No hosted parallelism »), demandez la
dotation gratuite ou installez un agent auto-hébergé (voir
[azure-devops.md](../azure-devops.md)). Une fois la stratégie attachée, `main`
ne change plus que par pull request, y compris pour le fichier de pipeline.

## Partie 4 — Première pull request (5 min)

Créez une branche, modifiez un fichier, poussez, ouvrez une pull request vers
`main`. Au bout de quelques minutes vous voyez :

- un commentaire **Air Review — …** avec le verdict en premier, quel modèle a relu et pourquoi, le tableau des remarques et le coût par étape (replié) ;
- un fil par remarque sur la ligne exacte, avec le correctif ;
- le vote du reviewer : _Waiting for author_ si quelque chose bloque, _Approved_ quand revue, build et tests sont verts ;
- le rapport d'exécution dans les artefacts de la pipeline.

Poussez une correction : seules les lignes modifiées sont relues, les fils
résolus reçoivent une réponse « Resolved », une correction partielle reçoit
l'étape suivante dans le même fil.

## Si quelque chose ne va pas

| Symptôme                                                           | Quoi faire                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `doctor` dit qu'il manque l'identifiant                            | `az login`, ou définissez `AIR_REVIEW_API_KEY`                                                               |
| la sonde de `doctor` échoue en 404                                 | le nom de déploiement dans `air-review.yaml` ne correspond pas au portail                                    |
| pipeline : HTTP 403 à la publication                               | étape 4 de la partie 3 (Contribute to pull requests)                                                         |
| pipeline : « No hosted parallelism »                               | demandez la dotation ou utilisez un agent auto-hébergé                                                       |
| la revue n'a rien trouvé sur un bug volontaire                     | regardez le tier dans la synthèse ; forcez `--tier heavy` une fois pour comparer                             |
| une remarque ne mérite pas de correction                           | mettez le fil sur **Resolved**, **Won't fix** ou **Closed** : l'outil le respecte et cesse de bloquer        |
| pipeline : « This pipeline needs permission to access a resource » | ouvrez l'exécution, **View**, **Permit** (première fois seulement)                                           |
| pipeline : Foundry 401 sans clé configurée                         | l'étape de connexion manque (connexion de service) ou l'agent n'a pas de `az login` ; voir partie 3, étape 6 |

Pour le reste : [azure-devops.md](../azure-devops.md), [foundry.md](../foundry.md), [observability.md](../observability.md).
