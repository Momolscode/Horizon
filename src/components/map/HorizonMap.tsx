"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AttributionControl,
  GPUInitializationError,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Destination, LatLng, Place } from "@/modules/catalog/schema";
import { CATEGORIES } from "@/modules/catalog/categories";
import { cellPolygon, cellsForView, exploredAtResolution, type Parcel } from "@/modules/progression/parcels";
import type { BBox } from "@/modules/shared/geo";
import { localBasemapStyle, mapProvider, readMapColors, type MapColors } from "@/adapters/map/style";
import { CategoryIcon } from "../CategoryIcon";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type FocusRequest = { key: number; center?: LatLng; zoom?: number; bbox?: BBox; padding?: { top: number; bottom: number; left: number; right: number } };
export type RouteStep = { placeId: string; location: LatLng; index: number; label: string };
export type MapFailure = "webgl" | "basemap";

type MarkerEntry =
  | { key: string; kind: "place"; el: HTMLElement; place: Place }
  | { key: string; kind: "cluster"; el: HTMLElement; count: number; clusterId: number; lngLat: [number, number] }
  | { key: string; kind: "destination"; el: HTMLElement; destination: Destination }
  | { key: string; kind: "step"; el: HTMLElement; step: RouteStep }
  | { key: string; kind: "me"; el: HTMLElement };

const DESTINATION_ZOOM_MAX = 9;
/** Emprise d'ouverture : France métropolitaine. */
const FRANCE_BOUNDS: [[number, number], [number, number]] = [
  [-5.2, 42.2],
  [8.3, 51.1],
];

/** Étiquette à gauche si une autre destination est proche à l'est (évite les chevauchements). */
function labelSide(destination: Destination, all: Destination[]): "left" | "right" {
  const crowdedEast = all.some(
    (d) => d.id !== destination.id && d.center.lng > destination.center.lng && d.center.lng - destination.center.lng < 2.5 && Math.abs(d.center.lat - destination.center.lat) < 1.2,
  );
  return crowdedEast ? "left" : "right";
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-motion") === "reduced";
}

function placesGeoJSON(places: Place[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      id: p.id,
      properties: { id: p.id },
      geometry: { type: "Point", coordinates: [p.location.lng, p.location.lat] },
    })),
  };
}

export function HorizonMap({
  places,
  destinations,
  selectedPlaceId,
  onSelectPlace,
  onSelectDestination,
  parcels,
  showParcels = true,
  savedIds,
  visitedIds,
  focus,
  reveal,
  userPosition,
  route,
  theme,
  mapThemeKey = "auto",
  onViewChange,
  onFailure,
  className = "",
  label = "Carte interactive des lieux",
}: {
  places: Place[];
  destinations: Destination[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string | null) => void;
  onSelectDestination?: (id: string) => void;
  parcels: Parcel[];
  showParcels?: boolean;
  savedIds: Set<string>;
  visitedIds: Set<string>;
  focus: FocusRequest | null;
  reveal: { cell: string; key: number } | null;
  userPosition: LatLng | null;
  route?: RouteStep[];
  theme: "light" | "dark";
  /** Change quand l'apparence de carte change (thème de récompense). */
  mapThemeKey?: string;
  onViewChange?: (bbox: BBox, zoom: number) => void;
  onFailure?: (failure: MapFailure) => void;
  className?: string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerObjects = useRef(new Map<string, Marker>());
  const [markers, setMarkers] = useState<MarkerEntry[]>([]);
  const [zoom, setZoom] = useState(5);
  const [ready, setReady] = useState(false);
  const [revealPoint, setRevealPoint] = useState<{ x: number; y: number; key: number } | null>(null);
  const colorsRef = useRef<MapColors | null>(null);
  const placesById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const latest = useRef({ placesById, parcels, showParcels, onSelectPlace, onSelectDestination, onViewChange });
  useLayoutEffect(() => {
    latest.current = { placesById, parcels, showParcels, onSelectPlace, onSelectDestination, onViewChange };
  });

  const provider = useMemo(() => mapProvider(), []);

  // ——— Marqueurs HTML (boutons accessibles) via portails React ———
  const syncMarkers = useCallback((desired: MarkerEntry[]) => {
    const map = mapRef.current;
    if (!map) return;
    const keep = new Set(desired.map((d) => d.key));
    for (const [key, marker] of markerObjects.current) {
      if (!keep.has(key)) {
        marker.remove();
        markerObjects.current.delete(key);
      }
    }
    setMarkers((previous) => {
      const prevByKey = new Map(previous.map((m) => [m.key, m]));
      return desired.map((entry) => {
        const existing = prevByKey.get(entry.key);
        const el = existing?.el ?? entry.el;
        if (!markerObjects.current.has(entry.key)) {
          let lngLat: [number, number];
          if (entry.kind === "place") lngLat = [entry.place.location.lng, entry.place.location.lat];
          else if (entry.kind === "cluster") lngLat = entry.lngLat;
          else if (entry.kind === "destination") lngLat = [entry.destination.center.lng, entry.destination.center.lat];
          else if (entry.kind === "step") lngLat = [entry.step.location.lng, entry.step.location.lat];
          else lngLat = [0, 0];
          const marker = new Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
          markerObjects.current.set(entry.key, marker);
        }
        return { ...entry, el } as MarkerEntry;
      });
    });
  }, []);

  const computeClusterMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("places") || !map.isSourceLoaded("places")) return [] as MarkerEntry[];
    const features = map.querySourceFeatures("places");
    const seen = new Set<string>();
    const result: MarkerEntry[] = [];
    for (const f of features) {
      const props = f.properties as Record<string, unknown>;
      if (props.cluster) {
        const key = `cluster-${props.cluster_id as number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        result.push({ key, kind: "cluster", el: document.createElement("div"), count: props.point_count as number, clusterId: props.cluster_id as number, lngLat: coords });
      } else {
        const id = props.id as string;
        const key = `place-${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const place = latest.current.placesById.get(id);
        if (place) result.push({ key, kind: "place", el: document.createElement("div"), place });
      }
    }
    return result;
  }, []);

  const staticMarkers = useRef<MarkerEntry[]>([]);

  const refreshMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    const dynamic = route ? [] : z >= DESTINATION_ZOOM_MAX - 0.5 ? computeClusterMarkers() : [];
    syncMarkers([...staticMarkers.current, ...dynamic]);
  }, [computeClusterMarkers, route, syncMarkers]);

  // ——— Parcelles (voile H3) : uniquement les cellules visibles ———
  const refreshParcels = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("parcels-view")) return;
    const source = map.getSource("parcels-view") as GeoJSONSource;
    if (!latest.current.showParcels) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const b = map.getBounds();
    const view = cellsForView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
    if (view.resolution === null) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const explored = exploredAtResolution(latest.current.parcels, view.resolution);
    const features: GeoJSON.Feature[] = view.cells.map((cell) => {
      const e = explored.get(cell);
      const ratio = e ? Math.min(1, e.explored / e.total) : 0;
      return {
        type: "Feature",
        properties: { ratio, explored: e ? 1 : 0, simulated: e?.state === "simulated" ? 1 : 0 },
        geometry: { type: "Polygon", coordinates: [cellPolygon(cell)] },
      };
    });
    source.setData({ type: "FeatureCollection", features });
  }, []);

  const addOverlayLayers = useCallback(
    (map: MapLibreMap, colors: MapColors) => {
      map.addSource("parcels-view", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "parcels-veil",
        type: "fill",
        source: "parcels-view",
        paint: { "fill-color": colors.veil, "fill-opacity": ["*", 0.32, ["-", 1, ["get", "ratio"]]] },
      });
      map.addLayer({
        id: "parcels-grid",
        type: "line",
        source: "parcels-view",
        filter: ["==", ["get", "explored"], 0],
        paint: { "line-color": colors.veil, "line-opacity": 0.35, "line-width": 0.6 },
      });
      map.addLayer({
        id: "parcels-explored-glow",
        type: "line",
        source: "parcels-view",
        filter: ["==", ["get", "explored"], 1],
        paint: { "line-color": colors.explored, "line-width": 6, "line-blur": 4, "line-opacity": 0.35 },
      });
      map.addLayer({
        id: "parcels-explored",
        type: "line",
        source: "parcels-view",
        filter: ["==", ["get", "explored"], 1],
        paint: {
          "line-color": ["case", ["==", ["get", "simulated"], 1], colors.simulated, colors.explored],
          "line-width": 2,
          "line-dasharray": ["case", ["==", ["get", "simulated"], 1], ["literal", [2, 2]], ["literal", [1, 0]]],
        },
      });
      map.addSource("reveal", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "reveal-fill", type: "fill", source: "reveal", paint: { "fill-color": colors.explored, "fill-opacity": 0 } });
      map.addLayer({ id: "reveal-line", type: "line", source: "reveal", paint: { "line-color": colors.explored, "line-width": 4, "line-opacity": 0 } });
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": colors.route, "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.9 },
      });
      map.addSource("places", {
        type: "geojson",
        data: placesGeoJSON([...latest.current.placesById.values()]),
        cluster: true,
        clusterRadius: 34,
        clusterMaxZoom: 14,
      });
      // Couche invisible : garantit le chargement des tuiles de la source pour les marqueurs HTML.
      map.addLayer({ id: "places-anchor", type: "circle", source: "places", paint: { "circle-radius": 1, "circle-opacity": 0 } });
    },
    [],
  );

  // ——— Création de la carte ———
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const colors = readMapColors();
    colorsRef.current = colors;
    const style: StyleSpecification | string = provider.kind === "local" ? localBasemapStyle(colors) : provider.styleUrl;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style,
        center: [2.6, 46.4],
        zoom: 4.8,
        minZoom: 4,
        maxZoom: 17,
        maxBounds: provider.kind === "local" ? [[-12, 38], [16, 55]] : undefined,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        fadeDuration: 150,
      });
    } catch (error) {
      onFailure?.(error instanceof GPUInitializationError ? "webgl" : "webgl");
      return;
    }
    mapRef.current = map;
    map.getCanvas().setAttribute("aria-label", `${label}. Flèches pour se déplacer, + et − pour zoomer.`);
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true, customAttribution: provider.kind === "local" ? provider.attribution : provider.attribution }), "bottom-left");

    map.on("error", (event) => {
      const message = String(event.error?.message ?? "");
      if (message.includes("basemap") || message.includes("geojson")) onFailure?.("basemap");
    });

    map.fitBounds(FRANCE_BOUNDS, { padding: { top: 140, bottom: 200, left: 16, right: 16 }, animate: false });
    map.on("load", () => {
      addOverlayLayers(map, colors);
      setReady(true);
      setZoom(map.getZoom());
      refreshParcels();
    });
    const onMoveEnd = () => {
      setZoom(map.getZoom());
      refreshParcels();
      refreshMarkers();
      const b = map.getBounds();
      latest.current.onViewChange?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
    };
    map.on("moveend", onMoveEnd);
    map.on("sourcedata", (e) => {
      if (e.sourceId === "places" && e.isSourceLoaded) refreshMarkers();
    });

    const markersAtMount = markerObjects.current;
    return () => {
      for (const marker of markersAtMount.values()) marker.remove();
      markersAtMount.clear();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // La carte est créée une seule fois ; les mises à jour passent par les effets ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thème : les couleurs du fond et des calques suivent le thème clair/nuit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const colors = readMapColors();
    colorsRef.current = colors;
    if (provider.kind === "local") {
      map.setPaintProperty("sea", "background-color", colors.sea);
      map.setPaintProperty("land", "fill-color", ["case", ["==", ["get", "iso"], "FRA"], colors.landFrance, colors.land]);
      map.setPaintProperty("lakes", "fill-color", colors.water);
      map.setPaintProperty("rivers", "line-color", colors.river);
      map.setPaintProperty("borders", "line-color", colors.border);
      map.setPaintProperty("admin1", "line-color", colors.border);
    }
    map.setPaintProperty("parcels-veil", "fill-color", colors.veil);
    map.setPaintProperty("parcels-grid", "line-color", colors.veil);
    map.setPaintProperty("parcels-explored", "line-color", ["case", ["==", ["get", "simulated"], 1], colors.simulated, colors.explored]);
    map.setPaintProperty("route-line", "line-color", colors.route);
  }, [theme, mapThemeKey, ready, provider.kind]);

  // Lieux affichés (filtres).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("places") as GeoJSONSource | undefined)?.setData(placesGeoJSON(places));
    window.setTimeout(refreshMarkers, 50);
  }, [places, ready, refreshMarkers]);

  // Parcelles.
  useEffect(() => {
    if (ready) refreshParcels();
  }, [parcels, showParcels, ready, refreshParcels]);

  // Marqueurs statiques : destinations, étapes d'itinéraire, position ponctuelle.
  useEffect(() => {
    if (!ready) return;
    const entries: MarkerEntry[] = [];
    if (!route) {
      for (const destination of destinations) entries.push({ key: `dest-${destination.id}`, kind: "destination", el: document.createElement("div"), destination });
    } else {
      for (const step of route) entries.push({ key: `step-${step.index}-${step.placeId}`, kind: "step", el: document.createElement("div"), step });
    }
    if (userPosition) entries.push({ key: `me-${userPosition.lat}-${userPosition.lng}`, kind: "me", el: document.createElement("div") });
    staticMarkers.current = entries;
    const me = markerObjects.current.get(entries.find((e) => e.kind === "me")?.key ?? "");
    if (me && userPosition) me.setLngLat([userPosition.lng, userPosition.lat]);
    refreshMarkers();
    const map = mapRef.current;
    if (map && userPosition) {
      const key = entries.find((e) => e.kind === "me")!.key;
      window.setTimeout(() => markerObjects.current.get(key)?.setLngLat([userPosition.lng, userPosition.lat]), 0);
    }
    // Tracé de l'itinéraire (vol d'oiseau entre étapes, pas un itinéraire praticable).
    const source = map?.getSource("route") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: route && route.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.map((s) => [s.location.lng, s.location.lat]) } }] : [],
    });
  }, [destinations, route, userPosition, ready, refreshMarkers]);

  // Déplacements demandés par la page : déclenchés uniquement quand la clé change.
  const focusRef = useRef(focus);
  useLayoutEffect(() => {
    focusRef.current = focus;
  });
  const focusKey = focus?.key ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const focus = focusRef.current;
    if (!map || !ready || !focus) return;
    const animate = !prefersReducedMotion();
    if (focus.bbox) {
      const [w, s, e, n] = focus.bbox;
      map.fitBounds(new LngLatBounds([w, s], [e, n]), { padding: focus.padding ?? 48, animate, maxZoom: 15 });
    } else if (focus.center) {
      map.flyTo({ center: [focus.center.lng, focus.center.lat], zoom: focus.zoom ?? Math.max(map.getZoom(), 14), animate, essential: true, padding: focus.padding });
    }
  }, [focusKey, ready]);

  // Animation de révélation d'une parcelle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !reveal) return;
    const source = map.getSource("reveal") as GeoJSONSource | undefined;
    if (!source) return;
    const ring = cellPolygon(reveal.cell);
    source.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] });
    const center = ring.slice(0, -1).reduce((acc, [lng, lat]) => [acc[0] + lng / (ring.length - 1), acc[1] + lat / (ring.length - 1)], [0, 0]);
    if (prefersReducedMotion()) {
      map.setPaintProperty("reveal-line", "line-opacity", 1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1600);
      map.setPaintProperty("reveal-fill", "fill-opacity", 0.45 * (1 - k));
      map.setPaintProperty("reveal-line", "line-opacity", Math.min(1, k * 2));
      map.setPaintProperty("reveal-line", "line-width", 8 - 5 * k);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      const p = map.project([center[0]!, center[1]!]);
      setRevealPoint({ x: p.x, y: p.y, key: reveal.key });
      frame = requestAnimationFrame(tick);
    }, 900);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [reveal, ready]);

  const zoomToCluster = async (clusterId: number, lngLat: [number, number]) => {
    const map = mapRef.current;
    const source = map?.getSource("places") as GeoJSONSource | undefined;
    if (!map || !source) return;
    try {
      const z = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: lngLat, zoom: z + 0.2, animate: !prefersReducedMotion() });
    } catch {
      map.easeTo({ center: lngLat, zoom: map.getZoom() + 2 });
    }
  };

  const showDestinations = zoom < DESTINATION_ZOOM_MAX;

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={containerRef} className="h-full w-full" role="region" aria-label={label} />
      {revealPoint ? (
        <span key={revealPoint.key} className="reveal-ring" style={{ left: revealPoint.x, top: revealPoint.y }} aria-hidden="true" onAnimationEnd={() => setRevealPoint(null)} />
      ) : null}
      {markers.map((m) => {
        if (m.kind === "place") {
          const selected = m.place.id === selectedPlaceId;
          const visited = visitedIds.has(m.place.id);
          const saved = savedIds.has(m.place.id);
          const meta = CATEGORIES[m.place.category];
          return createPortal(
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                latest.current.onSelectPlace(m.place.id);
              }}
              aria-pressed={selected}
              aria-label={`${m.place.name} — ${meta.label}${visited ? ", visité" : ""}${saved ? ", enregistré" : ""}${m.place.fictional ? ", lieu fictif" : ""}`}
              className={`group relative grid place-items-center rounded-full border-2 shadow-card transition-transform ${
                selected ? "z-10 h-12 w-12 scale-110 border-coral bg-coral text-on-coral" : "h-10 w-10 border-surface bg-ink text-bg hover:scale-110"
              }`}
            >
              <CategoryIcon category={m.place.category} size={selected ? 20 : 17} />
              {visited ? <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-surface bg-green" aria-hidden="true" /> : null}
              {zoom >= 13.5 || selected ? (
                <span className="pointer-events-none absolute left-1/2 top-full mt-1 max-w-[160px] -translate-x-1/2 truncate rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-ink shadow-card">
                  {m.place.name}
                </span>
              ) : null}
            </button>,
            m.el,
            m.key,
          );
        }
        if (m.kind === "cluster") {
          return createPortal(
            <button
              type="button"
              onClick={() => void zoomToCluster(m.clusterId, m.lngLat)}
              className="grid h-12 w-12 place-items-center rounded-full border-4 border-[color-mix(in_srgb,var(--coral)_35%,transparent)] bg-coral font-display text-lg font-bold text-on-coral shadow-card"
              aria-label={`${m.count} lieux regroupés. Zoomer pour les afficher.`}
            >
              {m.count}
            </button>,
            m.el,
            m.key,
          );
        }
        if (m.kind === "destination") {
          const side = labelSide(m.destination, destinations);
          return createPortal(
            <button
              type="button"
              onClick={() => latest.current.onSelectDestination?.(m.destination.id)}
              className={`relative grid h-11 w-11 place-items-center transition-opacity ${showDestinations ? "opacity-100" : "pointer-events-none opacity-0"}`}
              aria-hidden={!showDestinations}
              tabIndex={showDestinations ? 0 : -1}
              aria-label={`Explorer ${m.destination.name}`}
            >
              <span className="h-4 w-4 rounded-full border-[3px] border-surface bg-coral shadow-card ring-4 ring-[color-mix(in_srgb,var(--coral)_25%,transparent)]" />
              <span
                className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-2xl border border-line bg-surface px-3 py-1.5 text-left shadow-float ${
                  side === "left" ? "right-full mr-0.5" : "left-full ml-0.5"
                }`}
              >
                <span className="block font-display text-[15px] font-semibold leading-tight text-ink">{m.destination.name}</span>
                <span className="hidden text-[11px] font-semibold text-ink-3 sm:block">{m.destination.tagline}</span>
              </span>
            </button>,
            m.el,
            m.key,
          );
        }
        if (m.kind === "step") {
          return createPortal(
            <button
              type="button"
              onClick={() => latest.current.onSelectPlace(m.step.placeId)}
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-coral font-display text-base font-bold text-on-coral shadow-card"
              aria-label={`Étape ${m.step.index} : ${m.step.label}`}
            >
              {m.step.index}
            </button>,
            m.el,
            m.key,
          );
        }
        return createPortal(
          <span className="block h-5 w-5 rounded-full border-[3px] border-surface bg-sky shadow-card ring-8 ring-[color-mix(in_srgb,var(--sky)_20%,transparent)]" role="img" aria-label="Votre position ponctuelle" />,
          m.el,
          m.key,
        );
      })}
    </div>
  );
}
