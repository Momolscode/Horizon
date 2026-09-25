import type { StyleSpecification } from "maplibre-gl";

/**
 * Adaptateur cartographique.
 * - "local" (défaut) : fond Natural Earth embarqué (public/geo), domaine public,
 *   sans réseau ni clé. Carte simplifiée, PAS une carte routière.
 * - "external" : style MapLibre fourni par un prestataire (NEXT_PUBLIC_MAP_STYLE_URL).
 *   Ses conditions d'utilisation et son attribution doivent être vérifiées avant usage.
 */
export type MapProvider =
  | { kind: "local"; attribution: string; notice: string }
  | { kind: "external"; styleUrl: string; attribution: string; notice: null };

export const LOCAL_ATTRIBUTION = 'Fond : <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> (domaine public)';
export const LOCAL_NOTICE = "Fond simplifié à petite échelle : pas de routes ni de rues. Ce n'est pas une carte routière.";

export function mapProvider(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  NEXT_PUBLIC_MAP_ATTRIBUTION: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION,
}): MapProvider {
  const url = env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  if (url) {
    return { kind: "external", styleUrl: url, attribution: env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim() || "Fond de carte : fournisseur configuré", notice: null };
  }
  return { kind: "local", attribution: LOCAL_ATTRIBUTION, notice: LOCAL_NOTICE };
}

export type MapColors = {
  sea: string;
  land: string;
  landFrance: string;
  border: string;
  water: string;
  river: string;
  veil: string;
  explored: string;
  simulated: string;
  route: string;
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function readMapColors(): MapColors {
  const dark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";
  return {
    sea: cssVar("--map-sea", "#dfe8ea"),
    land: cssVar("--map-land", "#f6f1e7"),
    landFrance: cssVar("--map-land-france", "#fbf7ef"),
    border: cssVar("--map-border", "#c9b99c"),
    water: cssVar("--map-water", "#b9d3dc"),
    river: cssVar("--map-river", "#9dc1ce"),
    veil: dark ? "#050a17" : "#d9cfbd",
    explored: cssVar("--green", "#2e7d5b"),
    simulated: cssVar("--ink-3", "#646c7e"),
    route: cssVar("--coral", "#c8462f"),
  };
}

export function localBasemapStyle(colors: MapColors): StyleSpecification {
  return {
    version: 8,
    name: "HORIZON — fond simplifié Natural Earth",
    sources: {
      basemap: { type: "geojson", data: "/geo/basemap-fr.geojson", attribution: LOCAL_ATTRIBUTION },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": colors.sea } },
      {
        id: "land",
        type: "fill",
        source: "basemap",
        filter: ["==", ["get", "layer"], "country"],
        paint: { "fill-color": ["case", ["==", ["get", "iso"], "FRA"], colors.landFrance, colors.land] },
      },
      {
        id: "lakes",
        type: "fill",
        source: "basemap",
        filter: ["==", ["get", "layer"], "lake"],
        paint: { "fill-color": colors.water },
      },
      {
        id: "rivers",
        type: "line",
        source: "basemap",
        filter: ["==", ["get", "layer"], "river"],
        paint: { "line-color": colors.river, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1.6, 14, 3] },
      },
      {
        id: "admin1",
        type: "line",
        source: "basemap",
        filter: ["==", ["get", "layer"], "admin1"],
        paint: { "line-color": colors.border, "line-width": 0.6, "line-dasharray": [3, 3], "line-opacity": 0.6 },
      },
      {
        id: "borders",
        type: "line",
        source: "basemap",
        filter: ["==", ["get", "layer"], "country"],
        paint: { "line-color": colors.border, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 10, 1.6] },
      },
    ],
  };
}
