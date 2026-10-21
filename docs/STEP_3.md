# Étape 3 — cœur jouable

Le code et les fonctions Supabase couvrent désormais une manche : salon → chat de 180 secondes → vote privé de 30 secondes → révélation. Les scores, trois manches, le français et la carte de résultat restent à l’étape suivante. Le frontend reste local ; ne pas présenter cette étape comme une publication publique.

## Activation du vrai bot

**Mise à jour : OpenAI n’est plus obligatoire.** Pour utiliser une clé NVIDIA Build, suivre [NVIDIA_SETUP.md](NVIDIA_SETUP.md). Cette offre gratuite est réservée aux essais et évaluations internes, pas à une mise en production publique. Les étapes ci-dessous décrivent uniquement l’alternative OpenAI.

1. Créer une clé API OpenAI dans son propre projet API, avec facturation disponible. Ne jamais envoyer cette clé dans le chat ni la mettre dans une variable `NEXT_PUBLIC_`.
2. Ouvrir [les secrets des fonctions Supabase](https://supabase.com/dashboard/project/ayvfdycfkavoeqbkplex/functions/secrets).
3. Ajouter le secret **OPENAI_API_KEY** avec la clé. Le modèle par défaut est `gpt-4.1-mini-2025-04-14`. `OPENAI_BOT_MODEL` peut sélectionner ce modèle ou `gpt-4.1-mini` ; les autres modèles sont refusés tant que leur budget n’a pas été validé.
4. Recharger le salon : l’avertissement de configuration doit disparaître. Une clé présente mais invalide, sans crédit ou sans accès au modèle provoquera une interruption neutre de la manche. Le simple indicateur de présence d’une clé ne valide pas sa facturation.
5. Tester une manche complète avec de vrais messages et confirmer qu’une réponse du modèle apparaît. Cette vérification payante n’a pas été exécutée en l’absence de clé.

Le nom « OpenAI » désigne ici le fournisseur API ; un abonnement ChatGPT ne constitue pas la configuration de cette application. La clé reste dans les secrets Supabase, uniquement utilisée par `game-bot`.

## Lancer et essayer à deux fenêtres

Dans PowerShell :

```powershell
Set-Location 'C:\Users\krissiank\Documents\Github_cursor\Multiplayer Game'
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

Si le serveur tourne déjà, rafraîchir [localhost](http://localhost:3000/) suffit.

1. Fenêtre A : créer un salon et accepter le tutoriel qui annonce explicitement une IA.
2. Fenêtre B **privée/incognito**, autre profil ou autre appareil : rejoindre avec le même code. Deux fenêtres ordinaires d’un même profil partagent le cookie et donc la même place.
3. Cliquer **I’m ready** dans les deux fenêtres. L’hôte coche **Start an unranked two-human practice round**, puis **Start round**. Avec trois à six humains, pas de case pratique requise ; tous doivent être prêts et connectés.
4. Les deux fenêtres voient les mêmes nouveaux pseudonymes, le même sujet et un compte à rebours de trois minutes. Envoyer un message depuis chaque fenêtre ; attendre des réponses du bot. Aucune étiquette ne doit le distinguer.
5. À la fin : composer désactivé et vote pendant 30 secondes. Impossible de voter pour soi ou de modifier un vote confirmé. La fenêtre B ne doit pas voir le vote d’A avant la révélation.
6. Après le délai : identité du bot et votes humains, avec « Abstained » pour un vote manquant. Cette version finit après une seule manche, sans score.
7. Dans un nouveau salon, signaler un message avec le drapeau : son auteur n’est pas expulsé automatiquement ; le signalement apparaît chez l’hôte. Retirer un participant pendant le jeu annule la manche sans révélation, que la cible soit humaine ou IA.
8. Recharger B : même place et messages retrouvés. Pour simuler une vraie perte de connexion, fermer B ; le serveur détecte l’absence après environ 25 secondes, puis accorde jusqu’à 60 secondes de reconnexion. L’hôte absent est remplacé après environ 40 secondes. Les onglets en arrière-plan peuvent être ralentis par le navigateur.

Sans clé, le salon fonctionne et explique pourquoi **Start round** reste désactivé. Pour essayer seul et sans frais, ouvrir [le mode développeur](http://localhost:3000/?dev=1), qui reste explicitement une simulation locale avec personnages scriptés. Il ne teste pas le fournisseur IA.

## Serveur, confidentialité et délais

- `game.participants` crée des identifiants de manche et redistribue les pseudonymes pour tous, y compris le bot. Le lien vers les places du salon reste privé ; le navigateur n’obtient ni rôle bot, ni identifiant de l’hôte dans la liste active, ni votes d’autrui avant la révélation.
- Les délais sont stockés dans Postgres et vérifiés sous verrou du salon. Les requêtes font avancer les phases à la demande ; la tâche SQL de sécurité tourne toutes les **10 secondes**, jamais toutes les secondes. Le timer du navigateur est seulement un affichage.
- Le vote garde sa durée entière même si tous les humains ont voté. Aucun compteur de votes par participant ne permet d’identifier celui qui ne vote jamais.
- Une suppression volontaire pendant le jeu annule la manche. Une déconnexion peut se rétablir pendant la pause ; après expiration de la grâce, pas de score ni de révélation.
- Les nouvelles tables `participants`, `ballots` et `bot_jobs` sont privées, RLS activée sans politique ouverte. La fonction Edge reste la seule passerelle autorisée. Les autres tables préparées à l’étape 2 sont conservées.
- Les messages, signalements, votes et travaux IA suivent la suppression en cascade du salon à création + 24 heures. Aucun contenu de chat n’est écrit dans les journaux applicatifs. Les prestataires gardent leurs propres politiques de logs et sauvegardes.

## Bot indépendant de l’hôte

`game.maintain_lobbies()` crée et distribue au maximum quatre travaux par tick via `pg_net`. Chaque invocation porte une capacité aléatoire à usage unique, vérifiée par le RPC privé `bot_job_command`. L’endpoint n’accepte ni prompt ni modèle fourni par un navigateur. Les réponses HTTP du worker sont vides, sans contenu ni secret.

Le worker réclame le travail atomiquement, réserve le budget, transmet le prompt et les 12 derniers messages au modèle, vérifie le résultat, puis programme une publication après un délai aléatoire de 2–8 secondes. Le balayage SQL effectue la publication : sa fréquence ajoute jusqu’à un tick de délai, puis le rafraîchissement client peut ajouter un autre tick. Le délai apparent n’est donc pas garanti à 2–8 secondes de bout en bout. Les messages humains utilisent les notifications Realtime ; le heartbeat authentifié de dix secondes récupère aussi les messages du bot et les changements planifiés.

Pas de relance automatique d’un appel modèle : une erreur, un travail expiré, une réponse refusée ou un budget épuisé annule la manche avec un message neutre, sans révéler le bot. Les tests de panne ne doivent jamais exposer les messages d’erreur du fournisseur aux joueurs.

## Limites et coût

- Humains : 280 caractères, un envoi toutes les deux secondes, 15 messages/minute et 40/manche. UUID d’envoi pour éviter les doublons sur nouvelle tentative.
- Modèle : six appels maximum/manche, 80 tokens maximum en sortie, 180 caractères maximum publiés, contexte + prompt plafonnés à 10 000 octets UTF-8, aucun outil.
- Plafonds de manches : six/heure par invité créateur, six/salon et vingt par groupe réseau. Les limites réseau restent approximatives avec un proxy ou des appareils partageant une connexion.
- Réservation globale de **0,005 USD/appel**, jamais remboursée en cas d’échec : maximum 200 réservations par fenêtre fixe de 24 heures démarrant à la première réservation, soit **1 USD de budget applicatif réservé par fenêtre**. Ce n’est pas un plafond sur toute période glissante : deux fenêtres peuvent être consommées autour d’une frontière. Ce plafond vise uniquement les appels de ce bot, pas les autres usages d’une même clé ni les coûts d’hébergement. Revalider les prix avant de modifier le modèle ou la taille du contexte ; cette réservation est conservatrice avec les tarifs consultés, pas un engagement du fournisseur.
- Filtre élémentaire anglais/français sur les messages humains et IA, sujets issus d’une liste approuvée, signalements et exclusion par l’hôte. Ce n’est pas une modération exhaustive ni une garantie contre toutes les variantes d’injures ou d’injection.

Les requêtes de l’alternative **OpenAI** utilisent `store:false`. Cela désactive le stockage applicatif des réponses, **pas nécessairement les logs de surveillance d’abus**. Voir les [contrôles de données OpenAI](https://developers.openai.com/api/docs/guides/your-data), [Responses](https://developers.openai.com/api/docs/guides/text), et [le modèle et ses tarifs](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Pour NVIDIA, le format Chat Completions et les conditions de l’essai sont différents : voir [NVIDIA_SETUP.md](NVIDIA_SETUP.md). Les prix et politiques doivent être revérifiés avant une diffusion publique.

## Fichiers et redéploiement

- Prompt éditable : `prompts/hidden-player.system.md`, jamais importé par le frontend.
- Source SQL : `supabase/sql/playable-core.sql`, migration distante `playable_core` déjà appliquée. Ne pas la relancer : elle renomme l’ancienne passerelle. La migration suivante `pg_net_extension_schema` place l’extension dans `extensions` ; sa recréation n’a supprimé aucune donnée car files et réponses étaient vides.
- Worker : `supabase/functions/game-bot/index.ts` et `policy.mjs`.
- Correctifs appliqués : `bot_queue_cooldown` respecte le délai entre deux interventions et annule les files trop anciennes ; `bot_output_guard` refuse aussi le vocabulaire de rôle dans la sortie du bot. Les sources dédiées sont conservées dans `supabase/sql/` ; `playable-core.sql` reflète la définition finale, ce ne sont pas des scripts à rejouer tous à la suite sur une base déjà migrée.
- `scripts/function-files.mjs` prépare les fichiers à transmettre au déploiement MCP. Pour `game-bot`, il transforme le Markdown en module serveur `system-prompt.ts` au moment du déploiement. Le fichier local de même nom est volontairement un emplacement vide, refusé par les contrôles ; **ne pas déployer le worker directement avec ce placeholder**.
- Pour changer le prompt, reconstruire les fichiers avec `functionFiles('game-bot')`, puis transmettre les quatre fichiers retournés à l’outil Supabase de déploiement, avec `entrypoint_path: game-bot/index.ts`. La passerelle utilise `game-lobby/index.ts` et deux fichiers. Conserver `verify_jwt:false` : l’authentification repose ici sur la capacité privée à usage unique, pas sur un utilisateur Supabase Auth.

## Tests

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run test:lobby
& 'C:\Program Files\nodejs\npm.cmd' run test:core
```

`test:lobby` et `test:core` nécessitent le serveur local et le projet Supabase configuré. Ils utilisent des salons jetables et n’appellent pas le modèle. `test:core` vérifie notamment qu’un navigateur ne peut pas falsifier la présence de la clé.

Exécuter `supabase/tests/playable-core.sql` dans l’éditeur SQL / outil SQL du **projet de test** pour les règles transactionnelles. Ce script utilise réellement le rôle serveur `service_role`, contrôle les votes, délais, reprises, budget, signalements et cascades, puis annule toute la transaction. Il ne fait pas d’appel IA ni de publication HTTP. Les scénarios de vote sont donc vérifiés côté moteur sans prétendre constituer une vraie partie humaine.

Pour le build, arrêter le serveur dev avant `npm run build` ; ne pas partager `.next` entre build et dev simultanément. Les tests de score seront ajoutés avec l’étape 4.
