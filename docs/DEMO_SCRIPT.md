# Scénario de démonstration (environ 5 minutes)

Toutes les images sont des **captures réelles** de l'application en mode démo (build de production). Elles ont été produites par `scripts/screenshots.mjs`, qui pilote l'interface comme un utilisateur, sans injecter d'état. Mobile : 390×844 (densité 2). Ordinateur : 1440×900.

Pour les régénérer :

```bash
npm run build:demo && npx next start -p 3100
node scripts/screenshots.mjs http://localhost:3100 docs/screenshots
```

À dire d'emblée : **les lieux ne sont pas vérifiés, les restaurants et les personnes sont fictifs**. Le bandeau « Démonstration » le rappelle en permanence.

---

## 1. La promesse (20 s)

Page d'accueil : les trois signatures (carte qui se révèle, Surprends-nous, passeport), le bouton « Essayer la démo » et la liste d'attente.

| Mobile | Ordinateur |
|---|---|
| ![Accueil mobile](screenshots/mobile-01-accueil.jpg) | ![Accueil ordinateur](screenshots/desktop-01-accueil.jpg) |

## 2. La carte et le voile (60 s)

1. « Essayer la démo » ouvre la carte de France et ses quatre destinations.
2. Toucher « Lyon » : la ville est voilée d'hexagones (parcelles H3, résolution 8). Le panneau indique « 0 parcelle explorée sur 154 dans l'emprise ».
3. Montrer la mention « Fond simplifié : pas de routes ni de rues. Ce n'est pas une carte routière ».

| France | Lyon voilée |
|---|---|
| ![Carte France](screenshots/mobile-02-carte-france.jpg) | ![Lyon voilée](screenshots/mobile-03-carte-lyon-voile.jpg) |

Recherche (« fourv »), puis fiche du lieu : coût et horaires **inconnus**, affichés comme tels ; badge « Non vérifié » ; météo « indisponible », car aucun fournisseur n'est configuré.

| Recherche | Fiche du lieu (ordinateur) |
|---|---|
| ![Recherche](screenshots/mobile-04-recherche.jpg) | ![Fiche](screenshots/desktop-05-fiche-lieu.jpg) |

Filtres (catégories avec icône et libellé, budget, lieux au coût inconnu inclus ou non) et vue liste :

| Filtres | Liste |
|---|---|
| ![Filtres](screenshots/mobile-06-filtres.jpg) | ![Liste](screenshots/mobile-07-liste.jpg) |

## 3. Surprends-nous (60 s)

1. Onglet Excursions (vide au départ), puis « Surprends-nous » à Lyon.
2. Présenter le formulaire : date, heure, durée, budget, transport, envies.
3. « Composer ma sortie » propose 3 étapes horodatées. Les marges entre étapes sont **estimées à vol d'oiseau** et étiquetées comme telles. Le budget affiche « Incertain » si un coût est inconnu.
4. Vue carte : tracé à vol d'oiseau, « pas un itinéraire praticable ».
5. « Enregistrer l'excursion ».

| Vide | Formulaire | Proposition |
|---|---|---|
| ![Excursions vide](screenshots/mobile-08-excursions-vide.jpg) | ![Formulaire](screenshots/mobile-09-surprends-nous-formulaire.jpg) | ![Proposition](screenshots/mobile-10-surprends-nous-proposition.jpg) |

![Excursion sur la carte (ordinateur)](screenshots/desktop-11-excursion-carte.jpg)

## 4. Révéler une parcelle (60 s)

1. Passeport vide.
2. Sur la fiche de la basilique de Fourvière : « J'y suis allé », puis « Je déclare ma visite ».
3. Animation de révélation : +25 XP (non dépensable), badges « Premier pas » et « Premier voile levé ».
4. « Voir sur ma carte » : la parcelle apparaît, contour vert, et le lieu porte le badge « Visité ».

| Passeport vide | Révélation | Carte révélée |
|---|---|---|
| ![Passeport vide](screenshots/mobile-12-passeport-vide.jpg) | ![Révélation](screenshots/mobile-13-revelation-parcelle.jpg) | ![Parcelle révélée](screenshots/mobile-14-carte-parcelle-revelee.jpg) |

Après trois visites de plus, le passeport affiche : niveau 2, 4 lieux, 3 parcelles (deux lieux partagent une parcelle), 1 destination sur 4, et la progression du parcours de Lyon.

| Mobile | Ordinateur |
|---|---|
| ![Passeport](screenshots/mobile-15-passeport.jpg) | ![Passeport ordinateur](screenshots/desktop-15-passeport.jpg) |

## 5. Découvrir, missions, communauté (40 s)

- **Découvrir :** recommandations expliquées, sans classement par popularité. Missions du jour et de la semaine à récupérer.
- **Communauté (démo) :** profils et avis **fictifs**, étiquetés. L'ajout d'amis réels exige le mode connecté.

| Découvrir | Communauté |
|---|---|
| ![Découvrir](screenshots/mobile-16-decouvrir.jpg) | ![Communauté](screenshots/mobile-17-communaute-demo.jpg) |

## 6. Réglages, accueil guidé, thème nuit (30 s)

| Paramètres | Accueil guidé | Nuit : carte | Nuit : passeport |
|---|---|---|---|
| ![Paramètres](screenshots/mobile-18-parametres.jpg) | ![Onboarding](screenshots/mobile-19-onboarding.jpg) | ![Nuit carte](screenshots/mobile-20-nuit-carte.jpg) | ![Nuit passeport](screenshots/mobile-21-nuit-passeport.jpg) |

## 7. États d'erreur (10 s)

| Excursion introuvable | Hors connexion |
|---|---|
| ![Erreur](screenshots/mobile-22-erreur-excursion-introuvable.jpg) | ![Hors ligne](screenshots/mobile-23-hors-ligne.jpg) |

## 8. Mode connecté (à montrer seulement si la pile locale tourne)

Prérequis : voir HANDOVER § 3. Parcours couverts par `npm run test:e2e:connected` :

- inscription ;
- persistance après rechargement ;
- isolation entre comptes ;
- refus des visites simulées ;
- liste d'attente ;
- amis ;
- partage révocable ;
- mission récompensée une seule fois ;
- Mode Duo : invitation, co-édition, conflit sans écrasement, visite pour deux confirmée ;
- référencement : proposition d'un lieu, modération, revendication, informations de l'établissement, avis après visite et réponse, retrait de la gestion par un administrateur, refus motivé, avis retiré à la validation (chacun avec son e-mail reçu dans Mailpit), renoncement par l'établissement ;
- avis modéré, publié par un administrateur et journalisé.

### Mode Duo (captures réelles, mode connecté, mobile)

Captures produites par `DUO_SHOTS=docs/screenshots npm run test:e2e:connected -- e2e/connected-duo.spec.ts`, sous `next dev` : le bouton des outils Next.js est visible en bas à gauche. Les pseudonymes sont générés automatiquement.

| Invitation envoyée | Invitation reçue | Conflit sans écrasement |
|---|---|---|
| ![Invitation envoyée](screenshots/duo-01-invitation-envoyee.jpg) | ![Invitation reçue](screenshots/duo-02-invitation-recue.jpg) | ![Conflit](screenshots/duo-03-conflit.jpg) |

| « Nous y étions » | Visite à confirmer |
|---|---|
| ![Nous y étions](screenshots/duo-04-nous-y-etions.jpg) | ![Visite à confirmer](screenshots/duo-05-visite-a-confirmer.jpg) |

### Référencement (captures réelles, mode connecté, mobile)

Captures produites par `REF_SHOTS=docs/screenshots npm run test:e2e:connected -- e2e/connected-referencing.spec.ts`, sous `next dev`. SIRET fictif.

| Proposer un lieu | Revendiquer la fiche |
|---|---|
| ![Proposer](screenshots/ref-01-proposer.jpg) | ![Revendiquer](screenshots/ref-02-revendiquer.jpg) |

| Espace établissement | Avis et réponse de l'établissement |
|---|---|
| ![Espace établissement](screenshots/ref-03-espace-etablissement.jpg) | ![Avis et réponse](screenshots/ref-04-avis-et-reponse.jpg) |

| Retrait de la gestion (administration) | Renoncement par l'établissement |
|---|---|
| ![Retrait de la gestion](screenshots/ref-05-retrait-gestion.jpg) | ![Renoncement](screenshots/ref-06-renoncement.jpg) |

E-mails reçus par Mailpit, le serveur SMTP de test de la pile locale (rien n'est envoyé à l'extérieur ; adresses de test fictives) :

| « Avis retiré » | « Revendication refusée » | « Gestion retirée » |
|---|---|---|
| ![E-mail avis retiré](screenshots/ref-07-email-avis-retire.jpg) | ![E-mail revendication refusée](screenshots/ref-08-email-revendication-refusee.jpg) | ![E-mail gestion retirée](screenshots/ref-09-email-gestion-retiree.jpg) |

Les autres écrans du mode connecté n'ont pas de captures.

---

Toutes les captures ordinateur (`desktop-01` à `desktop-23`) se trouvent dans `docs/screenshots/`.
