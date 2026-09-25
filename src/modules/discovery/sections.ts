import type { Catalog, LatLng, Place } from "@/modules/catalog/schema";
import { straightLineMeters, formatDistance } from "@/modules/shared/geo";
import { isFree } from "./search";

export type SectionItem = { place: Place; reason: string };

export type DiscoverySection = {
  id: "around" | "free" | "duo" | "nature" | "culture" | "weekend" | "friends";
  title: string;
  subtitle: string;
  items: SectionItem[];
  /** Section non calculable : message affiché à la place des lieux. */
  unavailable: string | null;
};

export type FriendRecommendation = { placeId: string; friendName: string; note: string; fictional: boolean };

/**
 * Sections de « Découvrir ». Les recommandations sont expliquées et ne sont pas
 * classées par popularité (aucune donnée de fréquentation n'est utilisée).
 */
export function buildSections(input: {
  catalog: Catalog;
  destinationId: string | null;
  position: LatLng | null;
  visitedIds: Set<string>;
  friendRecommendations: FriendRecommendation[];
  limit?: number;
  units?: "metric" | "imperial";
}): DiscoverySection[] {
  const { catalog, destinationId, position, visitedIds, friendRecommendations } = input;
  const limit = input.limit ?? 8;
  const scope = catalog.places.filter((p) => !destinationId || p.destinationId === destinationId);
  const real = scope.filter((p) => !p.fictional);
  const byNovelty = (a: Place, b: Place) => Number(visitedIds.has(a.id)) - Number(visitedIds.has(b.id)) || Number(b.lesserKnown) - Number(a.lesserKnown) || a.name.localeCompare(b.name, "fr");
  const take = (items: SectionItem[]) => items.slice(0, limit);

  const around: DiscoverySection = position
    ? {
        id: "around",
        title: "Autour de vous",
        subtitle: "Distances à vol d'oiseau depuis votre position ponctuelle",
        items: take(
          catalog.places
            .map((p) => ({ p, d: straightLineMeters(position, p.location) }))
            .filter((x) => x.d <= 30_000)
            .sort((a, b) => a.d - b.d)
            .map(({ p, d }) => ({ place: p, reason: `À ${formatDistance(d, input.units)} à vol d'oiseau` })),
        ),
        unavailable: null,
      }
    : { id: "around", title: "Autour de vous", subtitle: "Selon votre position, uniquement si vous l'autorisez", items: [], unavailable: "Localisez-vous ponctuellement ou choisissez une destination." };
  if (around.items.length === 0 && position) around.unavailable = "Aucun lieu du catalogue de démonstration à moins de 30 km de vous.";

  const free: DiscoverySection = {
    id: "free",
    title: "Gratuit",
    subtitle: "Accès libre selon les informations disponibles",
    items: take(
      scope
        .filter(isFree)
        .sort(byNovelty)
        .map((p) => ({ place: p, reason: p.practical.price.status === "estimate" ? "Accès libre (estimation à vérifier)" : "Gratuit" })),
    ),
    unavailable: null,
  };

  const duo: DiscoverySection = {
    id: "duo",
    title: "Pour une journée à deux",
    subtitle: "Points de vue, balades et tables propices aux moments à deux",
    items: take(
      scope
        .filter((p) => ["viewpoint", "park", "lake", "beach"].includes(p.category) || p.restaurant?.style === "gastronomique" || p.restaurant?.style === "bistrot")
        .sort(byNovelty)
        .map((p) => ({
          place: p,
          reason: p.restaurant ? "Une table pour prolonger la journée" : p.category === "viewpoint" ? "Un panorama à partager" : "Une balade au calme",
        })),
    ),
    unavailable: null,
  };

  const nature: DiscoverySection = {
    id: "nature",
    title: "Nature",
    subtitle: "Lacs, sentiers, parcs et littoral",
    items: take(real.filter((p) => p.themes.includes("nature")).sort(byNovelty).map((p) => ({ place: p, reason: p.category === "hike" ? "Une sortie à pied" : "Au grand air" }))),
    unavailable: null,
  };

  const culture: DiscoverySection = {
    id: "culture",
    title: "Culture",
    subtitle: "Musées, monuments et patrimoine",
    items: take(
      real
        .filter((p) => p.themes.includes("culture") || p.themes.includes("heritage"))
        .sort(byNovelty)
        .map((p) => ({ place: p, reason: p.history ? "Une page d'histoire" : "Pour les curieux" })),
    ),
    unavailable: null,
  };

  const weekend: DiscoverySection = {
    id: "weekend",
    title: "À découvrir ce week-end",
    subtitle: "Des lieux moins connus que vous n'avez pas encore visités (pas d'agenda d'événements)",
    items: take(
      real
        .filter((p) => !visitedIds.has(p.id))
        .sort((a, b) => Number(b.lesserKnown) - Number(a.lesserKnown) || a.name.localeCompare(b.name, "fr"))
        .map((p) => ({ place: p, reason: p.lesserKnown ? "Moins connu, loin des foules habituelles" : "Pas encore dans votre carnet" })),
    ),
    unavailable: null,
  };

  const sections = [around, free, duo, nature, culture, weekend];
  const recs = friendRecommendations.filter((r) => scope.some((p) => p.id === r.placeId));
  if (recs.length > 0) {
    sections.push({
      id: "friends",
      title: "Recommandé par vos amis",
      subtitle: recs.some((r) => r.fictional) ? "Amis fictifs de démonstration" : "Partagé par vos amis",
      items: take(
        recs.map((r) => ({ place: catalog.places.find((p) => p.id === r.placeId)!, reason: `${r.friendName}${r.fictional ? " (profil fictif)" : ""} : « ${r.note} »` })),
      ),
      unavailable: null,
    });
  }
  return sections;
}
