# HORIZON

**Découvre des lieux. Vis des expériences. Révèle ton monde.**

Application web mobile-first (PWA) de découverte et d'exploration :

- une carte personnelle qui se révèle au fil des visites (parcelles H3) ;
- « Surprends-nous », qui compose une sortie de 3 à 5 étapes ;
- un passeport d'exploration partageable.

Nom provisoire : sa disponibilité et celle du domaine n'ont pas été vérifiées. Dépôt privé, aucune licence open source accordée.

> **État :** prototype fonctionnel. Le mode démonstration est livré et testé de bout en bout. Pour le mode connecté, voir `docs/STATUS.md` : chaque vérification y porte le statut RÉUSSIE, ÉCHOUÉE ou NON EXÉCUTÉE.

## Prérequis

- Node.js ≥ 22.12 (testé avec 22.22.2) et npm 10.
- Pour les tests de bout en bout : Chromium via Playwright (`npx playwright install chromium`, sauf si un navigateur compatible est préinstallé).
- Pour le mode connecté et ses tests : PostgreSQL 16 avec PostGIS 3, ou un projet Supabase (voir `docs/HANDOVER.md`).

## Démarrage rapide (mode démo, sans aucune clé)

```bash
npm ci
npm run dev          # http://localhost:3000 → « Essayer la démo »
```

En démo :

- Les données sont fictives ou non vérifiées, et un bandeau « Démonstration » le rappelle en permanence.
- La progression reste dans le navigateur. Le bouton « Réinitialiser » l'efface.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `npm run dev:connected` | Serveur de développement (démo / connecté) |
| `npm run build:demo` puis `npm start` | Build de production en démo |
| `npm run typecheck` | Types (routes générées + tsc) |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Parcours de recette Playwright (après `npm run build:demo`) |
| `npm run test:db` | Tests d'intégration sur PostgreSQL/PostGIS réel |
| `npm run verify` | typecheck + lint + tests + build |
| `npm run basemap:build` | Régénère le fond Natural Earth (réseau requis) |

## Configuration

Copier `.env.example` en `.env.local`. Toutes les variables y sont décrites. En l'absence de fournisseur :

- la carte utilise un fond local simplifié ;
- la météo est affichée comme indisponible ;
- l'application n'utilise aucun service d'itinéraire (distances à vol d'oiseau, étiquetées comme telles).

## Documentation

- `CLAUDE.md` — consignes de travail pour Claude Code ;
- `docs/PRODUCT_SPEC.md` — spécification ;
- `docs/IMPLEMENTATION_PLAN.md` — plan priorisé ;
- `docs/DECISIONS.md` — décisions structurantes ;
- `docs/STATUS.md` — état courant.
