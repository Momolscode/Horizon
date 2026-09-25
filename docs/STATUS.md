# État du projet

_Mis à jour le 2026-09-25, jalon 2 (mode connecté, cœur)._

## Réalisé et vérifié

| Élément | Statut | Commande / preuve | Environnement |
|---|---|---|---|
| Types | RÉUSSIE | `npm run typecheck` | Node 22.22.2, conteneur Linux |
| Lint | RÉUSSIE | `npm run lint` (0 erreur, 0 avertissement) | idem |
| Tests unitaires (80) | RÉUSSIE | `npm test` | idem, fuseau machine forcé sur America/New_York |
| Build de production démo | RÉUSSIE | `npm run build:demo` | Next 16.3.6 / Turbopack |
| Parcours de recette démo (mobile + ordinateur, 8 tests) | RÉUSSIE | `npm run build:demo && npm run test:e2e` | Chromium 1194 headless (SwiftShader, WebGL 2) |
| Migrations sur base vide | RÉUSSIE | `npx supabase db reset` (2 migrations + seed de 40 lieux) | Supabase CLI 2.117.0, PostgreSQL 17, PostGIS 3.3.7 (images Docker Hub) |
| RLS et intégrité en base (15 tests) | RÉUSSIE | `npm run test:db` → `rls.db.test.ts` | idem, rôles Supabase réels (`anon`, `authenticated`) |
| Attribution serveur idempotente et concurrente (11 tests) | RÉUSSIE | `npm run test:db` → `progression.db.test.ts` (10 requêtes simultanées) | idem |
| Parcours connecté : sans compte, inscription, favori, excursion, visite, rechargement, isolation entre comptes, refus des visites simulées (4 tests) | RÉUSSIE | `npm run test:e2e:connected` | Supabase local (GoTrue, PostgREST, PostgreSQL) + `next dev` |
| Liste d'attente réellement stockée, anti-énumération, champ piège | RÉUSSIE | `connected-waitlist.spec.ts` | idem |

## Non exécuté ou non livré

- **Projet Supabase hébergé (cloud) :** NON VÉRIFIÉ. Tous les tests connectés utilisent la pile locale officielle, lancée via la CLI.
- **Confirmation d'e-mail et envoi de mails d'authentification :** NON VÉRIFIÉS. Confirmation désactivée en local, aucun SMTP configuré.
- **Suppression de compte (`DELETE /api/account`) :** implémentée, NON COUVERTE par un test e2e.
- **CI GitHub Actions** (qualité, e2e démo, base + connecté) : fichier fourni, NON EXÉCUTÉE sur GitHub.
- **Liens de navigation externes et adaptateur Open-Meteo :** NON VÉRIFIÉS (aucun accès réseau à ces services).
- **Fonctions P1** (administration, partage, amis, avis, missions, mesure) : schéma en place (migration 2, appliquée et testée sur base vide), interfaces et routes À FAIRE.

## Prochaine tâche

P1 :

- administration protégée (lieux, signalements, avis, corrections XP, journal) ;
- partage d'excursion révocable ;
- missions ;
- amis et avis modérés ;
- tableau de mesure avec « Données insuffisantes ».
