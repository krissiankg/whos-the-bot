# Who’s the Bot? — Sites

Version de publication du jeu bilingue. Le projet Next.js d’origine reste dans le dossier parent, sans changement de serveur.

## Architecture

- Vinext et le Worker Sites servent les pages et les routes /api/lobby et /api/admin.
- Supabase conserve les salons, le temps réel, les votes, les scores et l’exécution du bot.
- Aucun compte visiteur nécessaire : le site doit être public, avec sessions invitées HttpOnly.
- Le secret WTB_ADMIN_BRIDGE_TOKEN reste côté serveur ; aucune clé IA dans le bundle du navigateur. Les clés des modèles restent dans Supabase Vault et le tableau de bord existant.

## Développement

Installer avec le script install-dependencies.mjs du plugin Sites. Depuis ce dossier, lancer Node avec --env-file=../../.env.local puis scripts/run-framework.mjs dev. Les variables locales ne sont jamais synchronisées dans le dépôt.

Les tests HTTP du projet parent acceptent TEST_BASE_URL pour vérifier cette version. Ne pas publier le dossier parent, les fichiers .env, .admin-install.local, les caches ou les données de test.
