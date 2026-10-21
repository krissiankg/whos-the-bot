# Administration — vérification du 17 octobre 2026

- Build de production Next.js 16.4.2 / Webpack : compilation, TypeScript, génération des huit pages et traces, sortie 0. Routes `/admin` et `/api/admin` présentes.
- Vérification TypeScript non incrémentale : sortie 0.
- **24 tests Node réussis**, dont le véritable handler Next.js exécuté avec transport simulé : origine exacte, cookies HttpOnly/SameSite Strict/Secure en HTTPS, jeton absent du JSON, échec de connexion sans session autorisée, déconnexion, configuration de fournisseur indépendante, absence de repli payant et réponse administrateur sans secret.
- **30 assertions SQL réussies avec le rôle `service_role`** dans une transaction annulée : installation réservée au lien initial, mot de passe haché, lien à usage unique, deux entrées Vault distinctes, chiffrement au repos, conservation d’une clé à l’enregistrement/remplacement/activation de l’autre, champ vide conservant la clé, sélection réelle du runtime, désactivation, authentification, durée de session, déconnexion et refus des rôles navigateur.
- Test HTTP réel `test:admin` : sortie 0 ; seules les métadonnées d’installation sont disponibles sans session, écritures privées refusées, protection d’origine, anti-framing, RPC privés et absence de passerelle Edge accessible sans liaison serveur.
- Tests HTTP réels `test:core` et `test:lobby` : sorties 0 après redéploiement, y compris Realtime et capacité concurrente.
- `/admin` HTTP 200, titre attendu, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. `/api/admin` retourne uniquement `{initialized:false,authenticated:false}` tant que le propriétaire n’a pas défini son mot de passe.
- Migration distante `admin_dashboard` appliquée. Fonctions actives : `game-admin` version 1, `game-bot` version 4, `game-lobby` version 5.
- Advisor performance : aucun constat. Advisor sécurité : uniquement treize notices informatives [RLS activée sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), intentionnelles pour le schéma privé inaccessible aux navigateurs. Aucun droit public de lecture n’a été ajouté.
- Tâche de maintenance toutes les dix secondes : derniers passages observés réussis ; suppression des sessions administrateur expirées incluse.

## Installation et limites

Le pont privé a été provisionné avec un secret aléatoire dans `.env.local` et seulement son empreinte dans la base. Un lien de configuration à usage unique, valable 24 heures, est conservé dans `.admin-install.local`, ignoré par Git. Ni le secret du pont ni le lien ne sont intégrés au frontend.

Le propriétaire n’a pas encore choisi son mot de passe ; aucune vraie clé NVIDIA/OpenAI n’a été enregistrée par l’agent. Les tests ne consomment pas le lien initial du propriétaire et n’appellent pas les modèles réels. L’essai réel d’un fournisseur exige une clé valide et une confirmation dans le tableau de bord.

La tentative d’inspection visuelle via le navigateur intégré a expiré : aucun contrôle visuel interactif complet n’est revendiqué. Les preuves actuelles sont le build, les tests de sécurité/règles et les réponses HTTP, pas une validation de toute l’interface connectée dans un navigateur.

Les réglages du propriétaire persistent indépendamment des salons de 24 heures, conformément au besoin de conserver les deux clés. OpenAI reste pris en charge ; aucune ancienne clé d’environnement n’a été supprimée. Instructions dans [ADMIN.md](ADMIN.md).
