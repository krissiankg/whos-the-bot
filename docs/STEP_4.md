# Jeu bilingue, scores et trois manches

## Fonctionnement

- FR / EN dans l’en-tête ; choix d’interface conservé 24 heures, avec langue du document et titres adaptés.
- L’hôte choisit séparément la langue de discussion avant le début. Le changement remet les humains en état « non prêt ». Les sujets, pseudos et consignes de l’IA suivent le salon ; les messages des humains ne sont jamais traduits automatiquement.
- Trois manches : discussion de 180 s, vote privé de 30 s, révélation. L’hôte lance la suivante. Un rechargement ou un double clic ne saute aucune manche.
- Bonne réponse : +1. Si plus de la moitié des humains éligibles accusent des humains, l’IA gagne et les humains les plus accusés perdent chacun 1 point. Les abstentions comptent dans le dénominateur. En entraînement à deux humains, aucun point.
- Scores calculés dans Postgres, une seule fois par manche. Une manche annulée n’attribue aucun point. Aucun score cumulé ni correspondance d’identité inter-manches n’est envoyé avant la fin.
- Classement final après trois manches, avec rangs partagés en cas d’égalité. Carte PNG et partage natif si disponible, sinon téléchargement. Aucune discussion ni code de salon dans la carte ; génération locale.
- Les résultats expirent avec le salon après 24 h. Les clés administrateur restent indépendantes, dans Vault.

## Lancer

Node 22 ou plus récent, dépendances installées et `.env.local` configuré (voir `ADMIN.md`).

```powershell
npm run dev
```

Ouvrir `http://localhost:3000/`. Pour une validation de production isolée d’un ancien build ou d’un serveur de développement :

```powershell
npm run verify:build
npm run verify:start
```

Ouvrir `http://localhost:3100/`. Ce parcours utilise `.next-validation`, réservé aux artefacts Next.js et ignoré par Git. Les commandes standard de build ne sont pas modifiées.

## Vérifier

```powershell
npm test
npm run typecheck
```

Dans un autre terminal, une fois le serveur lancé :

```powershell
$env:TEST_BASE_URL = "http://localhost:3100"
npm run test:languages
npm run test:lobby
npm run test:core
npm run test:admin
```

Les tests HTTP utilisent des invités et salons temporaires ; ils ne démarrent aucun appel au modèle. Les tests SQL `supabase/tests/bilingual.sql` et `supabase/tests/three-rounds.sql` sont transactionnels et annulent leurs données de test. Ne pas rejouer les anciens fichiers de schéma comme des migrations sur une base existante.

## Deux fenêtres

1. Fenêtre normale : FR, créer un salon français et lire le tutoriel.
2. Navigation privée ou autre navigateur : EN, rejoindre avec le code. Deux fenêtres partageant les cookies représentent le même invité.
3. Vérifier les mêmes participants et la même langue de discussion, avec des menus dans chaque langue.
4. L’hôte change la langue avant le début ; les invités la voient et doivent confirmer à nouveau leur préparation. L’invité ne peut pas la changer.
5. Cocher l’entraînement à deux, puis démarrer uniquement avec une IA activée et une clé valide. Aucun point ne sera attribué.
6. Échanger des messages, signaler un message, attendre le vote, voter et vérifier la révélation. Recharger : même place et même vote.
7. L’hôte passe aux manches 2 et 3. À la fin : classement, carte PNG, traduction FR / EN. En partie, un départ ou une exclusion annule la manche sans révéler l’IA.

Pour tester seul sans clé : en mode `npm run dev` seulement, ouvrir `http://localhost:3000/?dev=1`. Ajouter des humains simulés, passer à « Discussion », puis « Vote » et « Révélation ». Recommencer pour trois manches et exporter la carte. Les joueurs et votes sont explicitement scriptés ; cette option reste indisponible en production.

## Validation à trois vraies personnes avant publication

- Trois appareils et navigateurs indépendants ; chacun comprend le tutoriel sans explication orale.
- Même sujet, messages partagés, bot réel dans la langue du salon et chrono synchronisé.
- Aucun rôle IA ni vote d’autrui visible avant la révélation.
- Bonne réponse +1 ; majorité, pénalités et égalités conformes aux règles.
- Reconnexion, transfert d’hôte, pause sous deux humains connectés, annulation sans points.
- Fin après exactement trois manches ; réessais sans double score ; export sans conversation.
- Refus d’accès après expiration et nettoyage des salons, messages et scores.

La présence des consignes et tests du bot ne remplace pas un essai réel : il faut une clé valide, un fournisseur activé dans `/admin`, puis ce test humain. Ne jamais coller les clés dans le chat.
