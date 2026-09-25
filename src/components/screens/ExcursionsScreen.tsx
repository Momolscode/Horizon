"use client";

import Link from "next/link";
import { CalendarDays, Plus, Route, Wand2 } from "lucide-react";
import { scheduleExcursion } from "@/modules/excursions/schedule";
import { formatLocalDate } from "@/modules/shared/time";
import { useHorizon } from "../providers/HorizonProvider";
import { PlaceArt } from "../PlaceArt";

export function ExcursionsScreen() {
  const { state, catalog } = useHorizon();
  const excursions = [...state.excursions].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <p className="eyebrow">Mes excursions</p>
      <h1 className="text-4xl font-semibold">Excursions</h1>
      <p className="mt-2 text-ink-2">Transformez vos idées en sortie concrète : étapes, horaires, budget et carte.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link href="/excursions/nouvelle" className="card grain relative flex min-h-36 flex-col justify-end overflow-hidden bg-ink p-5 text-bg">
          <Wand2 aria-hidden="true" className="mb-2 text-coral" />
          <span className="font-display text-2xl font-semibold">Surprends-nous</span>
          <span className="text-sm opacity-85">3 à 5 étapes cohérentes selon vos envies, en un geste.</span>
        </Link>
        <Link href="/excursions/nouvelle?mode=manuel" className="card flex min-h-36 flex-col justify-end p-5">
          <Plus aria-hidden="true" className="mb-2 text-coral-ink" />
          <span className="font-display text-2xl font-semibold">Composer moi-même</span>
          <span className="text-sm text-ink-2">Choisissez vos lieux, HORIZON vérifie l&apos;enchaînement.</span>
        </Link>
      </div>

      <h2 className="mb-3 mt-8 text-2xl font-semibold">Enregistrées</h2>
      {excursions.length === 0 ? (
        <div className="card flex flex-col items-center p-8 text-center">
          <Route aria-hidden="true" className="mb-2 text-ink-3" size={32} />
          <p className="font-bold">Aucune excursion pour l&apos;instant</p>
          <p className="text-sm text-ink-2">Lancez « Surprends-nous » ou composez votre propre sortie.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {excursions.map((e) => {
            const destination = catalog.destinationsById.get(e.destinationId);
            const schedule = scheduleExcursion(e, catalog.catalog);
            const first = catalog.placesById.get(e.steps[0]?.placeId ?? "");
            return (
              <li key={e.id}>
                <Link href={`/excursions/${e.id}`} className="card flex items-center gap-3 overflow-hidden p-2 pr-4">
                  <div className="grain relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                    {first ? <PlaceArt seed={first.id} motif={first.art.motif} palette={first.art.palette} className="absolute inset-0 h-full w-full" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold">{e.title}</p>
                    <p className="flex items-center gap-1 text-sm text-ink-2">
                      <CalendarDays size={14} aria-hidden="true" /> {formatLocalDate(e.date)} · {destination?.name}
                    </p>
                    <p className="text-xs text-ink-3">
                      {e.steps.length} étape(s)
                      {schedule.steps.some((s) => s.hours === "closed") ? " · conflit horaire à corriger" : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
