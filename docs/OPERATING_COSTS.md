# Coûts d'exploitation

**Aucun montant de ce document n'a été vérifié.** Aucune offre n'a été souscrite, aucune facture n'existe, et les grilles tarifaires des fournisseurs n'ont pas pu être consultées pendant la construction (pas d'accès réseau). Chaque ligne indique donc ce qu'il faut vérifier, pas un prix.

## 1. Coût actuel

| Poste | Coût actuel |
|---|---|
| Hébergement | 0 : rien n'est déployé |
| Base de données / authentification | 0 : pile Supabase locale uniquement |
| Fond de carte | 0 : Natural Earth embarqué, domaine public, sans appel réseau |
| Météo | 0 : aucun fournisseur activé |
| Nom de domaine, e-mail | 0 : aucun acheté |

## 2. Postes à prévoir pour une bêta connectée

| Poste | Fournisseur envisagé | Variable de coût | Montant |
|---|---|---|---|
| Hébergement Next.js | Vercel ou hôte Node 22 | offre, trafic, exécutions de fonctions serveur | **À vérifier** |
| PostgreSQL + Auth | Supabase (région UE) | offre, taille de base, utilisateurs actifs mensuels, sauvegardes, mise en pause des projets inactifs sur les offres gratuites | **À vérifier** |
| Pooler de connexions | Supabase (inclus selon l'offre) | connexions simultanées (`DATABASE_POOL_MAX`) | **À vérifier** |
| E-mails d'authentification | fournisseur SMTP (confirmation d'inscription, réinitialisation) | volume d'e-mails | **À vérifier** |
| Tuiles de carte détaillées (optionnel) | fournisseur compatible MapLibre | chargements de carte ou de tuiles, conditions d'attribution | **À vérifier** |
| Météo (optionnel) | Open-Meteo ou autre | usage commercial soumis à abonnement chez Open-Meteo, à confirmer | **À vérifier** |
| Stockage partagé du limiteur de débit (multi-instances) | Redis managé ou table Postgres | requêtes | **À vérifier** |
| Nom de domaine | registraire | disponibilité non vérifiée | **À vérifier** |
| Supervision des erreurs (optionnel) | aucun intégré | événements | **À vérifier** |

## 3. Postes non techniques

Ces postes ne sont pas chiffrés :

- **Vérification et mise à jour du catalogue :** coût humain ou licence de données. C'est le poste le plus structurant, car le catalogue actuel n'est pas vérifié.
- **Modération des avis et des signalements :** temps humain, avec une interface d'administration fournie.
- **Conseil juridique :** confidentialité, CGU, marque.
- **Assistance utilisateurs :** adresse à configurer (`NEXT_PUBLIC_SUPPORT_EMAIL`).

## 4. Leviers de maîtrise déjà en place

- Fond de carte local : pas de facturation au chargement de carte tant qu'aucun style externe n'est configuré.
- Service worker à cache limité : pas de pré-téléchargement massif.
- Mesure d'usage minimale et soumise au consentement (table `events`, 7 types d'événements, charge utile de moins de 2 Kio).
- Limiteurs de débit sur les routes coûteuses : visites, partages, amis, missions, événements, liste d'attente.
- Aucun appel à une IA ni à une API payante à l'exécution.

## 5. Pour chiffrer

1. Choisir la région et l'hébergeur.
2. Relever les grilles tarifaires du jour et les dater dans ce document.
3. Estimer utilisateurs actifs, visites par jour et chargements de carte. Aucune hypothèse de volume n'est fournie ici, faute de données.
4. Remplacer chaque « À vérifier » par un montant daté et sourcé.
