# Validation — bilinguisme et partie complète

Contrôles effectués le 18 octobre 2026.

## Validé

- 37 tests unitaires réussis : règles de score, majorité stricte, égalités, entraînement sans points, projection privée de la carte, traductions et protections du bot.
- Vérification TypeScript réussie et compilation de production réussie.
- Quatre suites HTTP réussies contre le serveur de production local : langues, salons et Realtime, règles du cœur de jeu, protection du tableau de bord.
- Scénarios SQL transactionnels réussis : trois manches avec scores, absence de double comptage, continuation idempotente, refus de quatrième manche, entraînement, annulation et expiration. Les données de ces scénarios sont annulées par rollback.
- Parcours visuel en mode développeur : trois manches, classement avec égalités et carte française générée en 1080 × 1200 pixels. Pas de débordement horizontal observé sur le petit écran testé.
- Fonctions Supabase et migrations de cette étape appliquées au projet whos-the-bot de l’organisation Test.

## Limites et validation restante

- Aucun fournisseur IA activé avec une clé utilisable lors des essais. Aucun appel à un modèle réel et aucun essai de facturation effectué. Le mode développeur utilise des joueurs et messages scriptés.
- Le fichier SQL de test intégral a rencontré des délais du connecteur ; les scénarios transactionnels plus courts ont été exécutés séparément. Ne pas assimiler cela à une exécution réussie de tout le fichier.
- Les tests HTTP créent des salons temporaires sans siège actif à la fin ; ils expirent automatiquement.
- Avant publication : activer un fournisseur dans /admin, puis effectuer la liste de validation avec trois personnes dans STEP_4.md. Ne jamais partager une clé dans le chat.
- Le site web n’a pas été publié sur une URL publique pendant cette étape.

Les commandes de lancement et la procédure à deux fenêtres sont dans [STEP_4.md](STEP_4.md).
