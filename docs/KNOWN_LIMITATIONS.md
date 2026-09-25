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
- **Missions :** seules les premières visites d'un lieu les font progresser. La mission quotidienne « Préparer une sortie » (+5 XP) reste en revanche validée par toute création ou modification d'excursion : elle est donc répétable chaque jour sans sortie réelle.
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
- **Limiteur de débit en mémoire, par instance :** inefficace avec plusieurs instances serverless ou après redémarrage. Pour les routes anonymes (liste d'attente), la clé repose sur `x-forwarded-for` : c'est fiable seulement derrière un proxy qui écrase cet en-tête, à vérifier chez l'hébergeur.
- **Refus d'ami :** le demandeur peut lire, via l'accès direct à la base (RLS), qu'une demande a été refusée. L'interface ne l'affiche pas.
- **Liste d'attente :** stockée, mais sans interface d'export ni de purge (requête SQL nécessaire).
- **Mesure :** activation et rétention seulement. « Données insuffisantes » s'affiche sous 20 personnes par dénominateur. Pas d'entonnoir détaillé ni d'outil d'analyse externe.

## 6. Sécurité

- **CSP avec `'unsafe-inline'`** pour les scripts et les styles. Elle est nécessaire au script de démarrage du thème et aux styles injectés par Next.js et MapLibre. Durcissement possible avec des nonces, non fait.
- **Protection CSRF :** vérification d'`Origin` et de `Sec-Fetch-Site`, et exigence d'un corps JSON. Pas de jeton CSRF dédié.
- **Revue de sécurité :** indépendante, par un agent en lecture seule, dont les constats ont été reproduits par des tests puis corrigés (voir STATUS). **Aucun audit externe ni test d'intrusion.**

## 7. Interface

- **404 « douce » :** `/lieux/<identifiant inconnu>` affiche la page « Page introuvable » avec `noindex`, mais le statut HTTP reste 200. La page est rendue en streaming sous une frontière Suspense, et Next.js ne peut plus changer le statut (documentation Next, « Status codes »). Une adresse inexistante hors de l'application renvoie bien 404.
- **Modifications non enregistrées :** une confirmation apparaît en quittant par un lien interne ou en fermant l'onglet, mais pas avec le bouton « précédent » du navigateur.
- **Service worker :** l'exclusion des pages de partage, d'administration et de connexion n'est pas couverte par un test automatisé.
- **Hypothèses de la revue, non vérifiées :**
  - le focus n'est peut-être pas restauré après la fermeture de l'animation de révélation ;
  - les groupes de boutons radio personnalisés ne gèrent pas les flèches du clavier (Tab et Entrée fonctionnent).
- **Bandeau démo sur mobile :** le texte est tronqué (« lieux non vérifiés, re… »). Chaque lieu ou profil fictif porte néanmoins sa propre étiquette.

## 8. Mode Duo

- **Portée du test :** vérifié sur la pile Supabase locale uniquement, comme tout le mode connecté.
- **Pas de temps réel :** les modifications de l'autre apparaissent à l'ouverture de l'excursion ou au retour sur l'onglet, pas pendant la saisie.
- **Conflit :** si les deux enregistrent l'un après l'autre à partir de la même version, le second est prévenu et voit la version à jour. Ses propres modifications non enregistrées sont abandonnées ; il n'y a pas de fusion.
- **Pas de notifications :** invitations et visites à confirmer s'affichent en tête de l'onglet Excursions.
- **Une seule personne invitée par excursion.**
- **« Nous y étions » :**
  - disponible seulement sur une excursion enregistrée, sans modification en cours ;
  - date de visite : le jour même, dans le fuseau de la destination ;
  - une seule demande par étape et par personne, même si elle a été refusée ou a expiré.
- **Visite confirmée :** elle reste une visite déclarée, donc falsifiable comme les autres (voir § 3). Les deux amis peuvent s'entendre pour se créditer mutuellement, dans les limites habituelles (plafond, une récompense par lieu).
- **Démo :** le Mode Duo y est présenté mais indisponible.

## 9. Référencement et avis

- **Offre payante :** souhaitée à terme (fiche enrichie), **non implémentée**. Aucun paiement n'est intégré.
- **Revendication :**
  - le SIRET n'est contrôlé que dans sa forme (14 chiffres, clé de Luhn) ;
  - l'existence de l'établissement et la preuve sont vérifiées **manuellement** par l'administrateur ;
  - le lien vers l'Annuaire des entreprises n'a pas été vérifié (pas de réseau) ;
  - aucun fichier justificatif n'est téléversé (stockage désactivé) : l'administrateur recontacte la personne ;
  - **retrait de la gestion :** l'administrateur peut retirer la gestion (motif obligatoire, journalisé) et l'établissement peut y renoncer. Il n'existe pas de transfert direct : le nouvel établissement revendique la fiche et passe par la validation manuelle. L'établissement n'est pas prévenu par e-mail : il découvre le retrait et son motif dans `/contributions` ;
  - après un retrait, les réponses publiées de l'ancien gestionnaire restent visibles, sauf si l'administrateur coche « Retirer ses réponses publiées ». Un renoncement les laisse toujours visibles. Le nouveau gestionnaire peut remplacer une réponse de l'ancien, et la nouvelle réponse repasse en modération ;
  - un ancien gestionnaire ne peut toujours pas noter la fiche, même après un retrait. C'est un choix de prudence (conflit d'intérêts) ; il n'existe aucune procédure de levée ;
  - la provenance des informations n'est pas enregistrée par gestionnaire. « Effacer » vise toutes les valeurs marquées « fournies par l'établissement », y compris celles d'un gestionnaire précédent retiré sans effacement. Les libellés le disent ;
  - le renoncement n'apparaît pas dans le journal d'administration. Il est tracé dans la revendication (date, auteur, motif) ;
  - **préexistant, non corrigé :** le contrôle « pas d'auto-évaluation » ne s'applique qu'au dépôt d'un avis. Un avis déposé par une personne avant qu'elle obtienne la gestion de la fiche reste en ligne après la validation de sa revendication.
- **Propositions :**
  - uniquement dans les 4 destinations ;
  - position placée sur un fond sans rues, donc « approximative » ;
  - pas de modification ni de retrait par l'auteur après l'envoi ;
  - pas de photos ;
  - détection des doublons par nom proche à moins de 100 m (heuristique : des doublons peuvent passer, et de faux doublons être signalés ; la personne peut confirmer).
- **Avis :** réservés aux personnes ayant déclaré une visite. La déclaration étant falsifiable (§ 3), cela ajoute une étape mais ne prouve pas la présence.
- **Réponses :** les réponses des établissements passent par la modération, ce qui représente une charge humaine.
- **Nouvelles catégories :** « Commerce & artisan » et « Activité de plein air » n'ont aucun lieu dans le catalogue de démonstration. En démo, le filtre correspondant renvoie donc 0 lieu.
- **Conditions d'utilisation des contributions :** non rédigées, notamment les droits sur les textes proposés par les membres. À faire avant ouverture.

## 10. Fonctions non livrées

- Défis amicaux et comparaisons avancées (seule une comparaison simple existe).
- Notifications (push, e-mail).
- Cartes hors ligne avancées : le service worker ne conserve que les pages visitées et le fond embarqué.
- Applications natives.
- Paiements, bons partenaires, publicité récompensée. Rien n'est intégré, conformément à la consigne.
- Traduction : interface en français uniquement.
- Import d'un catalogue vérifié : procédure décrite dans HANDOVER, pas d'outil.

## 11. Qualité et outillage

- **CI GitHub Actions** fournie, jamais exécutée sur GitHub.
- **Tests e2e :** exécutés sous Chromium headless uniquement (rendu logiciel SwiftShader). Firefox, Safari et les vrais appareils mobiles n'ont pas été testés.
- **Accessibilité :** rôles ARIA, focus, contrastes vérifiés visuellement, `prefers-reduced-motion` respecté. Pas d'audit automatisé (axe) ni de test avec lecteur d'écran.
- **Versions :** ESLint 9 en fin de maintenance ; TypeScript 5.9, alors que 7 existe (voir DECISIONS D-001).

## 12. Juridique et commercial

- Nom « HORIZON » et domaine : disponibilité non vérifiée.
- Politique de confidentialité, CGU et mentions légales : non rédigées ; validation juridique nécessaire.
- Aucune licence open source accordée ; dépôt privé.
