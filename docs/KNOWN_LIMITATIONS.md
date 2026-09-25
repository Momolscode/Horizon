# Limites connues

Tout ce qui est simulé, non vérifié, non livré ou volontairement limité. À lire avant toute démonstration à un tiers.

## 1. Données et contenus

- **Catalogue non vérifié :**
  - 40 lieux, dont 32 réels avec des coordonnées approximatives et 8 restaurants **fictifs** ;
  - les textes éditoriaux n'ont pas été vérifiés ;
  - prix, horaires, accessibilité, téléphone et site web sont « inconnus » ou « estimés », jamais « connus ».

  Ne pas utiliser pour planifier une vraie sortie sans vérification.
- **Quatre destinations seulement :** Annecy, Lyon, Marseille, La Rochelle. La recherche ne couvre que ce catalogue ; il n'y a pas de géocodage d'adresses.
- **Profils, amis et avis de la démo :** fictifs et étiquetés comme tels.

## 2. Carte et déplacements

- **Fond de carte simplifié** (Natural Earth 1:10 000 000) : ni routes, ni rues, ni noms de villes du fond. L'interface le signale.
- **Aucun calcul d'itinéraire :**
  - les distances sont à vol d'oiseau ;
  - les marges entre étapes sont estimées avec un facteur de détour fixe (1,35) et une vitesse par mode de transport ;
  - ce ne sont pas des temps de trajet ;
  - les liens « Y aller » renvoient vers des services externes dont les formats d'URL n'ont pas été vérifiés.
- **WebGL 2 requis :** sans lui, un message d'erreur remplace la carte.
- **Météo :** indisponible par défaut. L'adaptateur Open-Meteo existe, mais n'a pas été vérifié (pas de réseau) ; son usage commercial serait soumis à un abonnement, à confirmer.

## 3. Progression et anti-triche

- **Contrôle « sur place » falsifiable :** la position vient du navigateur et peut être simulée. Il n'y a pas de preuve de présence plus forte (code sur place, partenaire).
- **Visites déclarées :** elles rapportent de l'XP sans preuve. Les garde-fous testés côté serveur sont les suivants :
  - plafond de 20 visites par 24 h ;
  - une seule récompense de première visite par lieu, et un seul bonus de contrôle par lieu (clé unique dans `xp_ledger`) ;
  - dates bornées entre -365 et +1 jour ;
  - idempotence.

  Il reste possible de « cultiver » de l'XP en déclarant de fausses visites dans ces limites. Impact limité : l'XP n'est **pas dépensable**, et les points de récompense n'ont **aucun échange** possible.
- **Visites simulées :** propres à la démo, refusées par le serveur en mode connecté.
- **Paliers de niveau :** l'ajout de points de récompense se rattrape de façon idempotente (`levelRewardCredits`). Un changement de barème ne s'applique qu'aux attributions suivantes : l'historique n'est pas recalculé, et les lignes de `xp_ledger` ne mémorisent pas la version de barème appliquée (seuls les barèmes eux-mêmes sont versionnés).

## 4. Mode démo

- Les données restent dans le `localStorage` du navigateur : effacement du navigateur ou changement d'appareil, et tout est perdu. L'export JSON est disponible dans Paramètres.
- Indisponibles en démo, et signalés comme tels : amis réels, partage d'excursion par lien, publication d'avis, signalements, administration, liste d'attente réelle.

## 5. Mode connecté

- **Vérifié uniquement sur la pile Supabase locale** (CLI 2.117.0, PostgreSQL 17, PostGIS 3.3.7). Aucun projet hébergé n'a été créé ni testé.
- **E-mails :**
  - confirmation d'inscription désactivée en local ;
  - aucun SMTP ;
  - réinitialisation de mot de passe non vérifiée ;
  - pas de connexion par fournisseur tiers (Google, Apple).
- **Suppression de compte :** implémentée, sans test e2e. Sa purge dans les sauvegardes n'est pas traitée.
- **Limiteur de débit en mémoire, par instance :** inefficace avec plusieurs instances serverless ou après redémarrage.
- **Liste d'attente :** stockée, mais sans interface d'export ni de purge (requête SQL nécessaire).
- **Mesure :** activation et rétention seulement. « Données insuffisantes » s'affiche sous 20 personnes par dénominateur. Pas d'entonnoir détaillé ni d'outil d'analyse externe.

## 6. Sécurité

- **CSP avec `'unsafe-inline'`** pour les scripts et les styles. Elle est nécessaire au script de démarrage du thème et aux styles injectés par Next.js et MapLibre. Durcissement possible avec des nonces, non fait.
- **Protection CSRF :** vérification d'`Origin` et de `Sec-Fetch-Site`, et exigence d'un corps JSON. Pas de jeton CSRF dédié.
- **Revue de sécurité :** indépendante, par un agent en lecture seule, dont les constats ont été reproduits par des tests puis corrigés (voir STATUS). **Aucun audit externe ni test d'intrusion.**

## 7. Fonctions non livrées

- Défis amicaux et comparaisons avancées (seule une comparaison simple existe).
- Mode Duo (excursion collaborative).
- Notifications (push, e-mail).
- Cartes hors ligne avancées : le service worker ne conserve que les pages visitées et le fond embarqué.
- Applications natives.
- Paiements, bons partenaires, publicité récompensée. Rien n'est intégré, conformément à la consigne.
- Traduction : interface en français uniquement.
- Import d'un catalogue vérifié : procédure décrite dans HANDOVER, pas d'outil.

## 8. Qualité et outillage

- **CI GitHub Actions** fournie, jamais exécutée sur GitHub.
- **Tests e2e :** exécutés sous Chromium headless uniquement (rendu logiciel SwiftShader). Firefox, Safari et les vrais appareils mobiles n'ont pas été testés.
- **Accessibilité :** rôles ARIA, focus, contrastes vérifiés visuellement, `prefers-reduced-motion` respecté. Pas d'audit automatisé (axe) ni de test avec lecteur d'écran.
- **Versions :** ESLint 9 en fin de maintenance ; TypeScript 5.9, alors que 7 existe (voir DECISIONS D-001).

## 9. Juridique et commercial

- Nom « HORIZON » et domaine : disponibilité non vérifiée.
- Politique de confidentialité, CGU et mentions légales : non rédigées ; validation juridique nécessaire.
- Aucune licence open source accordée ; dépôt privé.
