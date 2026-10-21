# Who’s the Bot? 🤖

Un jeu multijoueur de déduction sociale : discutez avec des joueurs anonymes, puis essayez de trouver l’unique participant contrôlé par une IA.

**[Jouer en ligne](https://whos-the-bot.grassyhake7.chatgpt.site/)** · [Règles du jeu](https://whos-the-bot.grassyhake7.chatgpt.site/how-to-play) · [Confidentialité](https://whos-the-bot.grassyhake7.chatgpt.site/privacy)

La version publique de référence est la **version 7**, publiée le **20 octobre 2026** sur Sites. Le dépôt GitHub conserve le code et la documentation ; il ne fournit ni crédits IA, ni secrets, ni copie des discussions des joueurs.

## Le principe

1. Un hôte crée un salon et partage son code à quatre lettres ou son lien.
2. **3 à 6 humains** rejoignent depuis leurs téléphones ou ordinateurs, sans créer de compte. À deux humains, un mode entraînement non classé est disponible.
3. Tout le monde lit un tutoriel de 30 secondes qui annonce clairement la présence d’une IA.
4. Chaque manche attribue des pseudos, avatars et couleurs anonymes aux humains et à l’IA, puis mélange leur ordre.
5. Les joueurs discutent d’un sujet léger pendant **3 minutes**. L’IA attend le premier message humain ; sa première réponse est guidée par ce message.
6. Chacun dispose de **30 secondes** pour voter. Les votes restent privés jusqu’à la révélation ; on ne peut pas voter pour soi-même.
7. Le jeu révèle l’IA et les votes. Après **3 manches**, un classement final et une carte de résultat partageable sont proposés.

### Les points

- Trouver l’IA rapporte **+1 point**.
- Si une majorité stricte des humains accuse des humains, l’IA gagne la manche : chaque humain à égalité au nombre maximal d’accusations perd **1 point**.
- Les abstentions comptent dans le nombre d’humains éligibles pour déterminer cette majorité.
- Une bonne réponse et une pénalité peuvent se cumuler pour un total de zéro.
- L’entraînement à deux humains et les manches interrompues ne donnent aucun point.

## Fonctionnalités

- Interface mobile-first, thème sombre, français et anglais.
- Langue des menus personnelle ; langue des sujets et de l’IA choisie par l’hôte.
- Chat partagé, chronomètres, votes privés, révélations et scores calculés côté serveur.
- Reconnexion à sa place invitée et transfert d’hôte en cas d’absence.
- Signalement de messages, exclusion par l’hôte, filtres élémentaires et limites anti-spam.
- Tableau de bord protégé pour conserver séparément les clés NVIDIA et OpenAI et sélectionner un fournisseur, sans bascule automatique vers un autre fournisseur.
- Mode développeur local avec joueurs et réponses scriptés pour essayer les écrans sans clé IA.
- Export local d’une carte de résultat PNG, sans discussion ni code de salon.

### Anonymat et comportement de l’IA

Le salon d’attente montre uniquement des places neutres (« Joueur 1 », « Joueur 2 »), avec la même silhouette. Les identités de manche ne sont pas révélées à l’avance et les identifiants de participants changent à chaque manche. Ne communiquez pas votre nouveau pseudo à voix haute ou sur un autre canal : cela annulerait l’anonymat.

L’IA ne prépare aucune réponse tant qu’un message humain accepté n’existe pas dans la manche. Son premier message reçoit explicitement ce message comme contexte. Les réponses sont courtes, filtrées et publiées après un délai aléatoire de 2 à 8 secondes. **Le temps de génération et les cycles de synchronisation s’ajoutent à ce délai** : il ne s’agit pas d’un délai total garanti.

Une erreur temporaire peut être ignorée avec une reprise bornée. Les erreurs persistantes, de configuration ou de budget arrêtent la manche sans révélation ni points. Aucun faux bot scripté ne remplace le vrai modèle dans une partie publique.

## Architecture et organisation des sources

Deux frontends sont conservés ; ils partagent le même principe de serveur Supabase :

| Dossier | Rôle |
| --- | --- |
| src/ | Application Next.js d’origine, développement local sur le port 3000 |
| sites/whos-the-bot/ | Portage Vinext/Worker servant la version actuellement publiée sur Sites |
| supabase/functions/ | Passerelles de salon, administration et worker IA |
| supabase/sql/ | Sources historiques du schéma et des évolutions serveur |
| supabase/tests/ | Scénarios SQL transactionnels annulant leurs données |
| prompts/hidden-player.system.md | Instructions modifiables de l’IA, utilisées uniquement côté serveur |
| tests/ et scripts/ | Tests unitaires, vérifications HTTP et préparation des fonctions |
| docs/ | Guides techniques et historique des validations |

Les pages et les routes /api/lobby et /api/admin sont servies par le frontend. Les salons, messages, votes et échéances sont conservés dans Postgres. Supabase Realtime signale les changements ; les clients relisent ensuite l’état autorisé auprès du serveur.

Les phases avancent à partir d’échéances stockées en base, au fil des requêtes, avec une maintenance de sécurité toutes les **10 secondes**. Aucun cron par seconde n’est nécessaire. Le worker IA fonctionne indépendamment du navigateur de l’hôte.

## Installation locale — application Next.js

### Prérequis

- Node.js **22.13 ou plus récent**, npm et Git.
- Pour les vraies parties : un projet Supabase configuré, les fonctions serveur déployées et un fournisseur IA valide activé.
- Pour l’aperçu développeur seul : aucune clé de modèle n’est nécessaire.

Cloner ce dépôt, ouvrir son dossier dans un terminal, puis exécuter :

    git clone https://github.com/krissiankg/whos-the-bot.git
    cd whos-the-bot
    npm ci

Créer un fichier **.env.local** à partir de **.env.example**, sans modifier les valeurs d’exemple dans le dépôt :

    NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_PROJET.supabase.co
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=VOTRE_CLE_PUBLIABLE_SUPABASE

Ces deux valeurs sont publiques. Ne jamais les remplacer par une clé secrète ou service_role. Une copie du code ne recrée pas automatiquement le serveur Supabase.

Lancer l’application :

    npm run dev

Ouvrir **http://localhost:3000/**. Si ce port est occupé, utiliser l’adresse affichée par le terminal. Sous Windows, npm.cmd peut remplacer npm si PowerShell bloque le script npm.ps1.

### Tester seul, sans frais de modèle

En développement uniquement, ouvrir **http://localhost:3000/?dev=1**. Les joueurs, votes et réponses y sont explicitement simulés. Cet aperçu ne vérifie ni le multijoueur réel ni le fournisseur IA. Les commandes développeur sont désactivées en production.

### Tester avec deux fenêtres indépendantes

1. Dans une fenêtre normale, créer un salon et accepter le tutoriel.
2. Dans une fenêtre privée, un autre profil, un autre navigateur ou un téléphone, rejoindre avec le code. Deux fenêtres ordinaires du même profil partagent le même cookie et représentent le même invité.
3. Les deux joueurs se déclarent prêts. L’hôte sélectionne l’entraînement à deux humains, puis démarre.
4. Attendre quelques secondes sans écrire : l’IA doit rester silencieuse. Envoyer ensuite un premier message humain et attendre sa réponse.
5. Terminer discussion, vote et révélation ; poursuivre les trois manches et vérifier la carte finale. Aucun point n’est accordé en entraînement.

## Configurer Supabase et l’administration

Le code du serveur est fourni, **pas les accès au projet de production**. Pour utiliser son propre projet, il faut installer le schéma, les extensions nécessaires, les fonctions Edge et la maintenance, puis configurer les variables du frontend.

Les fichiers SQL sont des sources d’évolution historiques, **pas un installateur idempotent à exécuter aveuglément**. Certains renomment des fonctions ou déplacent une extension. Des URL de projet sont présentes dans les sources : les adapter à son propre projet avant toute installation. Ne pas rejouer ces scripts sur une base déjà utilisée sans vérifier son historique et ses sauvegardes.

Les fonctions principales sont :

- **game-lobby** : sessions invitées et commandes de jeu autorisées.
- **game-bot** : génération des réponses, autorisée par une capacité privée de travail.
- **game-admin** : administration protégée et configuration des fournisseurs.

Le script **scripts/function-files.mjs** prépare leurs dépendances. Pour game-bot, il intègre le Markdown du prompt dans un module serveur au déploiement. Ne pas déployer directement le fichier system-prompt.ts d’emplacement : il faut utiliser le module généré.

Le tableau de bord **/admin** nécessite une liaison privée **WTB_ADMIN_BRIDGE_TOKEN**, configurée côté serveur et enregistrée sous forme d’empreinte dans Supabase, ainsi qu’une installation initiale contrôlée. Le dépôt ne contient ni ce secret, ni le lien initial à usage unique, ni le mot de passe du propriétaire. Ne jamais réinitialiser l’installation d’un projet existant pour lancer une copie du frontend. Voir [le guide d’administration](docs/ADMIN.md).

## NVIDIA et OpenAI

Le propriétaire peut enregistrer les deux clés séparément dans **/admin**, tester explicitement une connexion et choisir le fournisseur actif. Les clés sont conservées dans Supabase Vault et ne sont jamais réaffichées. Une sauvegarde seule ne lance pas d’appel au modèle ; un test de connexion ou une vraie manche peut consommer des crédits.

Les secrets de fonctions NVIDIA_API_KEY ou OPENAI_API_KEY restent une configuration serveur compatible. BOT_PROVIDER choisit le fournisseur lorsqu’aucune configuration administrateur prioritaire ne le remplace. Une sélection explicite ne bascule jamais automatiquement vers une autre clé.

**Ne jamais placer ces clés dans une variable NEXT_PUBLIC_, dans le navigateur, dans un README ou dans GitHub.** Le dépôt et le site ne fournissent pas de crédits gratuits. Vérifier chez le fournisseur les conditions d’utilisation, la disponibilité du modèle et les coûts applicables.

Le code limite notamment la sortie à 80 tokens et 180 caractères publiés, le contexte récent à 12 messages et les travaux IA à 6 par manche. Le plafond global de réservations est 200 par fenêtre de 24 heures. Ces contrôles applicatifs ne remplacent pas les limites de dépense du compte fournisseur et ne garantissent pas un montant de facture.

## Tests et compilation

Depuis la racine Next.js :

    npm test
    npm run typecheck
    npm run build
    npm start

Arrêter le serveur de développement avant le build si les deux utilisent le même dossier .next.

Les vérifications HTTP ont besoin d’un serveur et d’un projet de test configurés :

    npm run test:lobby
    npm run test:core
    npm run test:languages
    npm run test:admin

Les tests SQL de supabase/tests/ s’exécutent comme des transactions complètes avec BEGIN et ROLLBACK. Ne pas supprimer le ROLLBACK. Ils utilisent des invités et salons temporaires, sans appel réel au modèle.

**scripts/test-live-match.mjs est différent** : c’est un test complet avec le vrai fournisseur. Il exige ALLOW_LIVE_AI_TEST=1 et une URL TEST_BASE_URL explicite, et peut déclencher jusqu’à 18 appels IA. Ne pas le lancer sur le salon d’autres joueurs ni sans accepter ces appels.

Dernier bilan de référence de la version Sites 7 : **38 tests applicatifs et 6 suites SQL validés**. Une partie avec trois sessions HTTP indépendantes et le vrai fournisseur NVIDIA a également été terminée avant les derniers ajustements d’anonymat et de première réponse. Cela ne remplace pas une partie avec trois personnes physiques.

## Version publiée sur Sites

Le jeu public est accessible ici : **https://whos-the-bot.grassyhake7.chatgpt.site/**.

Le portage publié se trouve dans **sites/whos-the-bot/**. Il utilise Vinext, Vite et un Worker compatible avec l’hébergement Sites ; ce n’est pas le serveur Next.js npm start de la racine. Pour la maintenance de ce site précis, suivre le flux Sites et conserver son identité d’hébergement. Un push GitHub seul ne met pas automatiquement le site en ligne à jour.

Pour un aperçu du portage avec ses dépendances installées :

    cd sites/whos-the-bot
    npm ci
    node --import ./scripts/windows-host.mjs --env-file=../../.env.local scripts/run-framework.mjs dev

Le port local prévu est **5173**. L’administration du Worker lit sa liaison secrète côté Worker : pour la tester localement, fournir WTB_ADMIN_BRIDGE_TOKEN comme liaison privée dans un fichier .dev.vars ignoré, et non dans le code. Ne pas exposer l’administration sur un réseau non sécurisé.

Aucune action GitHub ne doit écraser les clés, le mot de passe administrateur ou les parties de production.

## Sécurité et confidentialité

- Aucun compte joueur, nom réel ou adresse e-mail demandés.
- Sessions invitées via cookies HttpOnly ; écritures protégées par contrôle d’origine.
- Tables de jeu privées, permissions restreintes et RLS ; aucune clé administrateur Supabase dans le client.
- Accès aux salons expirant après 24 heures, puis nettoyage périodique des salons et de leurs messages, votes et scores.
- Clés fournisseur et réglages administrateur conservés séparément des salons.
- Pas de discussion ni de clé dans les journaux applicatifs de diagnostic ; les prestataires ont leur propre rétention de logs et sauvegardes.
- Les messages récents sont envoyés au fournisseur IA choisi. Ne pas partager d’informations personnelles dans le chat.
- Filtres de sécurité élémentaires : ils ne constituent pas une modération exhaustive.

Les fichiers .env*, .dev.vars*, .admin-install.local, les dépendances, caches, archives de déploiement et états locaux des outils ne doivent pas être envoyés sur GitHub. Seuls des exemples sans valeurs réelles peuvent être versionnés.

## Validation avec de vraies personnes

Avant une présentation ou un concours :

- Jouer une partie complète à trois appareils, puis si possible à six.
- Vérifier tutoriel compréhensible, absence d’avatars révélateurs dans le salon et nouveaux pseudos à chaque manche.
- Vérifier que l’IA attend un humain, suit la langue du salon et s’intègre à la discussion.
- Contrôler synchronisation, reconnexion, droits de l’hôte, signalements, vote privé et points.
- Vérifier fin après trois manches, classement et téléchargement de la carte.
- Contrôler le format mobile et les messages d’erreur si le fournisseur est indisponible.

## Documentation complémentaire

[Administration](docs/ADMIN.md) · [Règles détaillées et tests](docs/STEP_4.md) · [Résilience IA](sites/whos-the-bot/docs/BOT_RESILIENCE.md) · [Anonymat du salon](sites/whos-the-bot/docs/WAITING_ROOM_ANONYMITY.md) · [Premier message humain](sites/whos-the-bot/docs/HUMAN_OPENS_CHAT.md)

Les guides d’étapes et de vérification sont conservés comme historique : les anciens passages « non publié » ou « IA non validée » décrivent l’état de ces étapes, pas celui de la version 7. Pour l’état courant, lire ce README et les notes récentes du dossier Sites.

## Licence

Aucune licence open source n’a encore été choisie pour le code du jeu. Les licences et avis des dépendances et du starter Sites sont conservés dans leurs fichiers respectifs.
