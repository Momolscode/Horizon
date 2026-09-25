# Plan d'implémentation priorisé

Chaque tâche a un résultat observable et un critère de validation. État tenu à jour dans `docs/STATUS.md`.

## P0 — le cœur qui doit fonctionner

| # | Tâche | Validation | État |
|---|---|---|---|
| 1 | Socle Next.js/TS strict/Tailwind, scripts, CI | `npm run verify` vert | fait |
| 2 | Fond Natural Earth + catalogue démo validé (Zod + intégrité) | `catalog.test.ts` | fait |
| 3 | Logique métier : recherche/filtres, Surprends-nous, ordonnancement, parcelles H3, progression | Vitest (logique pure) | fait |
| 4 | Parcours démo complet : carte, fiche, favoris, excursion persistante, visite, révélation, passeport | Playwright `demo-journey.spec.ts` (mobile + desktop) | fait |
| 5 | Mode connecté : migrations (PostGIS, RLS), API visites idempotente et transactionnelle, magasin Supabase, erreur de configuration explicite | `npm run test:db` sur PostgreSQL réel + e2e connecté | à faire |

## P1 — bêta présentable et transmissible

| # | Tâche | Validation |
|---|---|---|
| 6 | Administration protégée (lieux, sources, signalements, missions, barèmes, corrections XP) + journal | tests d'accès admin / non-admin |
| 7 | Mesure : événements minimisés, exclusion démo/tests/admin, tableau activation/rétention avec « Données insuffisantes » | tests de calcul de cohortes |
| 8 | Liste d'attente sauvegardée (fait côté API, stockage connecté) | test d'intégration |
| 9 | Partage d'excursion en lecture seule, révocable, copie | test de révocation |
| 10 | Amis (demande/acceptation/refus/blocage), avis modérés, signalements | tests RLS + modération |
| 11 | Missions quotidiennes/hebdo/mensuelles | tests de progression |
| 12 | Dossier de transmission (HANDOVER, ASSET_REGISTER, ACQUISITION_BRIEF, OPERATING_COSTS, DEMO_SCRIPT, KNOWN_LIMITATIONS) | relecture |

## P2 — préparé, non livré

Paiements réels, bons partenaires, publicité récompensée, localisation en arrière-plan, trafic en direct, cartes hors ligne avancées, applications natives, mode Duo collaboratif (après sécurisation des invitations), IA de reformulation.

## Ordre de travail

Parcours complets (interface + logique + persistance + autorisations + tests) plutôt que tous les écrans avant la logique. Après chaque étape : vérification, puis push sur `main` du dépôt privé (autorisé par le porteur).
