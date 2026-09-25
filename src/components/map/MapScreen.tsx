"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Hexagon, Info, List, LocateFixed, Map as MapIcon, SlidersHorizontal, Wand2, X } from "lucide-react";
import { DEFAULT_FILTERS, filterPlaces, type PlaceFilters, type SearchHit } from "@/modules/discovery/search";
import { VISIT_RULES } from "@/modules/progression/config";
import { cellsInBbox, parcelForLocation, parcelsInBbox } from "@/modules/progression/parcels";
import { mapProvider } from "@/adapters/map/style";
import type { BBox } from "@/modules/shared/geo";
import { bboxContains } from "@/modules/shared/geo";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import { useHorizon } from "../providers/HorizonProvider";
import { PlaceDetail } from "../place/PlaceDetail";
import { PlaceCard } from "../place/PlaceCard";
import { SearchBox } from "./SearchBox";
import { FiltersDialog, countActiveFilters } from "./FiltersDialog";
import type { FocusRequest, MapFailure } from "./HorizonMap";

const HorizonMap = dynamic(() => import("./HorizonMap").then((m) => m.HorizonMap), {
  ssr: false,
  loading: () => <div className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />,
});

export function MapScreen() {
  const { catalog, state } = useHorizon();
  const router = useRouter();
  const params = useSearchParams();
  const theme = useResolvedTheme();
  const geo = useGeolocation();
  const provider = useMemo(() => mapProvider(), []);

  const selectedId = params.get("lieu");
  const selected = selectedId ? (catalog.placesById.get(selectedId) ?? null) : null;
  const [filters, setFilters] = useState<PlaceFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listMode, setListMode] = useState(false);
  const [showParcels, setShowParcels] = useState(true);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [view, setView] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [failure, setFailure] = useState<MapFailure | null>(null);
  const [reveal, setReveal] = useState<{ cell: string; key: number } | null>(null);

  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const userPosition = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix]);
  const effectiveFilters = useMemo<PlaceFilters>(() => {
    const destination = filters.destinationId ? catalog.destinationsById.get(filters.destinationId) : undefined;
    return { ...filters, origin: userPosition ?? destination?.center ?? null };
  }, [filters, userPosition, catalog.destinationsById]);
  const report = useMemo(() => filterPlaces(catalog.catalog, effectiveFilters), [catalog.catalog, effectiveFilters]);

  const savedIds = useMemo(() => new Set(state.collections.flatMap((c) => c.placeIds)), [state.collections]);
  const visitedIds = useMemo(
    () => new Set(state.progression.visits.filter((v) => VISIT_RULES[v.status].journal).map((v) => v.placeId)),
    [state.progression.visits],
  );

  const requestFocus = useCallback((f: Omit<FocusRequest, "key">) => {
    setFocus((previous) => ({ ...f, key: (previous?.key ?? 0) + 1 }));
  }, []);

  const selectPlace = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      next.delete("revele");
      if (id) next.set("lieu", id);
      else next.delete("lieu");
      router.replace(`/carte${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
      setSheetExpanded(false);
    },
    [params, router],
  );

  const selectDestination = useCallback(
    (id: string) => {
      const destination = catalog.destinationsById.get(id);
      if (!destination) return;
      setFilters((f) => ({ ...f, destinationId: id }));
      const places = catalog.placesByDestination.get(id) ?? [];
      const lats = places.map((p) => p.location.lat);
      const lngs = places.map((p) => p.location.lng);
      const bbox: BBox = places.length
        ? [Math.min(...lngs) - 0.01, Math.min(...lats) - 0.01, Math.max(...lngs) + 0.01, Math.max(...lats) + 0.01]
        : destination.bbox;
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      requestFocus({ bbox, padding: desktop ? { top: 120, bottom: 60, left: 480, right: 60 } : { top: 130, bottom: 250, left: 24, right: 24 } });
    },
    [catalog.destinationsById, catalog.placesByDestination, requestFocus],
  );

  // Lieu sélectionné via l'URL (lien, recherche, retour de révélation) : centrer et,
  // si demandé, animer la parcelle. Ajustement d'état pendant le rendu (motif React
  // « état dérivé d'une prop »), sans effet en cascade.
  const selectionKey = `${selectedId ?? ""}|${params.get("revele") ?? ""}`;
  const [handledSelection, setHandledSelection] = useState<string | null>(null);
  if (selectionKey !== handledSelection) {
    setHandledSelection(selectionKey);
    if (selected) {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const h = window.innerHeight;
      setFocus((f) => ({
        key: (f?.key ?? 0) + 1,
        center: selected.location,
        zoom: 14.2,
        padding: desktop ? { top: 80, bottom: 40, left: 470, right: 40 } : { top: 130, bottom: Math.round(h * 0.5), left: 20, right: 20 },
      }));
      if (params.get("revele") === "1") {
        const cell = parcelForLocation(selected.location);
        if (state.progression.parcels.some((p) => p.cell === cell)) setReveal((r) => ({ cell, key: (r?.key ?? 0) + 1 }));
      }
    }
  }

  const onPick = (hit: SearchHit) => {
    if (hit.kind === "destination") {
      selectDestination(hit.destination.id);
      selectPlace(null);
    } else {
      selectPlace(hit.place.id);
    }
  };

  const currentDestination = useMemo(() => {
    if (filters.destinationId) return catalog.destinationsById.get(filters.destinationId) ?? null;
    if (!view || view.zoom < 9) return null;
    const center = { lat: (view.bbox[1] + view.bbox[3]) / 2, lng: (view.bbox[0] + view.bbox[2]) / 2 };
    return catalog.catalog.destinations.find((d) => bboxContains(d.bbox, center)) ?? null;
  }, [filters.destinationId, view, catalog]);

  const activeFilters = countActiveFilters(filters);
  const destinationStats = currentDestination
    ? {
        places: catalog.placesByDestination.get(currentDestination.id)?.length ?? 0,
        parcels: parcelsInBbox(state.progression.parcels, currentDestination.bbox).length,
        cells: cellsInBbox(currentDestination.bbox),
      }
    : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Carte ou liste */}
      <div className={listMode ? "invisible" : "absolute inset-0"} aria-hidden={listMode}>
        {failure === "webgl" ? (
          <div className="flex h-full items-center justify-center bg-bg-deep p-6 text-center">
            <div className="card max-w-sm p-5">
              <p className="font-bold">Carte indisponible sur cet appareil</p>
              <p className="mt-1 text-sm text-ink-2">Le navigateur ne fournit pas WebGL 2, requis par la carte. La recherche, la liste et les fiches restent disponibles.</p>
              <button type="button" className="btn btn-primary mt-4" onClick={() => setListMode(true)}>
                Afficher la liste
              </button>
            </div>
          </div>
        ) : (
          <HorizonMap
            places={report.places}
            destinations={catalog.catalog.destinations}
            selectedPlaceId={selected?.id ?? null}
            onSelectPlace={selectPlace}
            onSelectDestination={selectDestination}
            parcels={state.progression.parcels}
            showParcels={showParcels}
            savedIds={savedIds}
            visitedIds={visitedIds}
            focus={focus}
            reveal={reveal}
            userPosition={userPosition}
            theme={theme}
            mapThemeKey={state.settings.mapTheme}
            onViewChange={(bbox, zoom) => setView({ bbox, zoom })}
            onFailure={setFailure}
          />
        )}
      </div>

      {listMode ? (
        <section aria-label="Liste des lieux" className="absolute inset-0 overflow-y-auto bg-bg px-4 pb-40 pt-[132px]">
          <p className="mb-3 text-sm font-semibold text-ink-2" role="status">
            {report.places.length} lieu{report.places.length > 1 ? "x" : ""}
            {filters.destinationId ? ` · ${catalog.destinationsById.get(filters.destinationId)?.name}` : " · toutes destinations"}
          </p>
          {report.places.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="font-bold">Aucun lieu ne correspond</p>
              <p className="mt-1 text-sm text-ink-2">Élargissez les filtres ou changez de destination.</p>
              <button type="button" className="btn btn-ghost mt-3" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                Effacer les filtres
              </button>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {report.places.map((p) => (
                <li key={p.id}>
                  <PlaceCard place={p} destination={catalog.destinationsById.get(p.destinationId)!} visited={visitedIds.has(p.id)} onSelect={() => selectPlace(p.id)} layout="horizontal" reason={p.summary} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Barre supérieure */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3 sm:px-4">
        <div className="pointer-events-auto mx-auto flex max-w-2xl items-start gap-2 lg:mx-0 lg:ml-[456px] xl:max-w-3xl">
          <div className="min-w-0 flex-1">
            <SearchBox catalog={catalog.catalog} onPick={onPick} />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line bg-surface shadow-card"
            aria-label={`Filtres${activeFilters ? ` (${activeFilters} actifs)` : ""}`}
          >
            <SlidersHorizontal size={19} aria-hidden="true" />
            {activeFilters ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold text-on-coral">{activeFilters}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => setListMode((v) => !v)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line bg-surface shadow-card"
            aria-pressed={listMode}
            aria-label={listMode ? "Afficher la carte" : "Afficher la liste"}
          >
            {listMode ? <MapIcon size={19} aria-hidden="true" /> : <List size={19} aria-hidden="true" />}
          </button>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-2xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:mx-0 lg:ml-[456px] xl:max-w-3xl" role="group" aria-label="Destinations">
          {catalog.catalog.destinations.map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip shrink-0 shadow-card"
              aria-pressed={filters.destinationId === d.id}
              onClick={() => (filters.destinationId === d.id ? setFilters((f) => ({ ...f, destinationId: null })) : selectDestination(d.id))}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* Boutons flottants */}
      {!listMode ? (
        <div className="absolute right-3 top-[124px] z-20 flex flex-col gap-2 sm:right-4">
          <button
            type="button"
            onClick={async () => {
              const fix = await geo.locate();
              if (fix) requestFocus({ center: { lat: fix.lat, lng: fix.lng }, zoom: 13 });
            }}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface shadow-card"
            aria-label="Me localiser (position ponctuelle)"
            disabled={geo.state.status === "locating"}
          >
            <LocateFixed size={19} aria-hidden="true" className={geo.state.status === "locating" ? "animate-pulse" : ""} />
          </button>
          <button
            type="button"
            onClick={() => setShowParcels((v) => !v)}
            className={`grid h-11 w-11 place-items-center rounded-full border shadow-card ${showParcels ? "border-green bg-green text-on-green" : "border-line bg-surface"}`}
            aria-pressed={showParcels}
            aria-label="Afficher les parcelles explorées"
          >
            <Hexagon size={19} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {geo.state.status === "error" ? (
        <p className="absolute inset-x-3 top-[124px] z-10 mr-16 rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn-ink sm:left-auto sm:max-w-sm" role="status">
          {geo.state.message}
        </p>
      ) : null}

      {/* Panneau inférieur (mobile) / latéral (ordinateur) */}
      {selected ? (
        <section
          aria-label={`Fiche : ${selected.name}`}
          className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[26px] border border-line bg-surface shadow-float transition-[height] duration-300 lg:inset-y-3 lg:left-3 lg:right-auto lg:h-auto lg:w-[440px] lg:rounded-[26px] ${
            sheetExpanded ? "h-[88%]" : "h-[56%]"
          }`}
        >
          <div className="flex items-center justify-between px-3 pt-2 lg:hidden">
            <button
              type="button"
              onClick={() => setSheetExpanded((v) => !v)}
              className="flex min-h-11 flex-1 items-center justify-center gap-1 text-xs font-bold text-ink-3"
              aria-expanded={sheetExpanded}
              aria-label={sheetExpanded ? "Réduire la fiche" : "Agrandir la fiche"}
            >
              <span className="h-1.5 w-12 rounded-full bg-line-strong" aria-hidden="true" />
              {sheetExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => selectPlace(null)}
            className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-[rgba(10,18,36,0.55)] text-white backdrop-blur"
            aria-label="Fermer la fiche"
          >
            <X size={18} aria-hidden="true" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <PlaceDetail place={selected} userPosition={userPosition} compact />
          </div>
        </section>
      ) : !listMode ? (
        <section className="absolute inset-x-3 bottom-3 z-20 sm:left-4 sm:right-auto sm:w-[400px]" aria-label="Exploration">
          <div className="card grain overflow-hidden p-4">
            {currentDestination && destinationStats ? (
              <>
                <p className="eyebrow">Exploration</p>
                <h2 className="text-2xl font-semibold">{currentDestination.name}</h2>
                <p className="mt-1 text-sm text-ink-2">
                  {destinationStats.places} lieux · {destinationStats.parcels} parcelle{destinationStats.parcels > 1 ? "s" : ""} explorée{destinationStats.parcels > 1 ? "s" : ""} sur{" "}
                  {destinationStats.cells} dans l&apos;emprise ({((destinationStats.parcels / destinationStats.cells) * 100).toFixed(1).replace(".", ",")} %)
                </p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/excursions/nouvelle?destination=${currentDestination.id}`} className="btn btn-primary flex-1">
                    <Wand2 size={18} aria-hidden="true" /> Surprends-nous
                  </Link>
                  <Link href={`/decouvrir?destination=${currentDestination.id}`} className="btn btn-ghost">
                    Découvrir
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Bienvenue</p>
                <h2 className="text-2xl font-semibold">Où partez-vous ?</h2>
                <p className="mt-1 text-sm text-ink-2">Choisissez une destination sur la carte ou recherchez une ville, un village ou un lieu. Aucun compte ni localisation nécessaires.</p>
                {!state.preferences.onboarded ? (
                  <Link href="/bienvenue" className="btn btn-ghost mt-3 w-full">
                    Personnaliser mes envies (30 s)
                  </Link>
                ) : null}
              </>
            )}
            {provider.notice ? (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
                <Info size={13} aria-hidden="true" className="mt-px shrink-0" /> {provider.notice}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <FiltersDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        report={report}
        distanceOriginLabel={userPosition ? "votre position ponctuelle" : filters.destinationId ? `le centre de ${catalog.destinationsById.get(filters.destinationId)?.name}` : null}
      />
    </div>
  );
}
