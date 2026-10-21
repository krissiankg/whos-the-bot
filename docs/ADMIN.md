# Tableau de bord du propriétaire

L’administration est intégrée à l’application à l’adresse [localhost:3000/admin](http://localhost:3000/admin). Les joueurs ne doivent pas s’y connecter et restent sans compte.

## Première ouverture

L’installation locale a une liaison serveur privée et un lien initial à usage unique. Ouvrir le lien contenu dans **`.admin-install.local`**, puis choisir et confirmer un mot de passe administrateur d’au moins 12 caractères. Ne pas communiquer ce mot de passe dans une conversation.

Le lien expire 24 heures après sa création et est consommé à l’enregistrement du mot de passe, pas à sa simple ouverture. Le fragment `#setup=…` n’est pas envoyé dans l’URL HTTP ; l’interface le retire immédiatement de la barre d’adresse. Si la page est rechargée avant la création du mot de passe, rouvrir le lien d’installation. Après configuration, utiliser simplement `/admin` et son mot de passe. Le code d’installation ne fonctionne plus.

Le fichier d’installation et `.env.local` sont ignorés par Git. Ne pas les publier ni les partager. Aucun mot de passe administrateur n’a été choisi par l’agent : le propriétaire doit le définir lui-même.

## Enregistrer et choisir les clés

1. Se connecter à `/admin`.
2. Dans la fiche **NVIDIA Build**, coller la clé NVIDIA puis cliquer **Enregistrer**.
3. Dans la fiche **OpenAI**, coller la clé OpenAI quand elle sera disponible, puis **Enregistrer**. Cette action ne supprime pas NVIDIA.
4. **Tester la connexion** vérifie l’accès au modèle sélectionné avec un vrai petit appel, après confirmation explicite. Un appel peut consommer des crédits ou être payant ; aucune requête de test n’est lancée automatiquement à la sauvegarde.
5. **Utiliser NVIDIA Build** ou **Utiliser OpenAI** choisit le fournisseur actif après confirmation des conditions/coûts. L’autre clé est conservée. Il n’y a pas de bascule automatique en cas de panne.

Une clé enregistrée n’est jamais réaffichée. Le champ « Remplacer la clé » vide conserve la clé existante ; il ne l’efface pas. On peut désactiver l’IA sans supprimer les clés. Les liens « Obtenir une clé » ouvrent le site du fournisseur : le tableau de bord enregistre une clé créée chez le fournisseur, il ne la crée pas à sa place.

Les configurations déjà présentes dans les secrets Supabase continuent de fonctionner. Une clé ajoutée dans le tableau de bord remplace celle de ce fournisseur pour l’application, sans supprimer les variables externes. Le choix du tableau de bord a priorité sur `BOT_PROVIDER`. La désactivation explicite ne réactive pas une ancienne clé de secours.

## Tester le jeu à deux fenêtres

Le serveur est déjà lancé. Pour le relancer :

```powershell
Set-Location 'C:\Users\krissiank\Documents\Github_cursor\Multiplayer Game'
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

1. Dans la fenêtre normale, définir l’accès administrateur puis enregistrer, tester et sélectionner un fournisseur.
2. Ouvrir `/admin` dans une fenêtre privée : elle doit demander le mot de passe, sans montrer les clés ni les réglages privés. Se déconnecter dans la fenêtre normale doit révoquer sa session.
3. Dans la fenêtre normale, créer un salon depuis l’accueil ; le rejoindre en fenêtre privée. Les deux joueurs deviennent prêts, l’hôte choisit la pratique à deux et démarre une manche.
4. Vérifier chat de trois minutes, vote privé de trente secondes et révélation. Cette vérification réelle attend une clé valide saisie par le propriétaire.

Le choix est global pour ce projet et ses prochains appels ; ce n’est pas un réglage propre à chaque joueur. Éviter de changer ou désactiver le fournisseur pendant une manche, sinon elle peut être interrompue sans révélation.

## Sécurité et conservation

- Clés chiffrées au repos dans **Supabase Vault**, deux entrées distinctes. Les réponses publiques et administrateur ne contiennent ni clé enregistrée, ni identifiant Vault, ni hash de mot de passe.
- Le worker et la passerelle lisent la configuration via un RPC réservé au rôle serveur. Les navigateurs ne peuvent pas le déclencher directement avec la clé publique Supabase.
- Liaison Next.js → Edge authentifiée par `WTB_ADMIN_BRIDGE_TOKEN`, secret serveur généré à l’installation ; seule son empreinte est stockée dans la base.
- Mot de passe SHA-256 puis bcrypt avec sel et coût 12 ; la pré-empreinte évite la troncature bcrypt sur les mots de passe Unicode longs.
- Sessions aléatoires de huit heures, stockées sous forme d’empreinte dans la base ; cookie HttpOnly, SameSite Strict, Secure en HTTPS, limité au chemin `/api/admin`. Déconnexion et expiration révoquent l’accès.
- Protection d’origine sur les écritures, limites de tentatives, HTTPS obligatoire sauf `localhost`/boucle locale, protection anti-intégration en iframe. L’administration via HTTP sur une adresse réseau locale est refusée.
- Les clés et réglages du propriétaire sont persistants et **distincts des salons** supprimés après 24 heures. Les sessions admin expirées sont supprimées par la tâche de maintenance existante toutes les dix secondes.
- Les tests de connexion comptent dans le plafond global d’appels. La sauvegarde seule n’appelle aucun fournisseur.

## Publication future

La page reste une partie du frontend local pour le moment. Lors de son hébergement, configurer **`WTB_ADMIN_BRIDGE_TOKEN`** côté serveur de l’hébergeur avec la valeur du fichier local ignoré, en plus des deux réglages Supabase publics habituels. Ne jamais préfixer cette variable par `NEXT_PUBLIC_`. Aucune clé d’administration Supabase n’est nécessaire dans Next.js. HTTPS est requis hors boucle locale.

Ne pas remplacer la liaison serveur en base sans mettre à jour le serveur correspondant. Ne pas réinitialiser le mot de passe ou le code d’installation automatiquement si un administrateur existe déjà. Une perte de mot de passe exige une récupération contrôlée via le propriétaire du projet Supabase.

L’offre NVIDIA Build gratuite est réservée aux essais/évaluations internes et n’autorise pas la production publique selon les conditions consultées. Le tableau de bord n’en change pas les conditions et ne garantit pas la conformité au règlement du concours. Voir [NVIDIA_SETUP.md](NVIDIA_SETUP.md).

## Fichiers et tests

- UI : `src/components/admin-dashboard.tsx`, page `/admin`.
- Passerelle privée : `/api/admin`, `supabase/functions/game-admin/index.ts`.
- Configuration partagée : `supabase/functions/_shared/provider-runtime.mjs`.
- Schéma : migration distante `admin_dashboard`, source `supabase/sql/admin-dashboard.sql`.
- Tests : `npm test`, `npm run test:admin` avec serveur local, et `supabase/tests/admin-dashboard.sql` dans le projet de test. Les tests SQL sont entièrement annulés et ne consomment pas le lien initial réel.

Les sources préservent les clés OpenAI/NVIDIA existantes. L’installation ne renseigne aucune vraie clé API et ne choisit aucun mot de passe à la place du propriétaire.
