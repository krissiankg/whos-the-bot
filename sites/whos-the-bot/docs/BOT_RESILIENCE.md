# Reprise bornée de l’IA — 20 octobre 2026

La première version arrêtait toute la manche dès qu’un appel ou une réponse IA échouait. Le traitement distingue maintenant les causes, sans enregistrer de discussion ni de secret dans les journaux.

- Une réponse invalide, filtrée ou temporairement indisponible est ignorée. Le prochain travail attend 8 secondes, ou 20 secondes après une limite fournisseur.
- Un travail n’est jamais exécuté deux fois. Le plafond reste de 6 travaux par manche et 200 réservations par fenêtre de 24 heures, échecs compris. Aucun repli vers OpenAI et aucune augmentation des limites.
- Trois échecs consécutifs arrêtent la manche. Une clé refusée, une configuration invalide ou le budget épuisé provoquent un arrêt immédiat. Une manche sans aucun message IA publié n’entre pas en vote.
- Les réponses complètes trop longues peuvent être raccourcies à une phrase ou un mot entier (180 caractères maximum). Les sorties tronquées par le fournisseur, les raisonnements et les refus ne sont jamais publiés. Le filtre SQL reste obligatoire.
- Les délais de discussion/vote et de reconnexion restent 180/30/60 secondes. Les changements de phase restent pilotés par échéance et avance paresseuse, avec le cron existant.
- Le diagnostic privé ne conserve que le code d’échec et les dates dans le travail, supprimé avec le salon sous 24 heures. Les journaux techniques contiennent un identifiant de travail, un fournisseur, une catégorie et une durée, jamais la capacité d’accès, une clé, une requête, une réponse IA ou une discussion. Les journaux de l’hébergeur suivent sa rétention propre.
- Le motif public n’apparaît qu’après une annulation ; il ne désigne jamais un joueur. Les manches interrompues ne révèlent ni identités ni votes et ne donnent aucun point.

## Sources et déploiement

supabase/sql/bot-resilience.sql est la mise à jour additive après three-rounds.sql. supabase/functions/game-bot/index.ts et policy.mjs sont le serveur ; prompts/hidden-player.system.md reste le prompt éditable. scripts/function-files.mjs construit les fichiers de déploiement sans lire de secrets. Les sources Deno sont exclues du contrôle TypeScript Next.js et compilées par Supabase.

La fonction conserve son authentification par capacité de travail ; aucune permission publique de base n’est ajoutée. Les clés et le mot de passe administrateur restent inchangés. Les informations RLS « sans politique » des tables privées sont volontaires : aucun navigateur ne peut les lire. [Référence du contrôle RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Vérification

- Tests unitaires du véritable traitement avec réseau simulé, sorties longues, quotas, diagnostic sans secrets et absence de repli payant.
- Tests SQL transactionnels de reprise, délai de frappe, répétition des capacités, trois échecs, limites, confidentialité, déconnexion, règles, votes et scores ; les fixtures sont annulées sans appel modèle.
- Rendu serveur du véritable écran d’interruption dans les deux langues.
- scripts/test-live-match.mjs exige ALLOW_LIVE_AI_TEST=1 et l’URL publique explicite dans TEST_BASE_URL. Il crée trois sessions temporaires et vérifie trois manches avec les vrais délais, le fournisseur sélectionné, les votes, les scores et le classement. Il libère ses places à la fin ; ne pas l’exécuter sans accepter jusqu’à 18 appels IA.

Un ancien salon interrompu n’est pas réécrit ni relancé automatiquement. Créer un nouveau salon pour tester la correction.

## Résultat du contrôle réel

Le 20 octobre 2026, une partie classée en français a été terminée sur le site public avec trois sessions HTTP indépendantes (pas trois personnes physiques) et le véritable fournisseur NVIDIA sélectionné. Les échéances normales ont été conservées.

- Manche 1 : 5 messages IA publiés ; votes, révélation et points vérifiés.
- Manche 2 : 3 messages IA publiés. Deux sorties filtrées et une sortie incomplète ont été écartées sans annulation ; votes, révélation et points vérifiés.
- Manche 3 : 5 messages IA publiés ; votes, révélation, points et classement final à trois joueurs vérifiés.
- Les places du test ont été libérées. Aucun ancien salon utilisateur n’a été relancé, effacé ou modifié.
- 41 tests unitaires du projet local et 35 tests de la version Sites passent, ainsi que les contrôles TypeScript des deux versions. Quatre suites SQL transactionnelles passent : reprise, cœur du jeu, trois manches, bilinguisme.
- Les tests HTTP de protection de l’administration, du cœur du jeu et de navigation FR/EN passent. Le contrôle des 107 artefacts compilés ne trouve aucun secret de liaison serveur ni clé modèle exposé.
