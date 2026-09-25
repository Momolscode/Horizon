# Registre des actifs et licences

Inventaire de ce qui compose HORIZON, avec origine et conditions. Aucune licence open source n'est accordée sur le code du projet : dépôt privé, tous droits réservés au porteur du projet jusqu'à décision contraire.

Ce registre est établi de bonne foi à partir des métadonnées des paquets et des sources citées. **Il ne remplace pas un audit juridique**, à mener avant toute cession ou mise en production.

## 1. Code du projet

| Élément | Origine | Statut |
|---|---|---|
| Code source (`src/`, `scripts/`, `supabase/`, tests) | écrit pour ce projet avec l'assistance de Claude Code (Anthropic) | propriété du porteur ; aucune licence publique |
| Configuration (`next.config.ts`, `eslint.config.mjs`, etc.) | idem, à partir des gabarits officiels Next.js | idem |
| `supabase/config.toml` | généré par la CLI Supabase puis adapté | idem |

## 2. Données

| Élément | Source | Licence / conditions | Remarques |
|---|---|---|---|
| Fond de carte `public/geo/basemap-fr.geojson` | Natural Earth 1:10m, v5.1.2 (`nvkelso/natural-earth-vector`) | domaine public ([conditions](https://www.naturalearthdata.com/about/terms-of-use/)) | découpé et simplifié par `scripts/build-basemap.mjs` ; attribution facultative, affichée quand même |
| Centres des 4 destinations | Natural Earth (couche des lieux peuplés) | domaine public | |
| 32 lieux réels du catalogue démo (noms, coordonnées approximatives) | connaissances générales, **non vérifiées** | noms de lieux et coordonnées approximatives : faits non protégés | aucune donnée copiée d'un site tiers ; toutes les valeurs sont `estimate` ou `unknown` |
| Textes éditoriaux (résumés, « à découvrir », « un peu d'histoire ») | rédigés pour le projet avec l'assistance d'une IA | propriété du porteur | exactitude **non vérifiée** ; à relire avant publication |
| 8 restaurants, amis et avis de démonstration | fictifs, créés pour la démo | propriété du porteur | noms suffixés « (… fictif) » ; profils et avis étiquetés « fictif » |
| Barèmes, niveaux, badges, missions | conçus pour le projet | propriété du porteur | |

**Aucune source n'a été importée** depuis Wikidata, DATAtourisme, data.gouv.fr ou des sites officiels (pas d'accès réseau pendant la construction). Tout import futur doit ajouter ici sa source, sa licence et sa date.

## 3. Visuels

| Élément | Origine | Licence |
|---|---|---|
| Illustrations de lieux (`src/components/PlaceArt.tsx`) | SVG génératifs originaux, produits par du code selon la catégorie et un identifiant | propriété du porteur |
| Icônes d'application (`public/icons/*`, `src/app/icon.png`) | SVG original rendu en PNG par `scripts/generate-icons.mjs` | propriété du porteur |
| Pictogrammes d'interface | [Lucide](https://lucide.dev) via `lucide-react` 1.48.0 | ISC |
| Illustrations de la page d'accueil, mosaïque d'hexagones, image du passeport | composants SVG et canvas originaux | propriété du porteur |
| Captures `docs/screenshots/*` | captures réelles de l'application (script `scripts/screenshots.mjs`) | propriété du porteur |

**Aucune photographie** ni image tierce n'est utilisée.

## 4. Polices

| Police | Paquet | Licence |
|---|---|---|
| Fraunces (variable) | `@fontsource-variable/fraunces` 5.3.0 | SIL Open Font License 1.1 |
| Manrope (variable) | `@fontsource-variable/manrope` 5.3.0 | SIL Open Font License 1.1 |

Les polices sont servies depuis l'application : aucun appel à Google Fonts. L'OFL autorise l'embarquement et l'usage commercial, mais interdit la vente des fichiers de police seuls.

## 5. Dépendances npm

Versions exactes figées dans `package.json` et `package-lock.json`.

### Dépendances d'exécution directes

| Paquet | Version | Licence |
|---|---|---|
| next | 16.3.6 | MIT |
| react, react-dom | 19.2.8 | MIT |
| maplibre-gl | 6.11.2 | BSD-3-Clause |
| h3-js | 4.5.0 | Apache-2.0 |
| @supabase/supabase-js | 2.117.1 | MIT |
| @supabase/ssr | 0.12.7 | MIT |
| pg | 8.23.0 | MIT |
| zod | 4.6.5 | MIT |
| lucide-react | 1.48.0 | ISC |
| server-only | 0.0.1 | MIT |

### Arbre de production complet

Relevé dans `package-lock.json` pour les paquets non-dev, dépendances optionnelles par plateforme comprises : MIT (54), Apache-2.0 (20), ISC (13), BSD-3-Clause (4), BSD-2-Clause (2), 0BSD (1), MIT OR Apache-2.0 (1), OFL-1.1 (2), CC-BY-4.0 (1), LGPL-3.0-or-later seule ou combinée (14).

Deux familles méritent attention :

- **`@img/sharp-*` (libvips, LGPL-3.0-or-later)** : binaires optionnels de `sharp`, que Next.js utilise pour l'optimisation d'images. L'application n'utilise pas `next/image`. En cas de redistribution de binaires, respecter les obligations de la LGPL (bibliothèque liée dynamiquement, remplaçable).
- **`caniuse-lite` (CC-BY-4.0)** : données de compatibilité des navigateurs utilisées au build. L'attribution est conservée dans le paquet.

### Outils de développement

TypeScript (Apache-2.0), ESLint 9 et eslint-config-next (MIT), Tailwind CSS 4 (MIT), Vitest 5 et Vite 8 (MIT), Playwright 1.56.1 (Apache-2.0), tsx (MIT), cross-env (MIT). Ils ne sont pas livrés dans le bundle.

Pour régénérer l'inventaire complet : `npx license-checker --production --summary`, outil non inclus dans le projet et non exécuté ici. Le relevé ci-dessus a été produit en lisant `package-lock.json`.

## 6. Marques et noms

- **HORIZON** est un nom provisoire. Sa disponibilité (marque, domaine, réseaux sociaux) **n'a pas été vérifiée**.
- Les noms de lieux réels, ainsi que Google Maps, Apple Plans et Waze (liens sortants), appartiennent à leurs titulaires. Aucun partenariat n'existe.
