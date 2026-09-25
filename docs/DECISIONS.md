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
