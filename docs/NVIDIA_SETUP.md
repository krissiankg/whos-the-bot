# Activer NVIDIA Build sans clé OpenAI

**Méthode recommandée dans l’application :** utiliser maintenant [le tableau de bord propriétaire](ADMIN.md). Il permet de conserver les deux clés et de choisir le fournisseur sans modifier les secrets Supabase à chaque changement. Les réglages manuels ci-dessous restent compatibles.

Le jeu accepte maintenant **NVIDIA Build** et conserve OpenAI comme option. La clé reste dans les secrets des fonctions Supabase, jamais dans le navigateur ni dans `.env.local` du frontend.

## Obtenir la clé

1. Ouvrir [la page des clés NVIDIA Build](https://build.nvidia.com/settings/api-keys) et se connecter ou créer un compte NVIDIA.
2. Cliquer **Generate API Key**, suivre la vérification de téléphone si demandée, nommer la clé puis la copier. Voir les [instructions officielles NVIDIA](https://docs.nvidia.com/ai-workbench/how-to/integrations/nvidia-integrations/#connect-the-nvidia-endpoints-integration).
3. Ne pas coller cette clé dans une conversation, un dépôt ou une capture d’écran.

Le modèle configuré est [NVIDIA Nemotron 3.5 Lightning 30B-A3B](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/build), dont l’endpoint gratuit est indiqué disponible lors de la vérification du 17 octobre 2026. L’accès dépend du compte et des limites NVIDIA ; la disponibilité ne prouve pas qu’une clé particulière soit autorisée. Les anciens endpoints gratuits Llama 3.1 8B et Llama 3.3 70B sont indiqués retirés ; ils ne sont pas proposés ici.

## Configurer Supabase

Ouvrir [Edge Functions → Secrets du projet](https://supabase.com/dashboard/project/ayvfdycfkavoeqbkplex/functions/secrets) et enregistrer :

| Nom du secret | Valeur |
| --- | --- |
| `BOT_PROVIDER` | `nvidia` |
| `NVIDIA_API_KEY` | La clé NVIDIA générée, à conserver secrète |

Option avancée : `NVIDIA_BOT_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b`. Ce modèle est déjà la valeur par défaut ; aucun troisième secret n’est nécessaire.

Il n’est pas nécessaire d’ajouter `OPENAI_API_KEY`, ni de payer OpenAI. Les deux fonctions ont été redéployées pour accepter cette configuration. Les secrets deviennent disponibles sans redéploiement selon la [documentation Supabase](https://supabase.com/docs/guides/functions/secrets). Rafraîchir le salon après enregistrement.

Si `BOT_PROVIDER` est absent, la présence d’une clé NVIDIA la fait préférer à OpenAI ; une installation qui ne possède qu’une clé OpenAI garde son ancien comportement. Il est néanmoins recommandé de mettre explicitement **`BOT_PROVIDER=nvidia`** : une clé NVIDIA absente, expirée ou en erreur ne provoquera jamais de repli automatique vers OpenAI. Un nom de fournisseur ou un modèle non autorisé désactive la configuration.

## Attention : prototype et concours

Les [NVIDIA API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf), sections 1.2 et 1.4, réservent le service gratuit aux essais et évaluations internes, pas à la production. Ce branchement permet de développer le prototype ; **il ne garantit pas que le déploiement public exigé par le concours soit autorisé par cette offre**. Clarifier ce point avec NVIDIA et les organisateurs avant publication, ou choisir ensuite une offre autorisant cet usage. Ne pas contourner les quotas ni multiplier les comptes pour les éviter.

Les crédits, durées et quotas peuvent varier. Aucune limite chiffrée de crédits gratuits n’est promise. Le code ne souscrit aucun abonnement et ne contient aucun repli payant.

## Confidentialité et fonctionnement

- Endpoint fixe : `https://integrate.api.nvidia.com/v1/chat/completions`, authentification Bearer ; aucune URL de fournisseur fournie par le navigateur.
- Le prompt reste dans `prompts/hidden-player.system.md`. Le contexte récent est envoyé comme contenu utilisateur non fiable, séparé des instructions système.
- Pour des réponses de chat courtes, le raisonnement est désactivé avec `chat_template_kwargs.enable_thinking=false`, conformément à la [documentation NVIDIA](https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning.html).
- 80 tokens maximum, 180 caractères publiés, six appels/manche, plafond commun de 200 appels par fenêtre fixe de 24 heures. Les réservations SQL historiques restent communes aux deux fournisseurs ; le montant indicatif en dollars concerne uniquement l’estimation OpenAI, pas une facturation NVIDIA ni une promesse de crédits gratuits.
- Aucun retry automatique ni bascule vers un autre fournisseur en cas de quota ou panne. L’interruption reste neutre pour ne pas révéler le bot.
- Seul le texte final est publié ; traces de raisonnement, refus, appels d’outils et réponses tronquées ne sont pas transmis au chat.
- Les conditions NVIDIA permettent l’utilisation des entrées/sorties pour améliorer leurs services et modèles et la journalisation de sécurité. Ne pas envoyer de données personnelles ou confidentielles. La suppression applicative après 24 heures n’efface pas les éventuels enregistrements du fournisseur. Le tutoriel et la page confidentialité l’expliquent.

## Tester avec deux fenêtres

Si le serveur est arrêté :

```powershell
Set-Location 'C:\Users\krissiank\Documents\Github_cursor\Multiplayer Game'
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

1. Fenêtre normale : [ouvrir le jeu](http://localhost:3000/), créer un salon, accepter le tutoriel.
2. Fenêtre privée/incognito : rejoindre avec le même code et accepter le tutoriel.
3. Les deux joueurs se mettent prêts. L’hôte coche le mode pratique à deux humains puis **Start round**.
4. Échanger quelques messages ; attendre une réponse du bot. L’indicateur `aiAvailable` vérifie la configuration présente, pas la validité de la clé ni les quotas disponibles : une vraie réponse doit encore être constatée après activation.
5. Au bout de trois minutes, voter puis attendre la révélation 30 secondes plus tard.

Les tests automatisés du nouvel adaptateur et du vrai code worker utilisent une clé factice et un transport simulé : ils ne consomment aucun crédit. Un test réel NVIDIA reste nécessaire avec la clé du propriétaire.

## Sources et redéploiement

`supabase/functions/_shared/bot-provider.mjs` est l’unique source de sélection des fournisseurs, modèles et endpoints pour la passerelle et le worker. `scripts/function-files.mjs` inclut ce module dans les deux bundles. Les chemins d’entrée au déploiement MCP sont désormais **`game-lobby/index.ts`** et **`game-bot/index.ts`**, et non `index.ts` à la racine. La génération du module de prompt depuis le Markdown est conservée.

Pour revenir volontairement à OpenAI : configurer `BOT_PROVIDER=openai` et `OPENAI_API_KEY` dans les secrets Supabase ; le modèle limité et le mode `store:false` existants sont conservés.
