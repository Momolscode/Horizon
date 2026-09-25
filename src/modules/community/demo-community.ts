/**
 * Communauté FICTIVE du mode démonstration. Ces personnes, statistiques et
 * recommandations n'existent pas ; l'interface les signale toujours comme telles.
 */
export type DemoFriend = {
  id: string;
  pseudonym: string;
  since: string;
  /** Statistiques fictives, affichées avec la mention « fictif ». */
  stats: { placesVisited: number; parcels: number; level: number };
  recommendations: Array<{ placeId: string; note: string }>;
};

export const DEMO_FRIENDS: DemoFriend[] = [
  {
    id: "demo-camille",
    pseudonym: "Camille",
    since: "2026-05-12",
    stats: { placesVisited: 14, parcels: 11, level: 4 },
    recommendations: [
      { placeId: "lyon-mur-des-canuts", note: "Monter par les pentes, redescendre par les traboules." },
      { placeId: "annecy-talloires", note: "Parfait pour pique-niquer au calme." },
    ],
  },
  {
    id: "demo-yanis",
    pseudonym: "Yanis",
    since: "2026-07-02",
    stats: { placesVisited: 9, parcels: 8, level: 3 },
    recommendations: [
      { placeId: "marseille-vallon-des-auffes", note: "Au coucher du soleil, c'est magique." },
      { placeId: "la-rochelle-parc-charruyer", note: "Idéal pour une balade à vélo." },
    ],
  },
  {
    id: "demo-ines",
    pseudonym: "Inès",
    since: "2026-08-20",
    stats: { placesVisited: 5, parcels: 5, level: 2 },
    recommendations: [{ placeId: "annecy-gorges-du-fier", note: "Fraîcheur garantie en été." }],
  },
];

export type DemoReview = { id: string; placeId: string; author: string; rating: number; text: string; date: string };

export const DEMO_REVIEWS: DemoReview[] = [
  { id: "r1", placeId: "lyon-fourviere", author: "Camille", rating: 5, text: "La vue depuis l'esplanade vaut à elle seule la montée.", date: "2026-08-14" },
  { id: "r2", placeId: "lyon-fourviere", author: "Yanis", rating: 4, text: "Beaucoup de monde le week-end, venir tôt.", date: "2026-09-02" },
  { id: "r3", placeId: "marseille-panier", author: "Inès", rating: 5, text: "On se perd avec plaisir dans les ruelles.", date: "2026-09-10" },
  { id: "r4", placeId: "annecy-paquier", author: "Camille", rating: 4, text: "Idéal en fin de journée, lumière superbe sur les montagnes.", date: "2026-07-21" },
];
