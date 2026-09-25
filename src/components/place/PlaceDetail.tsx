"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, CalendarPlus, CircleAlert, CloudOff, Flag, Footprints, Navigation, ShieldCheck, Sparkles } from "lucide-react";
import type { Place } from "@/modules/catalog/schema";
import { openStatusLabel, practicalLines, priceText } from "@/modules/catalog/present";
import { VISIT_RULES } from "@/modules/progression/config";
import { formatDistance, straightLineMeters } from "@/modules/shared/geo";
import { weatherProvider, type WeatherResult } from "@/adapters/weather";
import { todayIn } from "@/modules/shared/time";
import { useHorizon } from "../providers/HorizonProvider";
import { PlaceArt } from "../PlaceArt";
import { CategoryBadge } from "../CategoryIcon";
import { AddToExcursionDialog, NavigateDialog, ReportDialog, SaveDialog, VisitDialog } from "./PlaceDialogs";
import { PlaceReviews } from "./PlaceReviews";

type DialogName = "visit" | "save" | "excursion" | "navigate" | "report" | null;

function WeatherBlock({ place }: { place: Place }) {
  const { catalog } = useHorizon();
  const destination = catalog.destinationsById.get(place.destinationId)!;
  const [result, setResult] = useState<WeatherResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void weatherProvider()
      .forecast(place.location, [todayIn(destination.timezone)], controller.signal)
      .then(setResult);
    return () => controller.abort();
  }, [place.location, destination.timezone]);
  if (!result) return <div className="skeleton h-12" aria-hidden="true" />;
  if (result.status === "unavailable") {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <CloudOff size={16} aria-hidden="true" /> Météo : {result.reason}
      </p>
    );
  }
  const day = result.days[0]!;
  return (
    <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
      Aujourd&apos;hui : <strong className="text-ink">{day.summary}</strong>, {Math.round(day.tempMinC)}–{Math.round(day.tempMaxC)} °C
      {day.wet && place.setting === "outdoor" ? " · lieu en extérieur, prévoyez une alternative couverte." : ""}
      <span className="block text-xs text-ink-3">{result.attribution}</span>
    </p>
  );
}

export function PlaceDetail({ place, userPosition, compact = false }: { place: Place; userPosition: { lat: number; lng: number } | null; compact?: boolean }) {
  const { catalog, state, actions } = useHorizon();
  const destination = catalog.destinationsById.get(place.destinationId)!;
  const [dialog, setDialog] = useState<DialogName>(null);
  const saved = state.collections.some((c) => c.placeIds.includes(place.id));
  const visits = useMemo(() => state.progression.visits.filter((v) => v.placeId === place.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.progression.visits, place.id]);
  const lines = practicalLines(place, destination);
  const open = openStatusLabel(place, destination);
  const sources = catalog.catalog.sources.filter((s) => place.sourceIds.includes(s.id));

  useEffect(() => {
    void actions.markSeen(place.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  return (
    <article aria-labelledby={`place-${place.id}`} className="pb-6">
      <div className={`grain relative overflow-hidden ${compact ? "h-44 rounded-t-[26px]" : "h-60 sm:h-72 lg:rounded-[26px]"}`}>
        <PlaceArt seed={place.id} motif={place.art.motif} palette={place.art.palette} className="absolute inset-0 h-full w-full" label={`Illustration de ${place.name} (visuel généré, non photographique)`} />
        <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-[rgba(10,18,36,0.72)] to-transparent px-5 pb-4 pt-16">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/85">{destination.name}</p>
          <h1 id={`place-${place.id}`} className="text-[1.9rem] font-semibold leading-tight text-white">
            {place.name}
          </h1>
        </div>
      </div>

      <div className="space-y-5 px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={place.category} />
          {place.fictional ? (
            <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-bold text-warn-ink">Lieu fictif — démonstration</span>
          ) : place.verification.status === "unverified" ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-2">Non vérifié</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2.5 py-1 text-xs font-bold text-green-ink">
              <ShieldCheck size={13} aria-hidden="true" /> Vérifié le {place.verification.checkedAt}
            </span>
          )}
          {place.lesserKnown ? <span className="rounded-full bg-green-soft px-2.5 py-1 text-xs font-bold text-green-ink">Moins connu</span> : null}
          {place.sponsored ? <span className="rounded-full bg-coral-soft px-2.5 py-1 text-xs font-bold text-coral-ink">Sponsorisé · {place.sponsored.label}</span> : null}
          {visits.some((v) => VISIT_RULES[v.status].countsAsRealVisit) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green px-2.5 py-1 text-xs font-bold text-on-green">
              <Footprints size={13} aria-hidden="true" /> Visité
            </span>
          ) : null}
        </div>

        <p className="text-lg leading-relaxed text-ink">{place.summary}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-ink-2">
          <span>{priceText(place, destination)}</span>
          <span aria-hidden="true">·</span>
          <span className={open.status === "open" ? "text-green-ink" : open.status === "closed" ? "text-coral-ink" : ""}>{open.label}</span>
          {userPosition ? (
            <>
              <span aria-hidden="true">·</span>
              <span>à {formatDistance(straightLineMeters(userPosition, place.location), state.settings.units)} à vol d&apos;oiseau</span>
            </>
          ) : null}
        </div>

        {/* Requête de conteneur : la fiche vit aussi dans le panneau latéral étroit de la carte. */}
        <div className="@container">
          <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            <button type="button" className={`btn ${saved ? "btn-primary" : "btn-ghost"} px-3`} onClick={() => setDialog("save")} aria-haspopup="dialog">
              {saved ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
              {saved ? "Enregistré" : "Enregistrer"}
            </button>
            <button type="button" className="btn btn-ghost px-3" onClick={() => setDialog("excursion")} aria-haspopup="dialog">
              <CalendarPlus size={18} aria-hidden="true" /> Excursion
            </button>
            <button type="button" className="btn btn-ghost px-3" onClick={() => setDialog("navigate")} aria-haspopup="dialog">
              <Navigation size={18} aria-hidden="true" /> Y aller
            </button>
            <button type="button" className="btn btn-explore px-3" onClick={() => setDialog("visit")} aria-haspopup="dialog">
              <Sparkles size={18} aria-hidden="true" /> J&apos;y suis allé
            </button>
          </div>
        </div>

        <section aria-labelledby={`about-${place.id}`} className="space-y-3">
          <h2 id={`about-${place.id}`} className="text-xl font-semibold">
            À découvrir
          </h2>
          <p className="leading-relaxed text-ink-2">{place.description}</p>
          {place.history ? (
            <p className="leading-relaxed text-ink-2">
              <strong className="text-ink">Un peu d&apos;histoire. </strong>
              {place.history}
            </p>
          ) : null}
        </section>

        <WeatherBlock place={place} />

        <section aria-labelledby={`practical-${place.id}`}>
          <h2 id={`practical-${place.id}`} className="mb-2 text-xl font-semibold">
            Infos pratiques
          </h2>
          <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-4 py-3 text-sm">
                <dt className="font-bold text-ink-2">{l.label}</dt>
                <dd className={l.certainty === "unknown" ? "text-ink-3 italic" : "text-ink"}>
                  {l.value}
                  {l.certainty === "estimate" ? <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold not-italic text-warn-ink">Estimation</span> : null}
                  {l.note ? <span className="mt-0.5 block text-xs text-ink-3">{l.note}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {visits.length > 0 ? (
          <section aria-labelledby={`journal-${place.id}`}>
            <h2 id={`journal-${place.id}`} className="mb-2 text-xl font-semibold">
              Mon carnet
            </h2>
            <ul className="space-y-2">
              {visits.map((v) => (
                <li key={v.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
                  <p className="font-bold">
                    {new Date(`${v.visitedOn}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {VISIT_RULES[v.status].label}
                  </p>
                  {v.proximity && v.status === "proximity_checked" ? (
                    <p className="text-ink-3">Contrôle : à {v.proximity.distanceM} m, précision {Math.round(v.proximity.accuracyM ?? 0)} m.</p>
                  ) : null}
                  {v.note ? <p className="mt-1 text-ink-2">« {v.note} »</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <PlaceReviews placeId={place.id} />

        <section aria-labelledby={`sources-${place.id}`} className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          <h2 id={`sources-${place.id}`} className="mb-1 flex items-center gap-2 font-sans text-sm font-bold text-ink">
            <CircleAlert size={15} aria-hidden="true" /> Sources et fiabilité
          </h2>
          <p>{place.verification.note}</p>
          {place.locationPrecision === "approximate" ? <p className="mt-1">Coordonnées approximatives.</p> : null}
          <ul className="mt-2 space-y-1">
            {sources.map((s) => (
              <li key={s.id}>
                <strong>{s.label}</strong> — {s.license}. {s.terms}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setDialog("report")} className="mt-3 inline-flex min-h-11 items-center gap-2 font-bold text-coral-ink underline-offset-2 hover:underline">
            <Flag size={15} aria-hidden="true" /> Signaler une erreur
          </button>
        </section>
      </div>

      <VisitDialog place={place} destination={destination} open={dialog === "visit"} onClose={() => setDialog(null)} />
      <SaveDialog place={place} open={dialog === "save"} onClose={() => setDialog(null)} />
      <AddToExcursionDialog place={place} open={dialog === "excursion"} onClose={() => setDialog(null)} />
      <NavigateDialog place={place} open={dialog === "navigate"} onClose={() => setDialog(null)} from={userPosition} />
      <ReportDialog place={place} open={dialog === "report"} onClose={() => setDialog(null)} />
    </article>
  );
}
