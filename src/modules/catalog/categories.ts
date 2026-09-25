/**
 * Catégories de lieux. Chaque catégorie a un libellé et une icône : la couleur
 * n'est jamais le seul porteur d'information (accessibilité).
 * `icon` est le nom d'un composant lucide-react, résolu dans src/components/CategoryIcon.tsx.
 */
export const CATEGORY_IDS = [
  "monument",
  "museum",
  "historic",
  "religious",
  "restaurant",
  "market",
  "hike",
  "park",
  "lake",
  "beach",
  "viewpoint",
  "leisure",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type CategoryMeta = {
  id: CategoryId;
  label: string;
  plural: string;
  icon: string;
  /** Jeton de couleur (variable CSS) utilisé en complément de l'icône. */
  tone: "coral" | "green" | "blue" | "sand" | "plum";
};

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  monument: { id: "monument", label: "Monument", plural: "Monuments", icon: "Landmark", tone: "sand" },
  museum: { id: "museum", label: "Musée", plural: "Musées", icon: "Building2", tone: "plum" },
  historic: { id: "historic", label: "Site historique", plural: "Sites historiques", icon: "Castle", tone: "sand" },
  religious: { id: "religious", label: "Patrimoine religieux", plural: "Patrimoine religieux", icon: "Church", tone: "plum" },
  restaurant: { id: "restaurant", label: "Restaurant", plural: "Restaurants", icon: "UtensilsCrossed", tone: "coral" },
  market: { id: "market", label: "Marché & halles", plural: "Marchés & halles", icon: "ShoppingBasket", tone: "coral" },
  hike: { id: "hike", label: "Randonnée", plural: "Randonnées", icon: "Footprints", tone: "green" },
  park: { id: "park", label: "Parc & jardin", plural: "Parcs & jardins", icon: "Trees", tone: "green" },
  lake: { id: "lake", label: "Lac", plural: "Lacs", icon: "Waves", tone: "blue" },
  beach: { id: "beach", label: "Plage & littoral", plural: "Plages & littoral", icon: "Sailboat", tone: "blue" },
  viewpoint: { id: "viewpoint", label: "Point de vue", plural: "Points de vue", icon: "Mountain", tone: "green" },
  leisure: { id: "leisure", label: "Loisirs", plural: "Loisirs", icon: "Ticket", tone: "blue" },
};

export const THEME_IDS = ["culture", "nature", "food", "sport", "relax", "family", "heritage", "leisure"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: Record<ThemeId, { label: string; icon: string }> = {
  culture: { label: "Culture", icon: "Palette" },
  nature: { label: "Nature", icon: "Leaf" },
  food: { label: "Gourmand", icon: "Soup" },
  sport: { label: "Sportif", icon: "Bike" },
  relax: { label: "Détente", icon: "Sun" },
  family: { label: "En famille", icon: "Baby" },
  heritage: { label: "Patrimoine", icon: "Landmark" },
  leisure: { label: "Loisirs", icon: "Ticket" },
};

export const RESTAURANT_STYLES = ["gastronomique", "bistrot", "cuisine_locale", "rapide"] as const;
export type RestaurantStyle = (typeof RESTAURANT_STYLES)[number];
export const RESTAURANT_STYLE_LABELS: Record<RestaurantStyle, string> = {
  gastronomique: "Gastronomique",
  bistrot: "Bistrot",
  cuisine_locale: "Cuisine locale",
  rapide: "Restauration rapide",
};

export const DIETS = ["vegetarian", "vegan", "gluten_free", "halal"] as const;
export type Diet = (typeof DIETS)[number];
export const DIET_LABELS: Record<Diet, string> = {
  vegetarian: "Végétarien",
  vegan: "Végan",
  gluten_free: "Sans gluten",
  halal: "Halal",
};
