# État du projet

_Mis à jour le 2026-09-25, fin du jalon 1 (P0 démo)._

## Réalisé et vérifié

| Élément | Statut | Commande / preuve | Environnement |
|---|---|---|---|
| Types | RÉUSSIE | `npm run typecheck` | Node 22.22.2, conteneur Linux |
| Lint | RÉUSSIE | `npm run lint` (0 erreur, 0 avertissement) | idem |
| Tests unitaires (80) | RÉUSSIE | `npm test` | idem, fuseau machine forcé sur America/New_York |
| Build de production démo | RÉUSSIE | `npm run build:demo` | Next 16.3.6 / Turbopack |
| Parcours de recette démo (mobile 390×844 et ordinateur 1440×900) | RÉUSSIE | `npm run test:e2e`, 8 tests | Chromium 1194 headless (SwiftShader, WebGL 2) |

## Parcours de recette démo couvert par Playwright

Consultation sans compte ni GPS → recherche d'une ville → filtre « Gratuit » (coûts inconnus exclus) → liste → ouverture d'un lieu → ajout aux favoris → « Surprends-nous » (3 à 5 étapes) → réordonnancement et remplacement d'étape → enregistrement → rechargement et données retrouvées → visite déclarée par double clic (un seul crédit) → révélation de la parcelle → passeport mis à jour (XP, parcelle 1/154, badge, carnet) → rechargement → réinitialisation.

## Non exécuté ou non livré à ce stade

- Mode connecté (Supabase, RLS, API serveur des visites) : **NON LIVRÉ** au jalon 1. Il affiche une erreur explicite, sans bascule en démo.
- Liste d'attente : l'API répond « stockage indisponible » tant que `DATABASE_URL` est absente. Le stockage réel n'est pas encore testé.
- CI GitHub Actions : fichier fourni, **NON EXÉCUTÉE** sur GitHub à ce stade.
- Liens de navigation externes (Google Maps, Waze, Plans, OSM) et adaptateur Open-Meteo : **NON VÉRIFIÉS** (pas d'accès réseau à ces services depuis l'environnement).

## Prochaine tâche

Mode connecté :

- migrations PostgreSQL/PostGIS et RLS ;
- route serveur de visite transactionnelle et idempotente ;
- magasin Supabase ;
- tests d'intégration sur base réelle, isolation entre comptes et concurrence ;
- tentative de pile Supabase locale via Docker Hub.
