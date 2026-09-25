# Note de présentation à un acquéreur potentiel

Cette note décrit **ce qui existe réellement** dans le dépôt et ce qui reste à faire. Elle ne contient aucune valorisation, aucun chiffre de traction, de revenu ou d'audience, aucun partenariat et aucune promesse de revente : il n'en existe pas. Les éléments marqués « Hypothèse » ne sont pas démontrés.

## 1. En une phrase

HORIZON transforme des idées de sorties éparpillées en excursions concrètes, puis transforme les visites en une carte personnelle qui se révèle par parcelles hexagonales, et en un passeport d'exploration.

## 2. Ce qui est cédable aujourd'hui

| Actif | État |
|---|---|
| Application web Next.js 16 / React 19 / TypeScript strict, PWA installable | fonctionnelle en démonstration ; mode connecté fonctionnel sur une pile Supabase **locale** |
| Code source | environ 17 700 lignes TypeScript/TSX dans `src/` (186 fichiers, tests compris) et environ 970 lignes de migrations SQL (7 migrations), relevé du 2026-09-25 |
| Tests automatisés | unitaires (Vitest), intégration sur PostgreSQL réel, parcours Playwright démo et connectés ; résultats dans `docs/STATUS.md` |
| Schéma de données avec sécurité au niveau des lignes (RLS) | 29 tables, attribution serveur transactionnelle et idempotente |
| Administration | lieux, signalements, avis, propositions de lieux, revendications, réponses des établissements, missions, barèmes versionnés, corrections d'XP, journal d'audit, tableau de mesure |
| Référencement élargi | propositions de lieux par les membres (modérées), revendication de fiche par les établissements (SIRET + preuve, validation manuelle), retrait ou renoncement de la gestion, avis après visite déclarée, réponses gratuites ; **aucune offre payante implémentée** |
| Identité visuelle et illustrations génératives originales | voir `docs/ASSET_REGISTER.md` |
| Documentation de reprise | `docs/HANDOVER.md`, `docs/DECISIONS.md`, `docs/PRODUCT_SPEC.md`, `docs/KNOWN_LIMITATIONS.md` |

**Non inclus, car inexistant :**

- utilisateurs, liste d'attente remplie, contenus vérifiés ;
- nom de domaine, marque déposée ;
- comptes chez des fournisseurs ;
- contrats, revenus.

## 3. Ce qui distingue le produit (hypothèses de valeur)

- **Carte qui se révèle :** chaque visite lève le voile sur une parcelle H3 d'environ 0,74 km². *Hypothèse :* ce mécanisme de collection motive des sorties répétées. Aucune mesure ne le démontre.
- **« Surprends-nous » :** compose une sortie de 3 à 5 étapes selon le budget, le temps, le transport et les envies. Les coûts inconnus sont signalés, jamais comptés comme gratuits. La composition est déterministe et explicable, sans IA ni API payante. *Hypothèse :* réduit la charge de planification.
- **Honnêteté des données par conception :** type `Known<T>` (connu, estimé, inconnu) propagé jusqu'à l'interface. *Hypothèse :* renforce la confiance face aux agrégateurs.
- **Économie prudente :** XP non dépensable, points de récompense sans échange possible, missions sans récompense pour les avis, plafond de visites. Les mécanismes de triche les plus simples sont bloqués côté serveur et testés.

## 4. Ce qu'un acquéreur devrait financer ou faire

1. **Catalogue vérifié.** C'est le prérequis principal : les 40 lieux actuels ne sont pas vérifiés, et 8 restaurants sont fictifs. Voir HANDOVER § 4.
2. Projet Supabase hébergé, SMTP, déploiement, CI exécutée sur GitHub.
3. Validation juridique : confidentialité, CGU, mentions légales ; vérification de la disponibilité du nom.
4. Tests avec de vrais utilisateurs. Aucun n'a eu lieu.
5. Fonctions non livrées : défis amicaux, notifications, applications natives, paiements ou partenaires. Le référencement payant (fiche enrichie) est souhaité mais pas implémenté : c'est une *hypothèse* de revenu, sans aucune donnée. Le Mode Duo et le référencement sont livrés, mais testés seulement sur la pile locale.

## 5. Risques connus

- Contrôle de présence falsifiable, car déclaratif et fondé sur la position du navigateur. Atténué : l'XP n'a aucune valeur monétaire.
- Carte de fond simplifiée, sans rues. Un fournisseur de tuiles serait nécessaire pour un usage de terrain (coût à vérifier).
- Dépendance à Supabase (Auth + PostgreSQL). Le schéma reste du PostgreSQL standard, avec des fonctions propres à Supabase (`auth.uid()`).
- ESLint 9 en fin de maintenance ; montées de version à planifier (voir DECISIONS D-001).
- Liste complète : `docs/KNOWN_LIMITATIONS.md`.

## 6. Pour évaluer rapidement

```bash
npm ci && npm run dev    # puis http://localhost:3000 → « Essayer la démo »
```

Scénario guidé de 5 minutes avec captures réelles : `docs/DEMO_SCRIPT.md`.
