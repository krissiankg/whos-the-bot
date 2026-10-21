# Validation de la version Sites

## Liens « Comment jouer » — 20 octobre 2026

- Même erreur Vinext reproduite au clic sur « Comment jouer » : l’adresse reste sur / au lieu d’ouvrir /how-to-play. La correction précédente ne couvrait que les retours à l’accueil.
- Les liens de règles de l’en-tête et du pied de page utilisent maintenant la navigation HTML native, dans l’accueil et les salons. Les autres liens touchés par le même routeur (administration, confidentialité, invitation et démonstration) utilisent également des liens natifs, sans changer leur destination ni leur apparence.
- Quatre tests supplémentaires empêchent la réintroduction du routeur incompatible et contrôlent les destinations exactes. Le contrôle HTTP vérifie les deux liens de règles en FR et EN, sur l’accueil et l’écran de salon.
- Vérification de publication : cliquer séparément sur les liens de règles de l’en-tête et du pied de page, en français et en anglais ; vérifier aussi le retour à l’accueil et les liens de confidentialité et d’administration.
- Aucun changement de compte, de clé ou de configuration Supabase.

## Retour à l’accueil — 20 octobre 2026

- Défaut reproduit sur la version publiée : le lien « Retour au jeu » reste sur /admin et le routeur client Vinext signale une erreur de fonction lors du clic.
- Les retours à l’accueil partagent désormais HomeLink, un lien HTML natif vers /. Le logo et le nom sont dans le même lien cliquable. Le rechargement remet également à zéro les écrans de démonstration/tutoriel, même lorsqu’ils sont déjà sur /, et retire les paramètres de salon ou de mode développeur. Le cookie FR/EN reste conservé.
- Dix tests de non-régression vérifient le rendu du lien et son usage dans les neuf écrans concernés. Avec les quatre tests JSON existants : 14 tests réussis.
- Commandes dans ce dossier : node --experimental-strip-types --test tests/home-navigation.test.mjs tests/wire-json.test.mjs ; node node_modules/typescript/bin/tsc --noEmit.
- Le script scripts/test-navigation-public.mjs contrôle les documents et destinations des liens en français et anglais. Il ne remplace pas un test de clic dans le navigateur.
- Vérification manuelle après publication : depuis /admin, cliquer sur « Retour au jeu », puis tester séparément le logo et le texte du nom ; ouvrir le tutoriel, puis cliquer sur le logo et vérifier le retour à l’accueil sans paramètres.
- Aucun changement des clés, du mot de passe administrateur, de l’audience publique ni du stockage des parties.

## Validation initiale

18 octobre 2026.

- Projet Next.js original conservé ; dossier sites exclu de son contrôle TypeScript. Ses 39 tests et son contrôle TypeScript passent.
- Version Sites compilée avec le starter Vinext du plugin. Contrôle TypeScript réussi.
- Quatre tests supplémentaires de lecture des réponses JSON passent.
- 117 fichiers générés contrôlés : aucun secret de liaison serveur ou clé modèle intégré. Les identifiants réservés au serveur sont aussi exclus du client.
- Accueil et tutoriel français vérifiés dans le navigateur sur le Worker compilé.
- Tests HTTP locaux réussis : pages FR/EN, invités indépendants, langue du salon, droits de l’hôte, préparation, règles de démarrage, protection de l’administration et anti-CSRF.
- Les quatre suites HTTP passent aussi sur le site public : bilinguisme, salons et Realtime, cœur du jeu, administration. La suite complète de salon y valide notamment les exclusions, la reconnexion et le transfert d’hôte.
- Les tests distinguent le cookie invité des cookies techniques de Cloudflare. Deux tests unitaires supplémentaires couvrent cette distinction.
- Le décor de l’accueil est contenu horizontalement pour éviter un débordement sur écran intermédiaire.
- Aucun appel à un modèle réel. Le fournisseur IA est désactivé tant qu’aucune clé n’est activée par le propriétaire.

La version hébergée doit rester publique pour les invités, avec administration protégée. Les secrets sont configurés dans Sites, jamais dans le dépôt ni le manifeste. Les fichiers temporaires d’aperçu et de test sont ignorés et exclus de l’archive.
