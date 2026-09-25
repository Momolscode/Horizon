"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LocateFixed, Wand2 } from "lucide-react";
import { buildSections } from "@/modules/discovery/sections";
import { DEMO_FRIENDS } from "@/modules/community/demo-community";
import { VISIT_RULES } from "@/modules/progression/config";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHorizon } from "../providers/HorizonProvider";
import { PlaceCard } from "../place/PlaceCard";
import { MissionsPanel } from "../progress/MissionsPanel";

export function DiscoverScreen() {
  const { catalog, state, status } = useHorizon();
  const params = useSearchParams();
  const [destinationId, setDestinationId] = useState<string | null>(params.get("destination"));
  const geo = useGeolocation();
  const fix = geo.state.status === "ok" ? geo.state.fix : null;
  const position = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix]);
  const visitedIds = useMemo(
    () => new Set(state.progression.visits.filter((v) => VISIT_RULES[v.status].countsAsRealVisit).map((v) => v.placeId)),
    [state.progression.visits],
  );
  const friendRecommendations = useMemo(
    () => (status.kind === "demo" ? DEMO_FRIENDS.flatMap((f) => f.recommendations.map((r) => ({ placeId: r.placeId, friendName: f.pseudonym, note: r.note, fictional: true }))) : []),
    [status.kind],
  );
  const sections = useMemo(
    () => buildSections({ catalog: catalog.catalog, destinationId, position, visitedIds, friendRecommendations, units: state.settings.units }),
    [catalog.catalog, destinationId, position, visitedIds, friendRecommendations, state.settings.units],
  );
  const destination = destinationId ? catalog.destinationsById.get(destinationId) : null;

  return (
    <div className="pb-10 pt-6">
      <div className="mx-auto max-w-6xl px-4">
        <p className="eyebrow">Découvrir</p>
        <h1 className="text-4xl font-semibold">{destination ? `Envies à ${destination.name}` : "Des idées de sorties"}</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          {destination ? destination.description : "Un village voisin, une balade gratuite, une sortie du dimanche : choisissez une destination ou laissez-vous guider."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Destination">
          <button type="button" role="radio" aria-checked={destinationId === null} className="chip shrink-0" onClick={() => setDestinationId(null)}>
            Toutes
          </button>
          {catalog.catalog.destinations.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={destinationId === d.id} className="chip shrink-0" onClick={() => setDestinationId(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
        {destination ? (
          <Link href={`/excursions/nouvelle?destination=${destination.id}`} className="btn btn-primary mt-4">
            <Wand2 size={18} aria-hidden="true" /> Surprends-nous à {destination.name}
          </Link>
        ) : null}
        <p className="mt-3 text-xs text-ink-3">Recommandations expliquées, non classées par popularité. Aucun placement commercial dans cette démonstration.</p>
        <div className="mt-6 max-w-xl">
          <MissionsPanel compact />
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`} className="mt-8">
          <div className="mx-auto flex max-w-6xl items-end justify-between gap-3 px-4">
            <div>
              <h2 id={`section-${section.id}`} className="text-2xl font-semibold">
                {section.title}
              </h2>
              <p className="text-sm text-ink-3">{section.subtitle}</p>
            </div>
          </div>
          {section.unavailable ? (
            <div className="mx-auto mt-3 max-w-6xl px-4">
              <div className="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm text-ink-2">{section.unavailable}</p>
                {section.id === "around" && !position ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void geo.locate()} disabled={geo.state.status === "locating"}>
                    <LocateFixed size={18} aria-hidden="true" /> {geo.state.status === "locating" ? "Localisation…" : "Me localiser une fois"}
                  </button>
                ) : null}
              </div>
              {geo.state.status === "error" && section.id === "around" ? <p className="mt-2 text-sm text-warn-ink">{geo.state.message}</p> : null}
            </div>
          ) : section.items.length === 0 ? (
            <p className="mx-auto mt-3 max-w-6xl px-4 text-sm text-ink-3">Aucun lieu dans cette catégorie pour cette destination.</p>
          ) : (
            <ul className="mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] lg:mx-auto lg:max-w-6xl">
              {section.items.map((item) => (
                <li key={item.place.id} className="w-[250px] shrink-0 snap-start">
                  <PlaceCard
                    place={item.place}
                    destination={catalog.destinationsById.get(item.place.destinationId)!}
                    reason={item.reason}
                    visited={visitedIds.has(item.place.id)}
                    href={`/lieux/${item.place.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
