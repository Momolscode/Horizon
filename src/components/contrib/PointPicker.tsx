"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Destination, LatLng } from "@/modules/catalog/schema";
import { localBasemapStyle, mapProvider, readMapColors } from "@/adapters/map/style";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * Choix d'un point dans une destination : toucher la carte place le repère. Le fond local
 * n'a pas de rues : le point est enregistré comme « approximatif ». Les lieux existants
 * sont affichés en petits points pour se repérer (et repérer un doublon).
 */
export function PointPicker({ destination, existing, value, onChange }: { destination: Destination; existing: LatLng[]; value: LatLng | null; onChange: (p: LatLng) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const provider = mapProvider();
    const style: StyleSpecification | string = provider.kind === "local" ? localBasemapStyle(readMapColors()) : provider.styleUrl;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({ container, style, bounds: destination.bbox, fitBoundsOptions: { padding: 12 }, attributionControl: false, dragRotate: false, touchPitch: false, renderWorldCopies: false });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    mapRef.current = map;
    map.getCanvas().setAttribute("aria-label", `Carte de ${destination.name} : touchez l'emplacement du lieu.`);
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      map.addSource("existing", { type: "geojson", data: { type: "FeatureCollection", features: existing.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })) } });
      map.addLayer({ id: "existing", type: "circle", source: "existing", paint: { "circle-radius": 4, "circle-color": "#5f6b7e", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
    });
    map.on("click", (e) => onChangeRef.current({ lat: Math.round(e.lngLat.lat * 1e5) / 1e5, lng: Math.round(e.lngLat.lng * 1e5) / 1e5 }));
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // La carte est recréée seulement quand la destination change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    markerRef.current ??= new Marker({ color: "#c8462f" }).setLngLat([value.lng, value.lat]).addTo(map);
    markerRef.current.setLngLat([value.lng, value.lat]);
  }, [value]);

  if (failed) {
    return <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">La carte n&apos;est pas disponible sur cet appareil (WebGL 2 requis) : saisissez les coordonnées ci-dessous ou utilisez votre position.</p>;
  }
  return <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-2xl border border-line" />;
}
