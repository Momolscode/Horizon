import type { LatLng } from "@/modules/catalog/schema";

/**
 * Liens d'ouverture vers des applications de navigation EXTERNES.
 * HORIZON n'intègre ni leur trafic ni leur guidage : il leur transmet une destination.
 * Formats d'URL publics documentés par chaque service ; à revérifier périodiquement
 * (non testables depuis l'environnement de construction, réseau restreint).
 */
export type ExternalNavLink = { id: string; label: string; href: string };

export function externalNavigationLinks(to: LatLng, name: string): ExternalNavLink[] {
  const lat = to.lat.toFixed(6);
  const lng = to.lng.toFixed(6);
  const q = encodeURIComponent(name);
  return [
    { id: "google", label: "Google Maps", href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
    { id: "waze", label: "Waze", href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` },
    { id: "apple", label: "Plans (Apple)", href: `https://maps.apple.com/?daddr=${lat},${lng}&q=${q}` },
    { id: "osm", label: "OpenStreetMap", href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` },
  ];
}
