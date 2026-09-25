import type { LatLng } from "@/modules/catalog/schema";

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance orthodromique (« à vol d'oiseau ») en mètres. Ce n'est pas une distance de trajet. */
export function straightLineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Coordonnées exploitables : nombres finis dans les bornes WGS84. */
export function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export type BBox = [west: number, south: number, east: number, north: number];

export function bboxContains(bbox: BBox, p: LatLng): boolean {
  return p.lng >= bbox[0] && p.lng <= bbox[2] && p.lat >= bbox[1] && p.lat <= bbox[3];
}

export function formatDistance(meters: number, units: "metric" | "imperial" = "metric"): string {
  if (units === "imperial") {
    const miles = meters / 1609.344;
    return miles < 0.2 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  }
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}
