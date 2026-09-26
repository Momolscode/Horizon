# Décisions structurantes

Format court : contexte → décision → conséquences. Les décisions réversibles ont été prises sans consulter le porteur du projet (consigne de départ) ; elles sont listées ici pour pouvoir être revues.

## D-001 — Stack : Next.js 16 (App Router), React 19.2, TypeScript 5.9 strict, Tailwind 4

- **Contexte :** dépôt vide ; stack recommandée par le cahier des charges.
- **Décision :** versions alignées sur le gabarit officiel `create-next-app@16.3.6` (React 19.2.8, TypeScript 5.9.3, ESLint 9) plutôt que les dernières versions publiées (TypeScript 7, ESLint 10). Plusieurs plugins ESLint ne déclarent pas encore ESLint 10, et typescript-eslint limite TypeScript à < 6.1.
- **Conséquences :** montée de version à planifier quand l'écosystème suivra. ESLint 9 est signalé « non maintenu » par npm.

## D-002 — Playwright 1.56.1

- **Décision :** version alignée sur le Chromium préinstallé de l'environnement de construction (build 1194).
- **Conséquences :** en CI, `npx playwright install chromium` télécharge le navigateur correspondant.

## D-003 — Logique métier pure, partagée par les deux modes

- **Décision :** `src/modules/*` ne dépend ni de React, ni de Supabase, ni d'un fournisseur. Le mode démo applique `planVisit` localement ; le mode connecté l'applique côté serveur dans une transaction PostgreSQL.
- **Conséquences :** les règles d'XP, de parcelles et de badges ont une seule implémentation, testée une fois. La base ajoute des contraintes d'unicité comme seconde barrière.

## D-004 — Mode connecté : Supabase Auth + PostgreSQL/PostGIS

- **Décision :** le navigateur lit et écrit les données qui lui appartiennent via supabase-js sous RLS. Les opérations sensibles (visites, XP, partage, administration, liste d'attente) passent par des routes serveur Next.js : elles vérifient l'identité, valident avec Zod et écrivent dans une transaction via `pg` (DATABASE_URL). Les tables de progression n'ont aucune politique d'écriture pour le rôle `authenticated`.
- **Conséquences :** deux chemins d'accès, avec des responsabilités claires. En serverless, `DATABASE_URL` doit viser le pooler Supabase.

## D-005 — Catalogue de démonstration non vérifié

- **Contexte :** l'environnement de construction n'a accès ni à Wikidata, ni à data.gouv.fr, ni à DATAtourisme, ni aux sites officiels (proxy restrictif).
- **Décision :** 32 lieux réels cités avec coordonnées approximatives et textes éditoriaux marqués « non vérifiés », plus 8 restaurants **fictifs** nommés comme tels. Aucune valeur n'a le statut « connue » ; un test garantit cette règle. Seuls les centres de destination viennent d'une source ouverte (Natural Earth).
- **Conséquences :** avant tout usage réel, il faut un import vérifié (voir HANDOVER).

## D-006 — Fond de carte local Natural Earth (domaine public)

- **Décision :** GeoJSON découpé sur la France (551 Kio), construit par `scripts/build-basemap.mjs` et versionné. Aucune tuile publique n'est utilisée, faute d'avoir pu vérifier leurs conditions. Un style externe est activable par `NEXT_PUBLIC_MAP_STYLE_URL`.
- **Conséquences :** pas de routes ni de rues ; l'interface affiche « pas une carte routière ». Les libellés de villes du fond ne sont pas affichés, faute de glyphes locaux.

## D-007 — Parcelles H3, résolution 8

- **Décision :** résolution de référence 8 (cellule d'environ 0,74 km², arête moyenne d'environ 530 m selon h3-js), enregistrée avec chaque parcelle. L'affichage agrège en résolutions 7 et 6 selon le zoom, et masque le voile en dessous du zoom 8,5. Au plus 2 500 cellules sont calculées par vue, avec repli sur une résolution plus grossière.
- **Conséquences d'un changement de résolution :**
  - les parcelles existantes gardent leur résolution ;
  - l'affichage les projette (parent ou enfants) ;
  - les dénominateurs des pourcentages changent ;
  - l'XP « nouvelle parcelle » est indexée sur l'identifiant de cellule : une même zone à une autre résolution est une autre cellule.

  Toute migration doit se faire par script, en conservant la résolution d'origine.

## D-008 — Statuts de visite et économie

- **Décision :** voir le tableau de PRODUCT_SPEC § 5.4.
  - Les points récompense ne viennent que des récompenses de niveau (jamais d'une visite ni d'un contrôle GPS).
  - Les visites simulées sont interdites côté serveur en mode connecté.
- **Conséquences :** l'économie de points reste sans valeur monétaire tant que les bons sont désactivés.

## D-009 — Moteur « Surprends-nous » déterministe

- **Décision :** score explicable (envies, groupe, lieu moins connu, pénalités de distance et de répétition) plus une variation pseudo-aléatoire issue d'une graine. « Autre proposition » incrémente la graine. Les repas sont placés dans la fenêtre du déjeuner ou du dîner. Les lieux fermés, selon des horaires connus ou estimés, sont exclus. Les marges de déplacement sont estimées à vol d'oiseau avec un facteur de détour de 1,35 et étiquetées comme telles.
- **Conséquences :** le moteur est reproductible et testable, sans aucune IA. Un adaptateur d'itinéraire réel pourra remplacer `transferMarginMinutes`.

## D-010 — Direction artistique et jetons

- **Décision :**
  - thème « Papier » (crème chaud) et thème « Nuit » (bleu profond) ;
  - corail pour l'action (`#C8462F`, blanc dessus 4,8:1), vert pour l'exploration (`#2E7D5B`, 5,0:1) ;
  - polices Fraunces (titres) et Manrope (texte), servies en local via @fontsource (SIL OFL), sans Google Fonts au build ;
  - illustrations génératives SVG originales à la place de photos non licenciées.
- **Conséquences :** l'interface ne contient aucune photo ; des photos sous licence pourront être ajoutées via le champ `art` ou un futur champ `images`.

## D-011 — PWA légère

- **Décision :** manifeste et service worker maison. Il met en cache les ressources statiques et le fond de carte ; pour les pages, il tente le réseau d'abord, avec repli sur `/hors-ligne`. Il est enregistré en production uniquement.
- **Conséquences :** l'application n'est pas un mode hors ligne complet, et la documentation le dit.

## D-012 — Superpowers (plugin Claude Code)

- **Décision :** plugin `superpowers@superpowers-marketplace` déclaré au niveau du projet (`.claude/settings.json`), à la demande du porteur.
- **Conséquences :** seuls les outils de développement sont concernés ; l'application n'est pas touchée.

## D-013 — « Surprends-nous » : essai de chaque point de départ

- **Contexte :** la composition gloutonne choisissait le premier lieu sans contrainte de distance. Un lieu isolé (Talloires, à une dizaine de kilomètres d'Annecy) bloquait alors toute la suite à pied, et la proposition tombait à 1 étape avec les réglages par défaut.
- **Décision :** composer à partir de chaque lieu admissible comme première étape, puis garder la proposition la plus complète, et à égalité la mieux notée. Le résultat reste déterministe.
- **Conséquences :** le coût de calcul est multiplié par le nombre de lieux d'une destination (une dizaine aujourd'hui). À revoir, par exemple avec une présélection par proximité, si un catalogue compte des centaines de lieux par destination.

## D-014 — Données de référence par migration

- **Décision :** le barème de progression v1 et les missions sont insérés par une migration (`on conflict do nothing`). Le seed ne contient plus que la démonstration.
- **Conséquences :** une base de production fonctionne sans le catalogue de démonstration. Les évolutions passent par l'administration (barèmes versionnés, missions) ou par une nouvelle migration, jamais en modifiant une migration déjà appliquée.

## D-015 — 404 « douce » pour les lieux inconnus

- **Contexte :** les pages de l'application sont rendues sous une frontière Suspense (paramètres d'URL côté client). Une fois le streaming commencé, Next.js ne peut plus changer le statut HTTP.
- **Décision :** accepter une 404 « douce » : page « Page introuvable » en français, avec `noindex`, mais statut 200. Les adresses hors application renvoient un vrai 404.
- **Alternative écartée pour l'instant :** vérifier l'identifiant dans `proxy.ts` avant le rendu. En mode connecté, il faudrait lire le catalogue en base à chaque requête.

## D-016 — Mode Duo : conception validée, implémentée

Validée par le porteur le 2026-09-25, lors d'une séance de conception.

- **Invitation :** un ami déjà accepté, une seule personne invitée par excursion. L'invité accepte ou refuse. Retirer l'ami ou le bloquer coupe l'accès.
- **Droits :**
  - les deux co-éditent les étapes, horaires, titre et transport ;
  - seul le propriétaire peut supprimer l'excursion ou retirer l'invité ;
  - l'invité peut quitter l'excursion.
- **Synchronisation :**
  - l'excursion se recharge à l'ouverture et au retour sur l'onglet, avec la mention « modifié par X il y a N min » ;
  - chaque excursion porte un numéro de version : un enregistrement simultané est refusé au second, qui voit la version récente (rien n'est écrasé) ;
  - pas de temps réel.
- **Visite pour deux :**
  - A déclare « nous y étions » ; sa visite est créditée normalement ;
  - B reçoit une demande à confirmer sous 7 jours ;
  - s'il accepte, le serveur crée SA visite déclarée, avec les règles habituelles (plafond, une récompense par lieu, idempotence) ;
  - s'il refuse ou laisse expirer, rien n'est crédité ;
  - aucune position n'est transmise d'un compte à l'autre.
- **Démo :** le Duo est présenté mais indisponible, comme les amis réels.
- **Implémentation (migration `20260925000500_duo.sql`) :**
  - tables `excursion_members` (une ligne par excursion) et `duo_visit_requests`, sans aucun droit client ;
  - l'accès de l'invité passe par la fonction `is_duo_guest`, qui vérifie invitation acceptée, amitié toujours acceptée et absence de blocage ;
  - colonnes `version` et `updated_by`, mises à jour par un déclencheur ;
  - le navigateur ne lit plus `user_id` ni `updated_by` des excursions ;
  - routes `/api/duo`, `/api/duo/[excursionId]`, `/api/duo/visites`, `/api/duo/visites/[id]`.
- **Tests requis :**
  - invitation refusée à un non-ami ;
  - suppression interdite à l'invité ;
  - blocage qui coupe l'accès ;
  - conflit de versions détecté ;
  - visite confirmée créditée une seule fois ;
  - demande expirée ou refusée sans crédit.

## D-017 — Référencement et avis élargis : conception validée, implémentée (sans offre payante)

Validée par le porteur le 2026-09-25, lors d'une séance de conception.

- **Portée :** restaurants, commerces et entreprises, activités extérieures de tout genre, **uniquement dans les destinations couvertes**. L'administration ajoute de nouvelles destinations.
- **Proposition (tout compte connecté) :**
  - nom, catégorie, position, site ; horaires et tarifs s'ils sont connus (`Known<T>`) ;
  - détection d'un doublon probable (nom proche, moins de 100 m) ;
  - modération dans l'administration, puis publication marquée « non vérifiée ».
- **Revendication (professionnel) :**
  - SIRET, contrôlé par l'administrateur dans la base Sirene (données ouvertes, mode d'accès à confirmer), et preuve (e-mail sur le domaine ou justificatif) ;
  - validation manuelle par un administrateur ;
  - le professionnel corrige les informations pratiques, affichées « fournies par l'établissement » et datées ;
  - il répond gratuitement et publiquement aux avis ;
  - il ne peut jamais modifier, supprimer ou noter les avis de son établissement.
- **Avis :** réservés aux comptes ayant déclaré une visite du lieu (mention « après visite déclarée ») ; modération inchangée, décision liée à la version relue.
- **Offre payante (souhaitée à terme, NON implémentée) :**
  - fiche enrichie uniquement : photos, menu ou tarifs, lien de réservation, statistiques de consultation ;
  - jamais d'effet sur l'ordre, les notes, les avis ni « Surprends-nous » ;
  - signalée comme telle ;
  - aucun paiement réel sans décision explicite du porteur et validation juridique (transparence des classements et des avis, conditions commerciales) ;
  - aucun tarif fixé.
- **Implémentation (migration `20260925000600_referencing.sql`) :**
  - catégories `shop` (Commerce & artisan) et `outdoor` (Activité de plein air) ;
  - source `contribution-membres` (type `community`) ;
  - tables `place_proposals`, `place_claims` (un seul gestionnaire approuvé par fiche) et `review_replies`, sans aucun droit client ;
  - déclencheur `check_review_eligibility` (visite déclarée obligatoire, pas d'auto-évaluation), appliqué aux avis déposés par un compte ;
  - `published_reviews` renvoie la réponse publiée et la mention « après visite ».
  - Logique pure : `src/modules/catalog/contributions.ts` (schémas, doublons, SIRET/Luhn, construction du lieu, informations de l'établissement en `estimate` avec `by: "establishment"`).
  - Serveur : `src/server/contributions.ts`. Interface : `/lieux/proposer`, `/contributions`, revendication depuis la fiche, onglets d'administration.
- **Retrait de la gestion (complément du 2026-09-25, migration `20260925000700_claim_revocation.sql`) :**
  - nouveau statut `revoked` avec date, auteur et motif ; l'historique des revendications est conservé et la fiche redevient revendicable ;
  - retrait par un administrateur : carte « Fiches gérées » de l'onglet « Revendications ». Motif obligatoire, visible par l'établissement. Deux options explicites : effacer les informations fournies par l'établissement (elles redeviennent « inconnues », jamais une valeur inventée) et retirer ses réponses publiées. Opération journalisée (`claim.revoke`) ;
  - renoncement par l'établissement depuis `/contributions`, avec effacement facultatif de ses informations ; ses réponses publiées restent visibles ;
  - dans les deux cas, les réponses en attente de l'ancien gestionnaire sont refusées ; il perd aussitôt tout droit sur la fiche et ne peut toujours pas la noter ;
  - le nouveau gestionnaire peut remplacer une réponse laissée par un ancien gestionnaire (nouvelle modération) ;
  - pas de transfert direct : un transfert passe par une nouvelle revendication, validée manuellement.
- **Avis déposés avant la revendication (complément du 2026-09-25, migration `20260925000800_claim_review_conflict.sql`) :**
  - à la validation d'une revendication, les avis du demandeur sur la fiche (en attente ou publiés) sont refusés avec le motif « conflit d'intérêts ». L'administrateur en est averti sur la demande, et le demandeur dans la fenêtre de revendication ;
  - la base empêche le retour d'un tel avis : le déclencheur `check_review_eligibility` s'applique aussi aux modifications par l'auteur, la modération refuse de le publier (409), et `published_reviews` ne renvoie jamais l'avis d'un établissement qui gère ou a géré la fiche ;
  - l'avis n'est pas supprimé (trace conservée) et reste masqué après un retrait de la gestion.
- **Écartés :** mise en avant « sponsorisée », présence payée dans « Surprends-nous », réponses aux avis payantes, vérification par SMS ou courrier (coût), fiches hors destinations.
- **Tests requis :**
  - modération des propositions et détection des doublons ;
  - revendication inactive sans validation de l'administrateur ;
  - un professionnel ne peut ni toucher aux avis ni noter sa fiche ;
  - un avis est refusé sans visite déclarée ;
  - le classement ignore tout statut payant ;
  - après un retrait ou un renoncement : droits perdus, fiche revendicable, options d'effacement respectées, ancien gestionnaire toujours privé d'avis ;
  - un avis déposé avant la revendication est retiré à la validation et ne peut plus être modifié, republié ni affiché.

## D-018 — Cache du catalogue revalidé par empreinte

- **Contexte :** le cache mémoire du catalogue (60 s) était propre à chaque instance de route. L'administration invalidait celui de sa propre route, mais la page d'un lieu ou `/api/catalog` pouvaient servir un catalogue périmé, en développement comme en production serverless. Découvert par un test e2e : un lieu tout juste publié renvoyait « Page introuvable ».
- **Décision :** avant de réutiliser le cache, chaque lecture calcule une empreinte bon marché (nombre de lieux, dernier `updated_at`, nombre de destinations publiées). Rechargement complet au plus tard après 10 min.
- **Conséquences :** une petite requête par lecture du catalogue. Une modification de destination sans changement de lieu (parcours médaille) n'est prise en compte qu'après 10 min, car aucune interface ne permet cette modification aujourd'hui.

## D-019 — E-mails transactionnels par file d'envoi (outbox)

- **Contexte :** l'auteur d'un avis retiré à la validation de sa revendication (D-017) n'en était prévenu que sur la fiche du lieu. Demande du porteur du projet le 2026-09-26 : le prévenir par e-mail.
- **Décision :**
  - l'e-mail est enregistré dans `email_outbox` **dans la transaction** qui retire l'avis (migration `20260926000100_email_outbox.sql`). Si la validation échoue, aucun e-mail n'existe ; si elle réussit, l'e-mail ne peut pas être perdu ;
  - l'envoi SMTP (nodemailer) a lieu après la réponse HTTP (`after()` de Next.js), puis par `npm run mail:flush`, à planifier toutes les 5 à 15 min en production. Relances à 1, 5, 30 et 120 min, puis abandon après 5 tentatives ; l'administration peut remettre en file ;
  - aucune adresse n'est copiée dans la file : elle est lue dans `auth.users` au moment de l'envoi. La suppression du compte supprime ses e-mails en file. Purge des envois après 30 jours et des abandons après 90 jours ;
  - texte brut en français, sans suivi d'ouverture ni contenu commercial ; sans `SITE_URL`, aucun lien n'est inventé ;
  - sans `SMTP_URL` et `MAIL_FROM`, rien n'est envoyé : les e-mails restent en file et l'administration l'affiche (pas d'échec silencieux).
- **Garantie :** « au moins une fois ». Deux instances n'envoient pas le même e-mail (réservation `skip locked`), mais un arrêt entre l'envoi et son enregistrement peut produire un doublon.
- **Écartés :** envoi dans la transaction (un SMTP lent bloquerait la validation), service d'e-mail propriétaire (dépendance et coût non validés), e-mails HTML (inutile pour un message de service).
- **Tests :** rendu du message (unitaires) ; file, relances, masquage des identifiants, concurrence, purge et envoi SMTP réel vers Mailpit (base réelle) ; parcours complet jusqu'à la réception dans Mailpit (e2e connecté).
- **Complément du 2026-09-26 — « revendication refusée » (migration `20260926000200_claim_rejected_email.sql`) :** le refus d'une revendication envoie au demandeur un e-mail avec le motif et la marche à suivre pour une nouvelle demande. Le motif, auparavant fixe (« Justificatif insuffisant »), est désormais saisi par l'administrateur (suggestions proposées, 3 à 300 caractères), car il est transmis au demandeur. Même file, mêmes garanties.
- **Complément du 2026-09-26 — « gestion retirée » (migration `20260926000300_management_revoked_email.sql`) :**
  - un retrait de la gestion par un administrateur envoie à l'établissement un e-mail avec le motif et ce qui a **réellement** été fait : informations effacées, laissées ou absentes ; réponses publiées retirées ou laissées ; réponses en attente abandonnées. Aucune phrase ne porte sur ce qui n'existait pas ;
  - il indique aussi que l'établissement peut déposer une nouvelle demande ;
  - le renoncement, décidé par l'établissement lui-même, n'envoie pas d'e-mail.

