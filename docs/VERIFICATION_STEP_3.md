# Vérification de l’étape 3 — 17 octobre 2026

## Réussi

- Build de production Next.js 16.4.2 avec Webpack, vérification TypeScript, génération des pages et collecte des traces : sortie 0.
- Cinq tests Node : prompt Markdown réellement assemblé, limites de modèle/contexte/tokens, séparation des instructions et messages, extraction des réponses complètes, constantes et affichage des délais.
- **71 assertions SQL**, exécutées avec `service_role` et `plpgsql.check_asserts=on`, dans une transaction annulée : deux humains en pratique, trois humains en partie normale, un seul bot, identité de manche distincte, reconnexion, isolation, anti-spam, signalements, génération à usage unique, délai aléatoire, publication unique et cooldown, transitions tardives, vote privé/unique/sans auto-vote, abstention, révélation, pause/reprise, transfert d’hôte, exclusion uniforme, panne/refus/budget, droits d’accès et suppression en cascade.
- `scripts/test-lobby.mjs` contre le vrai frontend local et Supabase : cookies, création idempotente, états partagés, Realtime, capacité concurrente, exclusion, départ et droits RPC. Sortie 0.
- `scripts/test-core-public.mjs` : actions refusées hors phase, démarrage réservé à l’hôte, impossibilité de falsifier `_aiReady`, capacité worker invalide sans données retournées, RPC bot non accessible avec la clé publique. Sortie 0. Aucun appel modèle payant déclenché.
- Réponses HTTP 200 pour `/`, `/room/TEST`, `/privacy`, `/how-to-play`, avec les nouveaux libellés attendus.
- Worker `game-bot` déployé, version 2 ; passerelle `game-lobby`, version 3.
- Migrations distantes : `playable_core`, `pg_net_extension_schema`, `bot_queue_cooldown`, `bot_output_guard`. Les sources SQL correspondantes sont conservées dans `supabase/sql/` ; la source `playable-core.sql` reflète aussi les corrections finales.
- Cron de maintenance : toutes les 10 secondes, trois derniers passages observés réussis. Extension `pg_net` dans `extensions`. Tables privées non accessibles aux rôles navigateur.
- Advisor performance sans avertissement. Advisor sécurité : uniquement les dix informations intentionnelles [RLS activée sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) pour les tables privées, sans politique ouverte aux navigateurs. L’avertissement d’extension dans `public` a été corrigé en recréant `pg_net` après confirmation de files et réponses vides ; aucune donnée n’a été perdue.

## Non vérifié / activation requise

- `OPENAI_API_KEY` est absent des secrets Supabase : `aiAvailable=false`, le démarrage réel reste bloqué. Ne pas présenter une conversation scriptée comme un test du modèle réel.
- Un appel OpenAI réel, sa facturation, son comportement conversationnel et la chaîne complète cron → génération → publication doivent être vérifiés après ajout de la clé. Les tests SQL simulent une réponse courte au niveau du RPC, sans appeler le fournisseur.
- Pas de vérification visuelle des nouveaux écrans actifs dans un navigateur ni de vraie partie avec trois personnes à cette étape. Le build, les tests moteur et les réponses HTTP ne remplacent pas cette validation.
- Scoring, français, trois manches, classement et carte de résultat restent à l’étape 4. Déploiement public du frontend à l’étape 5.

Le serveur de développement a été redémarré sur `http://localhost:3000/` après le build. Instructions d’activation et test à deux fenêtres dans [STEP_3.md](STEP_3.md).
