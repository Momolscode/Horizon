# État du projet

_Mis à jour le 2026-09-26 : e-mails « revendication validée », « avis retiré », « revendication refusée » et « gestion retirée » (D-019)._

Environnement de toutes les vérifications ci-dessous :

- conteneur Linux ;
- Node 22.22.2, npm 10 ;
- Next 16.3.6 (Turbopack) ;
- Chromium 1194 headless, via Playwright 1.56.1 (rendu logiciel SwiftShader, WebGL 2) ;
- Supabase CLI 2.117.0 locale : PostgreSQL 17.6, PostGIS 3.3.7, GoTrue, PostgREST, Mailpit 1.30.2 (serveur SMTP de test) ; images tirées de Docker Hub.

Statuts possibles : RÉUSSIE, ÉCHOUÉE, NON EXÉCUTÉE.

## Vérifications

| Vérification | Statut | Commande | Preuve |
|---|---|---|---|
| Types | RÉUSSIE | `npm run typecheck` | 0 erreur |
| Lint (règles React Compiler incluses) | RÉUSSIE | `npm run lint` | 0 erreur, 0 avertissement |
| Tests unitaires | RÉUSSIE | `npm test` | 15 fichiers, 127 tests |
| Intégration sur PostgreSQL/PostGIS réel | RÉUSSIE | `npm run supabase:reset && npm run test:db` | 9 fichiers, 84 tests : RLS, attribution concurrente et idempotente, missions, durcissement, P1, constats de la revue finale, Mode Duo, référencement (retrait, renoncement et avis déposés avant la revendication compris), file d'e-mails (relances, identifiants masqués, concurrence, purge, envoi SMTP réel vers Mailpit) ; relancés deux fois de suite après réinitialisation, sans résidu (40 lieux restants) |
| Build de production démo | RÉUSSIE | `npm run build:demo` | build Next sans erreur |
| Parcours e2e démo, mobile 390×844 et ordinateur 1440×900 | RÉUSSIE | `npm run build:demo && npm run test:e2e` | 13 réussis, 1 ignoré volontairement (test propre au mobile, ignoré en projet ordinateur) |
| Parcours e2e connectés | RÉUSSIE | `npm run test:e2e:connected` | 17 tests sur Supabase local + `next dev`, dont le Duo, le référencement, le retrait de la gestion, le renoncement, la validation, le refus motivé, l'avis retiré et la gestion retirée, chacun avec son e-mail reçu dans Mailpit |
| Migrations sur base vide | RÉUSSIE | `npm run supabase:reset` | 12 migrations + seed de 40 lieux |
| Captures réelles, mobile et ordinateur | RÉUSSIE | `node scripts/screenshots.mjs http://localhost:3100 docs/screenshots` | 46 captures du mode démo dans `docs/screenshots/`, examinées une à une |
| Captures réelles du référencement (connecté, mobile) | RÉUSSIE | `REF_SHOTS=docs/screenshots npm run test:e2e:connected -- e2e/connected-referencing.spec.ts` | 6 captures `ref-*.jpg`, sous `next dev` (`ref-05` et `ref-06` : retrait et renoncement) ; `ref-07` à `ref-10` : les quatre e-mails du référencement affichés par Mailpit |
| Captures réelles du Mode Duo (connecté, mobile) | RÉUSSIE | `DUO_SHOTS=docs/screenshots npm run test:e2e:connected -- e2e/connected-duo.spec.ts` | 5 captures `duo-*.jpg`, prises sous `next dev` (le bouton des outils Next est visible en bas à gauche) |
| Revue indépendante (2 agents en lecture seule : sécurité/intégrité, interface/liens) | RÉUSSIE | voir ci-dessous | 11 + 15 constats, traités |
| Revue indépendante du retrait de gestion (1 agent en lecture seule) | RÉUSSIE | lecture du diff | concurrence retrait/réponse (verrou partagé, test qui échoue sans lui), motif compté en caractères, libellés d'effacement précisés, états de chargement, double envoi, fiche gérée non publiée, tests renforcés ; limites restantes dans KNOWN_LIMITATIONS § 9 |
| CI GitHub Actions | NON EXÉCUTÉE | `.github/workflows/ci.yml` | jamais lancée sur GitHub |
| Projet Supabase hébergé | NON EXÉCUTÉE | — | aucun projet cloud créé |
| Envoi d'e-mails par un fournisseur SMTP réel | NON EXÉCUTÉE | — | seul Mailpit (local) a reçu des e-mails ; délivrabilité (SPF, DKIM) non vérifiée |
| Déploiement | NON EXÉCUTÉE | — | hors autorisation |

## Parcours connectés couverts (e2e)

- Consultation sans compte : rien n'est enregistré et les API sont protégées.
- Inscription, puis favori, excursion, visite, parcelle et passeport persistés et relus après rechargement.
- Retour sur l'onglet (Supabase réémet `SIGNED_IN`) : pas de redémarrage, pas d'état périmé.
- Isolation entre comptes.
- Refus serveur d'une visite simulée.
- Liste d'attente : une seule inscription par adresse, champ piège.
- Partage en lecture seule, révocable.
- Mission récompensée une seule fois.
- Amis : invitation par pseudonyme et acceptation.
- Avis modéré : invisible avant publication, puis publié par un administrateur et journalisé.
- Référencement : proposition d'un lieu, modération et publication « proposé par un membre » ; revendication (SIRET + preuve) inactive avant validation ; informations « fournies par l'établissement » ; avis refusé sans visite déclarée ; réponse de l'établissement invisible avant modération.
- Retrait de la gestion : un administrateur retire la gestion avec un motif et l'effacement des informations ; l'établissement reçoit l'e-mail « gestion retirée » (motif, informations effacées, réponse laissée), voit le motif, perd l'accès, et la fiche n'affiche plus rien « fourni par l'établissement » mais redevient revendicable. Renoncement par l'établissement lui-même. Une demande venant d'une personne qui a déjà noté le lieu est signalée à l'administrateur ; la demande concurrente est refusée avec un motif saisi, que l'établissement reçoit par e-mail ; à la validation, l'avis du membre est retiré et l'e-mail « avis retiré » est reçu par Mailpit, avec le lien vers la fiche ; l'administration affiche l'envoi.
- Mode Duo : invitation d'un ami, acceptation, co-édition, conflit d'enregistrement sans écrasement, « nous y étions », puis confirmation par l'autre qui crédite sa visite.

## Revue finale indépendante : constats et suites

**Serveur et données.** Chaque correctif est couvert par un test dans `src/server/review.db.test.ts`, sauf indication contraire.

| # | Constat | Gravité (revue) | Suite |
|---|---|---|---|
| S1 | Archiver un lieu d'un parcours médaille cassait tout le catalogue connecté | bloquant | corrigé : les parcours ne gardent que les lieux publiés ; une modification rendant le catalogue incohérent est refusée (409) |
| S2 | Retour sur l'onglet : remontage avec un état périmé, risque d'écrasement | important | corrigé : redémarrage seulement si le compte change ; test e2e reproduit sur l'ancien code |
| S3 | Le partage transmettait besoins d'accessibilité, régimes, budget et groupe | important | corrigé : seul le mode de transport est transmis et recopié |
| S4 | Course sur la modération : publication d'un texte non relu | important | corrigé : décision liée à la version relue (409 sinon) |
| S5 | XP de missions par redéclaration d'un lieu déjà visité | mineur | corrigé : seules les premières visites comptent (test unitaire) ; la mission « préparer une sortie » reste répétable, voir KNOWN_LIMITATIONS |
| S6 | Un refus d'ami pouvait être effacé par le demandeur | mineur | corrigé |
| S7 | Énumération des pseudonymes via les blocages | mineur | corrigé : réponse identique et limite de débit |
| S8 | Corrections administratives non idempotentes ; course sur le solde | mineur | corrigé : identifiant de correction et verrou sur le profil |
| S9 | Limiteur remis à zéro par un afflux de clés | mineur | corrigé : espaces de clés séparés, éviction LRU (tests unitaires) |
| S10 | Missions et barème présents seulement dans le seed de démo | mineur | corrigé : migration `20260925000400_reference_data.sql` |
| S11 | Pages de partage conservées par le service worker après révocation | mineur | corrigé : partage, admin et connexion jamais mis en cache ; cache borné. Non couvert par un test automatisé |

**Interface et parcours.** Tests e2e dans `e2e/demo-journey.spec.ts`, sauf indication contraire.

| # | Constat | Suite |
|---|---|---|
| U1 | La barre mobile masquait le bas de la carte, la mention « pas une carte routière » et l'attribution | corrigé, avec test e2e |
| U2 | Surprends-nous échouait à Annecy avec les réglages par défaut | corrigé : essai de chaque point de départ ; test unitaire sur les 4 destinations |
| U3 | Nombres de parcelles et de lieux visités incohérents entre écrans | corrigé : les simulations sont exclues partout et signalées sur la carte |
| U4 | Date, heure, durée, transport et destination non modifiables | corrigé ; la destination reste modifiable tant qu'il n'y a pas d'étape |
| U5 | « Modifier les critères » effaçait les choix | corrigé, avec test e2e |
| U6 | Plantage sur une destination invalide ; pas de pages d'erreur en français | corrigé : `error.tsx`, `global-error.tsx`, `not-found.tsx` en français. `/lieux/<inconnu>` reste une 404 « douce » (voir limites) |
| U7–U9 | Formulations inexactes (« aucun lieu inventé », langues, missions) | reformulées |
| U10 | Budget par défaut (60 €) absent des choix de l'accueil | corrigé |
| U11 | Contraste des badges non obtenus | corrigé (plus d'opacité sur le texte) |
| U12 | Pseudonyme périmé après effacement | corrigé |
| U13 | Titre d'excursion impossible à vider | corrigé (nom par défaut appliqué à l'enregistrement) |
| U14 | Modifications d'excursion perdues sans avertissement | corrigé : confirmation avant de quitter par un lien ou en fermant l'onglet ; pas de test automatisé |
| U15 | Petits défauts (paramètres invalides, `h1` de la carte, appel admin en démo, message de géolocalisation) | corrigés ; bandeau démo tronqué sur mobile laissé en l'état |

**Hypothèses de la revue, non vérifiées et non traitées :**

- focus perdu après la fermeture de l'animation de révélation ;
- flèches du clavier non gérées dans les groupes de boutons radio personnalisés.

Elles figurent dans KNOWN_LIMITATIONS.

## Défauts trouvés par les vérifications elles-mêmes

- `npm run test:db` pointait vers un fichier de configuration inexistant (`.ts` au lieu de `.mts`), ce qui aurait fait échouer la CI. Corrigé.
- Trois scripts npm renvoyaient vers des fichiers absents. Retirés.
- Le test e2e d'avis dépendait de l'état de la base. Il utilise désormais un texte unique par exécution.
- Captures : un artefact sous les destinations de la carte, des contrastes insuffisants en thème nuit (grille, rivières, passeport), un débordement des boutons de la fiche dans le panneau latéral et un logo tronqué dans le rail. Tous corrigés, captures régénérées.

## Non livré

Voir `docs/KNOWN_LIMITATIONS.md` : défis amicaux, notifications, offre payante de référencement (souhaitée, non implémentée), cloud Supabase, SMTP, CI, catalogue vérifié.

## Mode Duo (ajouté après la revue finale)

- Conception validée par le porteur (D-016), puis implémentée : migration, routes serveur, interface, démo indisponible.
- Tests : `src/server/duo.db.test.ts` (8 tests : invitation réservée aux amis, accès de l'invité, colonnes masquées, version et conflit, départ et retrait, visite pour deux créditée une seule fois, refus et expiration sans crédit, fin d'amitié et blocage) ; `e2e/connected-duo.spec.ts`.
- Défaut trouvé pendant l'implémentation : l'éviction du limiteur de débit (correctif S9) parcourait toute la table à chaque requête au-delà de la limite (coût quadratique). Remplacée par une éviction en temps constant ; test existant désormais rapide.
- Le test de RLS « Bob ne voit pas l'excursion d'Alice » a été adapté : `select *` sur les excursions est désormais refusé au navigateur, puisque l'identifiant du propriétaire n'y est plus lisible.

## Référencement (ajouté après le Mode Duo)

- Conception validée par le porteur (D-017), implémentée sans aucune offre payante.
- Tests :
  - `src/modules/catalog/contributions.test.ts` (10) : propositions, doublons, SIRET, informations de l'établissement, et le classement (recherche, filtres, sections, « Surprends-nous ») qui ignore tout statut payant ;
  - `src/server/referencing.db.test.ts` (7) ;
  - `e2e/connected-referencing.spec.ts` (3).
- Défauts trouvés pendant l'implémentation :
  - le cache du catalogue pouvait être périmé d'une instance à l'autre après une publication (voir D-018) ; corrigé ;
  - un test e2e supposait exactement 40 lieux en base ; il accepte désormais les lieux publiés par d'autres parcours ;
  - le premier test base de données du référencement laissait des lieux en base (nettoyage bloqué par les clés étrangères) ; corrigé, les suites sont relancées deux fois sans résidu.
- Le test e2e d'avis existant a été adapté à la nouvelle règle : déclaration de visite avant l'avis.

## Prochaines étapes (décisions du porteur)

1. Vérifier ou remplacer le catalogue (HANDOVER § 4).
2. Créer le projet Supabase hébergé, configurer SMTP, puis déployer.
3. Lancer la CI sur GitHub.
4. Faire valider juridiquement la confidentialité, les CGU et la disponibilité du nom.
