# Publication sur Sites

URL publique : https://whos-the-bot.grassyhake7.chatgpt.site

Administration : https://whos-the-bot.grassyhake7.chatgpt.site/admin

Publication confirmée le 18 octobre 2026, version 2. Accès public sans compte ChatGPT. L’administration conserve le mot de passe du propriétaire et ses protections serveur.

## Sources et maintenance

La version publiée est dans `sites/whos-the-bot/`. Son manifeste `.openai/hosting.json` contient l’identifiant Sites à réutiliser ; ne pas créer un second Site pour une mise à jour. Les sources Next.js du dossier parent restent disponibles comme version d’origine. Pour modifier le site en ligne, travailler dans le dossier Sites, puis suivre le flux du plugin avec le même projet et son audience publique.

Les secrets de production sont configurés dans Sites. Les clés NVIDIA et OpenAI restent gérées par le tableau de bord et Supabase Vault. Aucun secret de liaison serveur n’est intégré à l’archive publiée ni aux fichiers du navigateur. Les copies temporaires de secrets utilisées pour l’aperçu ont été retirées.

## Vérifications

- Compilation Sites et contrôles TypeScript réussis.
- 39 tests du projet parent et 4 tests propres au transport JSON Sites réussis.
- 117 fichiers générés contrôlés pour les fuites de secrets.
- Tests sur l’URL publique : français/anglais, invités indépendants, salons, temps réel, capacité, reconnexion, exclusions, transfert d’hôte, règles de démarrage, administration et anti-CSRF.
- Accueil et tutoriel vérifiés dans le navigateur ; français/anglais testés visuellement. Débordement horizontal corrigé et vérifié à 806 pixels de largeur.

Aucun appel réel à un modèle n’a été effectué. Il faut encore enregistrer une clé valide et activer le fournisseur dans `/admin`, puis faire une partie avec trois vraies personnes. La publication ne fournit pas de crédits de modèle IA. Les tests créent des salons temporaires qui expirent automatiquement.

## Relancer les vérifications HTTP

Depuis le dossier parent :

```powershell
$env:TEST_BASE_URL = "https://whos-the-bot.grassyhake7.chatgpt.site"
npm run test:languages
npm run test:lobby
npm run test:core
npm run test:admin
```

La liste de validation avec trois personnes reste dans `STEP_4.md`.
