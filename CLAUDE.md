# HORIZON — consignes pour Claude Code

Application web (PWA) de découverte et d'exploration. Nom provisoire. Dépôt privé `momolscode/horizon`.
Les règles Next.js (versions récentes, docs locales) sont dans @AGENTS.md.

## Commandes

```bash
npm ci                      # installe et copie le worker MapLibre dans public/maplibre
npm run dev                 # mode démo (défaut), http://localhost:3000
npm run dev:connected       # mode connecté (variables Supabase requises, sinon écran d'erreur)
npm run typecheck           # next typegen + tsc
npm run lint                # ESLint (règles React Compiler incluses)
npm test                    # Vitest : logique métier, stockage démo, adaptateurs
npm run test:db             # Intégration PostgreSQL/PostGIS réelle (voir docs/HANDOVER.md)
npm run build:demo && npm run test:e2e   # Playwright sur build de production
npm run verify              # typecheck + lint + test + build:demo
```

## Architecture en bref

- `src/modules/*` : logique métier pure et testée (catalogue, découverte, excursions, progression). Aucune dépendance à l'UI ni aux fournisseurs.
- `src/adapters/*` : carte, météo, navigation externe (remplaçables).
- `src/data/*` : contrat `HorizonStore` ; `DemoStore` (navigateur) et magasin connecté (Supabase + API serveur).
- `src/components/*`, `src/app/*` : interface (App Router, Tailwind 4, jetons dans `src/app/globals.css`).
- `supabase/migrations/*` : schéma, RLS, fonctions. `data/catalog/*` : catalogue de démonstration.

## Conventions

- TypeScript strict (`noUncheckedIndexedAccess`). Validation Zod aux frontières (stockage, API, catalogue).
- Une valeur inconnue reste inconnue (`Known<T>`). Jamais de coût inconnu compté comme gratuit.
- Le client ne décide jamais de l'XP, du solde ou du statut premium : en mode connecté, seul le serveur applique `planVisit`.
- Les deux modes partagent la logique, jamais les données. Un mode connecté mal configuré affiche l'erreur, il ne bascule pas en démo.
- Textes d'interface en français ; catégories toujours avec icône + libellé.
- Pour une régression : écrire le test qui la reproduit avant la correction.

## Limites d'autorisation

- Pas de push hors `momolscode/horizon`, pas de déploiement, pas de paiement réel, pas d'envoi commercial sans accord explicite du porteur.
- Ne jamais committer de secret (`.env*` ignorés sauf `.env.example`). Ne pas publier sous licence libre.
- Ne pas mélanger avec d'autres projets de la machine (ex. dépôt LA BEUZE).
- Ne pas présenter de données non vérifiées comme réelles ; ne pas inventer de traction, valorisation ou partenariat.

## Documents de référence

- `docs/PRODUCT_SPEC.md` — spécification détaillée · `docs/IMPLEMENTATION_PLAN.md` — plan priorisé
- `docs/DECISIONS.md` — décisions structurantes · `docs/STATUS.md` — état courant et prochaine tâche (à relire à la reprise)
- `docs/HANDOVER.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/ASSET_REGISTER.md`, `docs/DEMO_SCRIPT.md`
