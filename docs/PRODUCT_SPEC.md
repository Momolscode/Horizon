# HORIZON — spécification produit

Nom provisoire (disponibilité du nom et du domaine non vérifiée). Document de référence pour l'équipe produit et technique.

## 1. Promesse et problème

**Promesse :** « Découvre des lieux. Vis des expériences. Révèle ton monde. »

**Problème :** les idées de sortie sont dispersées entre cartes, avis, vidéos et guides. Transformer ces idées en sortie concrète, puis garder la trace de ce qu'on a vécu, demande plusieurs outils.

**Réponse :** une application qui transforme les idées en excursion concrète, puis les visites en **carte explorée** et en **carnet de souvenirs**. Elle doit aussi donner envie des sorties proches : un village voisin, une randonnée gratuite, un dimanche.

**Boucle centrale :** découvrir → enregistrer → organiser → visiter → révéler une parcelle → enrichir son passeport → partager volontairement → découvrir à nouveau.

**Trois signatures :**

1. une carte personnelle qui se révèle ;
2. « Surprends-nous », qui compose une sortie ;
3. un passeport d'exploration visuel et partageable.

## 2. Publics et contextes

- Couple ou amis qui préparent un voyage ou un week-end.
- Familles qui cherchent une sortie adaptée, avec contraintes de budget et d'accessibilité.
- Personnes seules, locales, qui veulent explorer près de chez elles à petit budget.

Onboarding court et facultatif : avec qui (seul, couple, amis, famille), budget, temps disponible, transport et envies (culture, sport, gourmandise, économique, détente, nature). Ces préférences restent modifiables pour chaque excursion.

## 3. Périmètre géographique

France d'abord, avec quelques destinations bien renseignées. Le modèle prévoit pays, langue, devise et fuseau par destination, sans prétendre couvrir le monde entier.

## 4. Plateforme

- Application web mobile-first installable (PWA), confortable aussi sur ordinateur.
- Pas d'applications natives simultanées (phase P2).

Navigation : **Carte, Découvrir, Excursions, Communauté, Profil**. Les fonctions non livrées sont masquées ou clairement indisponibles ; aucun bouton ne simule silencieusement un succès.

## 5. Fonctions

### 5.1 Carte et catalogue

- **Affichage :** carte plein écran. À faible zoom, les destinations ; en zoomant, les lieux (monuments, restaurants, randonnées, parcs, lacs, musées, loisirs, sites historiques ou religieux d'intérêt culturel). Marqueurs proches regroupés.
- **Recherche :** par ville, village ou lieu. Filtres par catégorie, budget, distance, durée, accessibilité, intérieur ou extérieur, régime alimentaire. « Ouvert maintenant » n'est proposé que si des horaires exploitables existent.
- **Fiche lieu :** nom, catégorie (icône et libellé), coordonnées, visuel autorisé, description, histoire, informations pratiques (prix, horaires, durée, difficulté, accessibilité, réservation, site). Chaque fiche stocke sa provenance, ses conditions d'utilisation et sa date de vérification. **Une valeur inconnue reste inconnue.**
- **Actions :** enregistrer dans une collection, ajouter à une excursion, ouvrir une navigation externe, déclarer une visite, signaler une erreur. Les avis sont disponibles seulement quand la fonction existe.
- **Contenus tiers :** pas de copie d'avis Google, de photos de réseaux sociaux ou de contenus touristiques sans autorisation.

### 5.2 Découvrir

Sections :

- « Autour de vous » (position ponctuelle consentie) ;
- « Gratuit » ;
- « Pour une journée à deux » ;
- « Nature » ;
- « Culture » ;
- « À découvrir ce week-end » ;
- « Recommandé par vos amis », si disponible.

Chaque recommandation est expliquée et ne se limite pas aux lieux populaires. Tout placement commercial est identifié.

### 5.3 Surprends-nous et excursions

- **Entrées :** destination, date, heure de départ, durée, budget (par personne ou pour le groupe), groupe, transport, envies, besoins (fauteuil, régimes), repas.
- **Sortie :** 3 à 5 étapes cohérentes issues du catalogue, par un **moteur déterministe, explicable et testable**. Il tient compte des catégories, distances, durées, horaires connus et contraintes. Les coûts inconnus ne deviennent jamais gratuits.
- **IA :** facultative. Elle ne pourrait que reformuler une proposition construite à partir d'identifiants de lieux existants.
- **Édition :** remplacer, réordonner, retirer ou ajouter une étape ; enregistrer, rouvrir, voir en carte et en liste. L'application vérifie les incompatibilités horaires dans le fuseau de la destination.
- **Trajets :** un temps de route ne s'affiche qu'avec une source adaptée. À défaut, l'application montre une distance à vol d'oiseau et une marge estimée, étiquetées comme telles. Ouvrir Google Maps, Waze ou autre transmet une destination ; ce n'est pas une intégration de leur trafic.
- **Météo :** via un adaptateur. Sans prévision, son indisponibilité est affichée.
- **Notifications :** seulement si l'infrastructure existe, avec fréquence, catégories et horaires silencieux. Proximité, trafic et localisation en arrière-plan sont des fonctions ultérieures (P2).

### 5.4 Visites, parcelles et progression

- **Statuts de visite :**

  | Statut | Carnet | Parcelle | XP première visite | Bonus de proximité | Compte comme visite réelle |
  |---|---|---|---|---|---|
  | Déclarée | oui | oui (état « déclarée ») | 20 | — | oui |
  | Contrôlée par position ponctuelle | oui | oui (état « contrôlée ») | 20 | +15 (une fois par lieu) | oui |
  | Simulée (démo uniquement) | oui, étiquetée | oui (état « simulée ») | 0 | — | non |

  - Une nouvelle parcelle révélée par une visite réelle donne +5 XP, une fois par cellule.
  - Le contrôle de proximité exige une précision de 100 m au plus et une position de moins de 2 minutes. Le rayon est de 150 m, ou 400 m pour les grands sites. C'est un contrôle limité, pas une preuve.
  - Sans position exploitable, la visite reste déclarée.
- **Parcelles :** cellules H3, résolution de référence 8, configurable et enregistrée avec chaque parcelle. Une visite éligible révèle la parcelle du lieu, pas toute la ville. Seules les cellules de la zone visible sont calculées, avec agrégation selon le zoom.
- **Mesures distinctes :** lieux visités, villes (destinations) découvertes, parcelles explorées. Tout pourcentage indique son dénominateur (cellules de l'emprise de la destination).
- **Médaille de destination :** récompense un parcours défini de lieux, pas chaque rue ou commerce.
- **Économie :** XP non dépensable ; niveaux dérivés de l'XP ; badges ; points récompense dépensables séparés. Barèmes configurables. Chaque niveau apporte une personnalisation, un badge, une fonction de confort ou des points.
  - Aucun avantage financier pour une déclaration ou un contrôle GPS seul. Aucune récompense ne dépend d'un avis positif.
  - Les bons partenaires et la publicité récompensée restent désactivés tant que partenaires, financement et contrôles ne sont pas validés (P2).
- **Garanties :**
  - attribution côté serveur, transactionnelle et idempotente ;
  - contraintes d'unicité et journal des opérations ;
  - un double clic ou une nouvelle tentative réseau ne crédite pas deux fois ;
  - corrections administratives traçables.
- **Missions :** quotidiennes, hebdomadaires et mensuelles, accessibles près de chez soi et à petit budget. Aucune mission n'encourage l'intrusion, un accès interdit ou une activité dangereuse. Les informations de déplacement et de sécurité ne sont jamais verrouillées par la progression.

### 5.5 Passeport, communauté et paramètres

- **Profil :**
  - contenu : carte explorée, lieux et villes visités, niveau, points, badges, collections, excursions, souvenirs privés ;
  - récapitulatif visuel exportable, partagé uniquement sur action de l'utilisateur, sans domicile, position précise ni voyage futur.
- **Communauté :**
  - fonctions : demandes d'amis par pseudonyme (acceptation ou refus), avis, comparaisons facultatives, défis amicaux ;
  - protections : blocage, signalement et modération avant toute publication publique ;
  - profils et historique privés par défaut, avec choix explicite entre privé, amis et public ;
  - pas de carte des déplacements en temps réel.
- **Référencement (D-017) :** les membres proposent des restaurants, commerces et activités dans les destinations couvertes ; les fiches sont publiées après modération et restent « non vérifiées ». Les établissements revendiquent leur fiche (SIRET + preuve, validation manuelle), corrigent leurs informations (« fournies par l'établissement ») et répondent gratuitement aux avis. Les avis sont réservés après une visite déclarée. Aucune offre payante n'est implémentée.
- **Partage d'excursions :** en lecture seule, révocable, copiable dans son propre compte. Le Mode Duo (DECISIONS D-016) permet à deux amis de co-éditer une excursion. Une visite déclarée « pour nous deux » n'est créditée à l'autre qu'après sa confirmation.
- **Paramètres :** thème, apparence de la carte, langue, unités, préférences, notifications, localisation, visibilité, synchronisation, export, suppression, assistance. L'application indique ce qui est local et ce qui est synchronisé.

### 5.6 Administration, mesure et monétisation

- **Administration protégée :** lieux, sources, publications, signalements, missions, barèmes. Les opérations sensibles sont journalisées.
- **Événements mesurés :** première découverte, favori, excursion créée, visite déclarée ou contrôlée, partage, retour dans l'application.
  - Collecte minimisée ; consentement avant tout traceur concerné.
  - Démo, tests et administrateurs sont exclus des mesures réelles.
  - Activation, utilisateurs actifs et rétention par cohorte sont définis avec leur période et leur dénominateur. Sans données suffisantes, l'écran affiche « Données insuffisantes ».
- **Offre gratuite ou premium configurable :** thèmes, collections avancées, confort de préparation. Aucun paiement actif. Réservation partenaire, affiliation et parcours sponsorisés restent des hypothèses.
- **Page d'accueil publique :** accès à la démo et liste d'attente réellement sauvegardée et protégée contre les abus. Sans stockage, l'interface dit que la demande n'a pas été enregistrée. Aucun faux témoignage ni faux logo.

## 6. Modes

- **Démo :** aucune clé ni service payant ; données de démonstration ; progression locale persistante ; réinitialisation ; bandeau « Démonstration ». Personnes, statistiques et avis fictifs sont identifiés comme tels.
- **Connecté :** vrais comptes, données en base, isolation entre utilisateurs, opérations sensibles côté serveur. Une mauvaise configuration affiche le problème, sans bascule silencieuse en démo.

## 7. Exigences transverses

- **Accessibilité :** contrastes AA, navigation au clavier, lecteurs d'écran, zones tactiles d'au moins 44 px, réduction des animations, aucun débordement horizontal sur mobile.
- **Robustesse :** le refus de géolocalisation ne bloque jamais la recherche manuelle. Les états de chargement, d'absence de résultats, d'erreur, de perte de connexion et d'information inconnue sont prévus.
- **Sécurité et vie privée :**
  - autorisations côté serveur et RLS ;
  - validation des entrées et limitation de débit ;
  - aucun secret dans le navigateur ;
  - pas d'historique GPS continu ;
  - export et suppression des données ;
  - photos : métadonnées de localisation retirées avant partage.
- **Honnêteté :** pas de traction, valorisation, partenariat ou conformité inventés.

## 8. Critères d'acceptation (recette)

Consulter sans compte ni GPS → rechercher et filtrer → ouvrir un lieu → enregistrer → créer et modifier une excursion → recharger et retrouver les données → déclarer une visite → révéler une parcelle éligible → consulter le passeport mis à jour.

Ce parcours doit être vérifié séparément en démo et avec de vrais comptes (voir `docs/STATUS.md` pour le statut de chaque vérification).
