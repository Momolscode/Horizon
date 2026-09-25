# Plan d'implémentation priorisé

Chaque tâche a un résultat observable et un critère de validation. État tenu à jour dans `docs/STATUS.md`.

## P0 — le cœur qui doit fonctionner

| # | Tâche | Validation | État |
|---|---|---|---|
| 1 | Socle Next.js/TS strict/Tailwind, scripts, CI | `npm run verify` vert | fait |
| 2 | Fond Natural Earth + catalogue démo validé (Zod + intégrité) | `catalog.test.ts` | fait |
| 3 | Logique métier : recherche/filtres, Surprends-nous, ordonnancement, parcelles H3, progression | Vitest (logique pure) | fait |
| 4 | Parcours démo complet : carte, fiche, favoris, excursion persistante, visite, révélation, passeport | Playwright `demo-journey.spec.ts` (mobile + desktop) | fait |
| 5 | Mode connecté : migrations (PostGIS, RLS), API visites idempotente et transactionnelle, magasin Supabase, erreur de configuration explicite | `npm run test:db` sur PostgreSQL réel + e2e connecté | fait (pile Supabase locale ; hébergé non vérifié) |

## P1 — bêta présentable et transmissible

| # | Tâche | Validation | État |
|---|---|---|---|
| 6 | Administration protégée (lieux, signalements, avis, missions, barèmes versionnés, corrections XP) + journal | tests d'accès admin / non-admin (`hardening`, `p1`, e2e avis modéré) | fait |
| 7 | Mesure : événements minimisés et consentis, exclusion démo/tests/admin, activation/rétention avec « Données insuffisantes » | `metrics.test.ts`, `p1.db.test.ts` | fait |
| 8 | Liste d'attente sauvegardée, anti-énumération, champ piège | `connected-waitlist.spec.ts` | fait |
| 9 | Partage d'excursion en lecture seule, révocable, copie indépendante | `p1.db.test.ts`, `connected-p1.spec.ts` | fait (indisponible en démo) |
| 10 | Amis (demande/acceptation/refus/blocage), avis modérés, signalements | `p1.db.test.ts`, `connected-p1.spec.ts` | fait ; défis amicaux non livrés |
| 11 | Missions quotidiennes, hebdomadaires et mensuelles | `missions.test.ts`, `missions.db.test.ts`, `connected-p1.spec.ts` | fait |
| 12 | Dossier de transmission (HANDOVER, ASSET_REGISTER, ACQUISITION_BRIEF, OPERATING_COSTS, DEMO_SCRIPT, KNOWN_LIMITATIONS) + captures réelles | relecture | fait |

## Prochaines fonctions conçues (non livrées)

| # | Fonction | Conception | État |
|---|---|---|---|
| 13 | Mode Duo : co-édition entre amis, visite pour deux confirmée par l'autre | DECISIONS D-016 (validée) | à faire |
| 14 | Référencement et avis élargis (restaurants, entreprises, activités), revendication par les professionnels | DECISIONS D-017 (en cours) | à concevoir |

## P2 — préparé, non livré

Paiements réels (dont le référencement payant souhaité à terme, voir D-017), bons partenaires, publicité récompensée, localisation en arrière-plan, trafic en direct, cartes hors ligne avancées, applications natives, défis amicaux, notifications, IA de reformulation.

## Ordre de travail

Parcours complets (interface + logique + persistance + autorisations + tests) plutôt que tous les écrans avant la logique. Après chaque étape : vérification, puis push sur `main` du dépôt privé (autorisé par le porteur).
