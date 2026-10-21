# NVIDIA Build — vérification du 17 octobre 2026

## Changements

- Fournisseur privé partagé entre les deux fonctions : `NVIDIA_API_KEY`, sélection explicite `BOT_PROVIDER=nvidia`, modèle `nvidia/nemotron-3.5-lightning-30b-a3b`, endpoint NVIDIA Chat Completions fixe.
- OpenAI reste optionnel et n’est pas utilisé comme repli automatique en cas d’erreur NVIDIA.
- Raisonnement NVIDIA désactivé, sortie plafonnée, aucune trace de raisonnement ni appel d’outil publié.
- Module de fournisseur inclus dans les deux bundles ; chemins d’entrée préservant l’arborescence. Worker `game-bot` version **3**, passerelle `game-lobby` version **4**, tous deux actifs.
- Interface de configuration manquante, tutoriel et confidentialité adaptés aux deux fournisseurs ; mention explicite du traitement des données NVIDIA et de la restriction de l’offre gratuite aux essais internes.
- Aucune nouvelle dépendance ni modification du schéma de base de données.

## Résultats

- **14 tests Node réussis**. Les tests du vrai code worker exécutent son handler avec un transport simulé et des clés factices : appel NVIDIA-only, réponse finale, refus d’une capacité invalide, erreur 429 sans retry ni repli OpenAI, clé NVIDIA absente sans repli OpenAI, compatibilité de l’alternative OpenAI.
- TypeScript : `tsc --noEmit --incremental false --pretty false`, sortie **0**. La première exécution incrémentale a été trop lente ; la vérification non incrémentale termine normalement.
- Test de la passerelle publique réelle `test-core-public.mjs` après déploiement : sortie **0**, protection des phases, démarrage hôte uniquement, `_aiReady` non falsifiable, worker non utilisable comme proxy IA public. Une première tentative a dépassé le délai pendant la compilation locale ; l’essai suivant passe après compilation.
- SQL de vérification : schéma privé inaccessible au rôle `anon`, RPC de contrôle du bot privé, cron inchangé à 10 secondes.
- HTTP **200** sur `/`, `/privacy` et `/how-to-play` ; les pages confidentialité et règles contiennent les libellés NVIDIA attendus. Le tutoriel affiche le nouveau texte uniquement après ouverture de cette étape, pas dans le HTML initial de l’accueil.

## Limites restantes

Aucune vraie clé NVIDIA n’a été fournie ou créée. Aucun appel réel au modèle ni consommation de crédit n’a été effectué. Il reste à enregistrer la clé côté Supabase et valider une réponse puis une manche réelle. Le statut de configuration ne garantit ni validité de la clé ni quota disponible. Pas de nouvelle vérification visuelle dans le navigateur, ni de nouveau build de production pour ce patch ciblé ; le contrôle TypeScript et les réponses HTTP ont été effectués.

Les conditions NVIDIA consultées réservent l’offre gratuite aux essais/évaluations internes : cette intégration ne valide pas l’usage en production ni l’éligibilité du jeu au concours. Consignes et sources officielles dans [NVIDIA_SETUP.md](NVIDIA_SETUP.md).
