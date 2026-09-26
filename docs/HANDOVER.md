# Dossier de reprise technique

Ce document permet à une personne qui découvre le dépôt de lancer, comprendre, exploiter et faire évoluer HORIZON. L'état vérifié de chaque point est dans `docs/STATUS.md`. Les limites connues sont dans `docs/KNOWN_LIMITATIONS.md`.

## 1. Vue d'ensemble

HORIZON est une application web (PWA) Next.js. Elle fonctionne selon deux modes, exclusifs et choisis au build par `NEXT_PUBLIC_HORIZON_MODE`.

| | Démo (`demo`, défaut) | Connecté (`connected`) |
|---|---|---|
| Comptes | aucun | Supabase Auth (e-mail + mot de passe) |
| Catalogue | `data/catalog/fr-demo.ts` embarqué | table `public.places` (seed généré depuis le même fichier) |
| Progression | `localStorage` du navigateur | PostgreSQL, attribuée par le serveur |
| Social, partage, avis, admin | fictif ou indisponible, et étiqueté comme tel | réel |
| Configuration incomplète | sans objet | écran d'erreur explicite, jamais de bascule en démo |

Les deux modes partagent la logique métier (`src/modules/*`), jamais les données.

## 2. Architecture du code

```
data/catalog/fr-demo.ts      Catalogue de démonstration (4 destinations, 40 lieux, non vérifiés)
public/geo/                  Fond Natural Earth découpé (GeoJSON + métadonnées de construction)
src/modules/                 Logique pure, testée (Vitest), sans React ni fournisseur
  catalog/                   Schéma Zod, Known<T>, index, contrôles d'intégrité
  discovery/                 Recherche, filtres, sections « Découvrir »
  excursions/                Ordonnancement horaire, moteur « Surprends-nous » (graine déterministe)
  progression/               Barèmes versionnés, parcelles H3, moteur de visite, missions
  admin/metrics.ts           Activation et rétention, avec seuil « Données insuffisantes »
src/adapters/                Carte (style local ou externe), météo, liens de navigation externes
src/data/                    Contrat HorizonStore ; DemoStore (navigateur) ; magasin connecté (Supabase + API)
src/server/                  Code serveur uniquement (`server-only`) : transactions pg, admin, partage, social
src/app/                     Pages (App Router) et routes API
src/components/              Interface (Tailwind 4 ; jetons dans src/app/globals.css)
supabase/migrations/         Schéma, RLS, fonctions, durcissement des privilèges
supabase/seed.sql            Généré par `npm run db:seed:sql` : ne pas éditer à la main
scripts/                     Fond de carte, icônes, seed, admin, captures, e2e connecté
```

Chemins d'écriture en mode connecté :

- **Navigateur → Supabase (supabase-js, sous RLS) :** favoris, collections, excursions, profil, avis, signalements. Seules les données de l'utilisateur sont accessibles.
- **Navigateur → routes serveur Next.js → PostgreSQL (`DATABASE_URL`, transaction) :** visites et progression, missions, partage, amis et blocages, Mode Duo (invitations, visites pour deux), événements de mesure, liste d'attente, suppression de compte, administration.

Mode Duo : la personne invitée lit et modifie l'excursion directement sous RLS (fonction `is_duo_guest`). Chaque modification incrémente `excursions.version` ; le navigateur n'enregistre que si la version n'a pas changé, sinon il affiche la version à jour. Le navigateur ne lit pas `user_id` ni `updated_by` des excursions.

Chaque route mutante :

- vérifie la session ;
- rejette les requêtes intersites (`src/server/request-guard.ts`) ;
- valide son entrée avec Zod ;
- limite le débit, en mémoire et par instance.

Les tables de progression (`visits`, `parcels`, `xp_ledger`, `badges_awarded`, `mission_completions`) n'ont aucun droit d'écriture pour `anon` ni pour `authenticated`.

## 3. Lancer le projet

Prérequis : Node.js ≥ 22.12 et npm 10. Docker pour la pile Supabase locale.

```bash
npm ci                         # copie aussi le worker MapLibre dans public/maplibre
npm run dev                    # démo sur http://localhost:3000
```

### Mode connecté en local (pile Supabase officielle)

```bash
npm run supabase:start         # npx supabase@2.117.0 start (Docker)
npm run supabase:reset         # migrations + seed sur une base vide
npx supabase@2.117.0 status -o env   # affiche API_URL, PUBLISHABLE_KEY, DB_URL
```

Reporter ces valeurs dans `.env.local` :

- `API_URL` dans `NEXT_PUBLIC_SUPABASE_URL` ;
- `PUBLISHABLE_KEY` dans `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ;
- `DB_URL` dans `DATABASE_URL`.

Lancer ensuite `npm run dev:connected`.

Dans cet environnement de construction, les images ont été tirées de Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`), faute d'accès au registre par défaut. Ce réglage n'est normalement pas nécessaire.

Comptes de test :

- aucun compte n'est livré ;
- créer un compte depuis `/connexion`, car la confirmation d'e-mail est désactivée en local (`supabase/config.toml`) ;
- les tests créent et suppriment leurs propres comptes.

Droits administrateur : `DATABASE_URL=... npm run admin:grant -- personne@exemple.fr` (ou `--revoke`). L'action est tracée dans `admin_audit_log`.

E-mails en local : la pile démarre Mailpit (`[local_smtp]` de `supabase/config.toml`), qui capte tous les messages sans rien envoyer à l'extérieur. Mettre `SMTP_URL=smtp://127.0.0.1:54325` et `MAIL_FROM="HORIZON <no-reply@horizon.local>"` dans `.env.local`, puis consulter les messages sur http://127.0.0.1:54324. `npm run test:e2e:connected` le configure seul.

### Tests

| Commande | Portée | Prérequis |
|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm test` | types, lint, logique pure et stockage démo | aucun |
| `npm run build:demo && npm run test:e2e` | parcours démo, mobile (390×844) et ordinateur (1440×900) | Chromium Playwright |
| `npm run test:db` | RLS, attribution concurrente, missions, durcissement, P1, constats de la revue finale, référencement, file d'e-mails | base locale Supabase (`TEST_DATABASE_URL`, par défaut `127.0.0.1:54322`) avec Mailpit (SMTP 54325, interface 54324), **fraîchement réinitialisée** (`npm run supabase:reset`) : deux tests comptent les 40 lieux du seed, et les parcours e2e connectés ajoutent des lieux à chaque exécution |
| `npm run test:e2e:connected` | inscription, persistance, isolation, liste d'attente, P1, référencement, e-mail reçu dans Mailpit | pile Supabase locale démarrée (Mailpit compris) et réinitialisée |
| `node scripts/screenshots.mjs [url] [dossier]` | captures réelles pilotées | serveur démo sur le port 3100 |

## 4. Données

### Catalogue

- `data/catalog/fr-demo.ts` : 4 destinations dont les centres viennent de Natural Earth, et 40 lieux. Parmi ces lieux, 32 sites réels cités avec des coordonnées approximatives et des textes non vérifiés, et 8 restaurants fictifs nommés comme tels.
- Chaque information pratique suit `Known<T>` :
  - `known` : valeur sourcée et datée ;
  - `estimate` : estimation étiquetée ;
  - `unknown` : inconnue, affichée comme telle.

  Aucune valeur du catalogue actuel n'a le statut `known`, et un test l'impose.

**Importer un catalogue vérifié :**

1. Produire les lieux au format `PlaceSchema` (`src/modules/catalog/schema.ts`), avec une source (`sources`) et une date de vérification pour toute valeur `known`.
2. Pour la démo : remplacer ou compléter `data/catalog/*.ts`, puis lancer `npm test` pour la validation Zod et les contrôles d'intégrité.
3. Pour le mode connecté, au choix :
   - `npm run db:seed:sql` régénère `supabase/seed.sql` ;
   - un script d'import insère dans `public.places`, sans oublier `h3_r8` (cellule résolution 8) et `location` (geography).
4. Vérifier les licences des sources (Wikidata CC0, données ouvertes sous Licence Ouverte Etalab, etc.) et les ajouter à `docs/ASSET_REGISTER.md`.

### Barèmes et missions

- `progression_settings` contient des barèmes versionnés au format `ProgressionConfig` (validés par Zod). Une seule version est active à la fois ; l'administration en crée une nouvelle au lieu d'écraser l'ancienne.
- `missions` contient les définitions. L'évaluation se fait côté serveur, sur la date de création des événements, dans le fuseau Europe/Paris. Seule la première visite réelle d'un lieu compte.
- Le barème v1 et les 4 missions sont fournis par la migration `20260925000400_reference_data.sql` (`on conflict do nothing`) : une installation de production n'a pas besoin du seed de démonstration pour les avoir.

### Référencement (D-017)

Circuit de modération :

1. Un membre propose un lieu via `/lieux/proposer`, ce qui appelle `POST /api/propositions` (doublons probables signalés, confirmation possible).
2. L'administrateur l'examine dans l'onglet « Propositions » de `/admin`. S'il le publie, le lieu est inséré dans `places` avec la source `contribution-membres`, non vérifié, cellule H3 calculée ; le catalogue est revalidé dans la transaction.
3. Un établissement revendique la fiche avec son SIRET et une preuve (`POST /api/revendications`). L'administrateur valide dans l'onglet « Revendications ». La validation retire les avis que le demandeur avait déposés sur ce lieu (motif « conflit d'intérêts », journalisé dans `claim.approve`).
4. L'établissement corrige ses informations depuis `/contributions` (`PATCH /api/pro/lieux/[id]`) et répond aux avis (`POST /api/pro/reponses`). Les réponses sont modérées dans l'onglet « Réponses ».
5. Un refus exige un motif, saisi dans l'onglet « Revendications » : il est affiché au demandeur et lui est envoyé par e-mail (« revendication refusée »). Si, à la validation, le demandeur avait noté le lieu, un e-mail « avis retiré » est mis en file dans la même transaction que la validation, puis envoyé (D-019). L'onglet « Vue d'ensemble » de `/admin` affiche l'état des envois : SMTP configuré ou non, en attente, abandonnés, dernière erreur.
6. Fin de gestion :
   - **Retrait par l'administrateur :** carte « Fiches gérées » de l'onglet « Revendications », via `PATCH /api/admin/revendications/[id]` avec `decision: "revoke"`, un motif et les options `clearInfo` et `removeReplies`. Le retrait est journalisé (`claim.revoke`).
   - **Renoncement par l'établissement :** depuis `/contributions`, via `POST /api/pro/lieux/[id]/renonciation`.
   - Dans les deux cas, la revendication passe à `revoked` et la fiche redevient revendicable. Pour transférer une fiche, il faut retirer la gestion puis faire valider la nouvelle revendication.

Le cache du catalogue est revalidé par empreinte à chaque lecture (D-018).

### Cohérence du catalogue

- Une modification de lieu par l'administration (`src/server/places-admin.ts`) est validée en relisant le catalogue dans la même transaction. Si elle le rendait incohérent (parcours médaille sous 3 lieux, valeur « connue » sur un lieu non vérifié), elle est refusée avec une erreur 409.
- Les lieux dépubliés sortent automatiquement des parcours médaille.

### Données personnelles (mode connecté)

| Donnée | Table | Finalité | Suppression |
|---|---|---|---|
| E-mail, mot de passe haché | `auth.users` (Supabase) | authentification | suppression du compte (cascade) |
| Pseudonyme, visibilité, consentement mesure | `profiles` | profil, amis | cascade |
| Favoris, collections, excursions | tables du même nom | fonctions de l'app | cascade |
| Visites (lieu, date déclarée, statut, note, distance et précision du contrôle ponctuel), parcelles, XP | `visits`, `parcels`, `xp_ledger`, `badges_awarded` | progression | cascade |
| Invitations Duo (excursion, personne invitée, statut) | `excursion_members` | co-édition entre amis | cascade (suppression du compte ou de l'excursion) ; supprimées à la fin de l'amitié ou au blocage |
| Visites pour deux (lieu, date, auteur, destinataire, statut) | `duo_visit_requests` | confirmation par l'autre personne | cascade ; expirées à la fin de l'amitié ou au blocage |
| Événements de mesure | `events` | mesure d'usage, **uniquement si consentement** (désactivé par défaut) | cascade |
| Liste d'attente | `waitlist` (e-mail, date de consentement, empreinte salée d'IP facultative) | contact bêta | manuelle (aucune interface) |
| Avis et signalements d'avis | `reviews`, `review_reports` | modération | cascade |
| Propositions de lieux (contenu, position, auteur) | `place_proposals` | référencement modéré | l'auteur devient vide à la suppression du compte ; le lieu publié reste (contribution anonymisée) |
| Revendications (SIRET, preuve : e-mail professionnel ou description du justificatif) | `place_claims` | vérification de l'établissement | cascade à la suppression du compte ; **données professionnelles à traiter avec soin** |
| E-mails de notification (type, nom du lieu, motif de refus, dates d'envoi ; **aucune adresse**) | `email_outbox` | prévenir l'auteur d'un avis retiré ou d'une revendication refusée | cascade à la suppression du compte ; envoyés purgés après 30 jours, abandons après 90 (`npm run mail:flush`) |
| Réponses des établissements aux avis | `review_replies` | droit de réponse | cascade |
| Signalements d'erreur sur un lieu | `error_reports` | qualité du catalogue | conservés sans auteur (`on delete set null`) |
| Journal d'administration | `admin_audit_log` | traçabilité | conservé (sans clé étrangère vers l'administrateur) |

Autres garanties :

- **Aucune coordonnée GPS n'est stockée.** Pour le contrôle « sur place », la position ponctuelle est envoyée à `POST /api/visits`, comparée au lieu par le serveur, puis abandonnée. Seuls la distance, la précision et le résultat sont conservés (`visits.proximity`). Le contrôle reste falsifiable (voir KNOWN_LIMITATIONS). Il est déclaratif et falsifiable (voir KNOWN_LIMITATIONS).
- L'export JSON des données est disponible dans Paramètres.
- La suppression du compte passe par `DELETE /api/account?confirm=SUPPRIMER`.

**À faire avant ouverture au public (non réalisé) :**

- politique de confidentialité et mentions légales validées par un juriste ;
- registre des traitements ;
- durée de conservation de la liste d'attente et des événements ;
- procédure de purge dans les sauvegardes ;
- adresse de contact (`NEXT_PUBLIC_SUPPORT_EMAIL`).

## 5. Services externes

| Service | Usage | État |
|---|---|---|
| Supabase (Auth, PostgreSQL + PostGIS) | mode connecté | vérifié en **local** uniquement ; projet hébergé non créé |
| Natural Earth | fond de carte embarqué | domaine public ; aucun appel réseau à l'exécution |
| Fournisseur de tuiles MapLibre | optionnel (`NEXT_PUBLIC_MAP_STYLE_URL`) | non configuré ; conditions et attribution à vérifier |
| Open-Meteo | météo optionnelle (`NEXT_PUBLIC_WEATHER_PROVIDER=open-meteo`) | adaptateur écrit, **non vérifié** faute de réseau ; usage commercial soumis à abonnement |
| Google Maps, Apple Plans, Waze | liens sortants « Y aller » | formats d'URL non vérifiés en conditions réelles |
| SMTP | e-mails d'authentification (Supabase Auth) et notifications de l'application (`SMTP_URL`, `MAIL_FROM`) | non configuré ; notifications testées contre Mailpit en local uniquement |

## 6. Déploiement (non réalisé)

Aucun déploiement n'a été effectué : il demande l'accord du porteur du projet. Étapes prévues :

1. Créer un projet Supabase (région UE), puis appliquer `supabase/migrations/*` (`supabase db push`), qui apportent aussi le barème v1 et les missions. Charger ensuite un catalogue vérifié ; le seed n'est que la démonstration.
2. Configurer Auth : URL du site, redirections, confirmation d'e-mail, SMTP, longueur minimale du mot de passe.
3. Héberger Next.js (Vercel, ou tout hôte Node 22). Variables :
   - `NEXT_PUBLIC_HORIZON_MODE=connected` ;
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ;
   - `DATABASE_URL` (pooler Supabase en mode transaction), `WAITLIST_HASH_SALT` ;
   - notifications : `SMTP_URL` (identifiants compris, secret), `MAIL_FROM`, `SITE_URL` (adresse publique, pour les liens des e-mails).
4. Planifier `npm run mail:flush` toutes les 5 à 15 min (cron de l'hébergeur ou tâche externe) : relances, purge (D-019).
5. La CSP (`next.config.ts`) dérive `connect-src` des variables : reconstruire après tout changement de fournisseur.
6. Le limiteur de débit est en mémoire et par instance. En production multi-instances, le remplacer par un stockage partagé (Redis, table Postgres). Vérifier aussi que l'hébergeur écrase bien `x-forwarded-for`, sur lequel repose la clé des routes anonymes.
7. Lancer la CI (`.github/workflows/ci.yml`), qui n'a jamais été exécutée sur GitHub.

## 7. Sauvegarde et restauration

- **Démo :** rien côté serveur. L'utilisateur peut exporter ses données en JSON.
- **Connecté :** sauvegardes gérées par Supabase selon l'offre (à vérifier). Sauvegarde manuelle : `pg_dump "$DATABASE_URL" --schema=public --schema=auth -Fc -f horizon.dump`. Restauration sur une base vide : `pg_restore -d "$DATABASE_URL" horizon.dump`.
- Aucune restauration n'a été testée.

## 8. Quotas et coûts

Voir `docs/OPERATING_COSTS.md`. Aucune offre n'a été souscrite et aucun montant n'a été vérifié.

## 9. Internationalisation

Les textes d'interface sont écrits en français, directement dans les composants. Aucune bibliothèque i18n n'est intégrée.

Pour traduire :

1. Extraire les chaînes, par exemple avec `next-intl` et un segment `[locale]`.
2. Traduire les libellés des catégories (`src/modules/catalog/categories.ts`), des badges et des niveaux (`src/modules/progression/config.ts`).
3. Traduire les textes éditoriaux du catalogue.

Les dates et montants passent déjà par `Intl` (`src/modules/shared/time.ts`, `money.ts`).

## 10. Points d'attention pour la suite

- Next.js 16 : `proxy.ts` remplace `middleware.ts`, les `params` sont asynchrones, et la documentation se trouve dans `node_modules/next/dist/docs` (voir `AGENTS.md`).
- React Compiler (règles ESLint) : pas de `setState` dans les effets, pas de lecture de ref pendant le rendu.
- MapLibre 6 : ESM uniquement. Le worker est copié dans `public/maplibre` (`scripts/copy-maplibre-worker.mjs`) et WebGL 2 est requis.
- Changer la résolution H3 invalide les parcelles existantes (voir DECISIONS D-007).
