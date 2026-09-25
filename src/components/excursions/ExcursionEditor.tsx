"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CloudOff, List, Map as MapIcon, Plus, RefreshCw, Replace, Save, Trash2, TriangleAlert } from "lucide-react";
import type { Excursion, SurpriseRequest } from "@/modules/excursions/types";
import { PARTY_LABELS, TRANSPORT_LABELS } from "@/modules/excursions/types";
import { scheduleExcursion, stepIssues, DEFAULT_VISIT_MINUTES } from "@/modules/excursions/schedule";
import { alternativesFor, moveStep, replaceStep } from "@/modules/excursions/surprise";
import { formatDuration, formatLocalDate, formatMinutes } from "@/modules/shared/time";
import { formatDistance } from "@/modules/shared/geo";
import { formatMoney, formatMoneyRange } from "@/modules/shared/money";
import { fnv1a } from "@/modules/shared/hash";
import { weatherProvider, type WeatherResult } from "@/adapters/weather";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import { useHorizon } from "../providers/HorizonProvider";
import { CategoryBadge } from "../CategoryIcon";
import { Dialog } from "../shell/Dialog";
import type { RouteStep } from "../map/HorizonMap";

const HorizonMap = dynamic(() => import("../map/HorizonMap").then((m) => m.HorizonMap), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-hidden="true" />,
});

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function asRequest(e: Excursion): SurpriseRequest {
  return { ...e, seed: e.seed ?? 0 };
}

function ExcursionWeather({ excursion }: { excursion: Excursion }) {
  const { catalog } = useHorizon();
  const destination = catalog.destinationsById.get(excursion.destinationId)!;
  const [result, setResult] = useState<WeatherResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void weatherProvider().forecast(destination.center, [excursion.date], controller.signal).then(setResult);
    return () => controller.abort();
  }, [destination.center, excursion.date]);
  if (!result) return null;
  const outdoor = excursion.steps.filter((s) => catalog.placesById.get(s.placeId)?.setting === "outdoor").length;
  if (result.status === "unavailable") {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <CloudOff size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Météo du {formatLocalDate(excursion.date)} : {result.reason}
          {outdoor > 0 ? ` ${outdoor} étape(s) en extérieur : vérifiez la météo avant de partir.` : ""}
        </span>
      </p>
    );
  }
  const day = result.days[0]!;
  return (
    <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
      Prévision : <strong className="text-ink">{day.summary}</strong>, {Math.round(day.tempMinC)}–{Math.round(day.tempMaxC)} °C.
      {day.wet && outdoor > 0 ? " Pluie annoncée : envisagez de remplacer les étapes en extérieur par des lieux couverts." : ""}
      <span className="block text-xs text-ink-3">{result.attribution}</span>
    </p>
  );
}

export function ExcursionEditor({
  excursion,
  saved,
  reasonsByPlace,
  explanation,
  onChange,
  onSave,
  onReroll,
  onDelete,
}: {
  excursion: Excursion;
  saved: boolean;
  reasonsByPlace?: Record<string, string[]>;
  explanation?: string[];
  onChange: (next: Excursion) => void;
  onSave: () => void;
  onReroll?: () => void;
  onDelete?: () => void;
}) {
  const { catalog, state } = useHorizon();
  const theme = useResolvedTheme();
  const destination = catalog.destinationsById.get(excursion.destinationId)!;
  const schedule = useMemo(() => scheduleExcursion(excursion, catalog.catalog), [excursion, catalog.catalog]);
  const [view, setView] = useState<"list" | "map">("list");
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Rendu uniquement côté client (écran chargé après le démarrage du magasin de données).
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const alternatives = useMemo(
    () => (replaceIndex === null ? [] : alternativesFor(asRequest(excursion), excursion.steps, replaceIndex, catalog.catalog, 5)),
    [replaceIndex, excursion, catalog.catalog],
  );
  const route: RouteStep[] = schedule.steps.map((s, i) => ({ placeId: s.place.id, location: s.place.location, index: i + 1, label: s.place.name }));
  const visited = useMemo(() => new Set(state.progression.visits.map((v) => v.placeId)), [state.progression.visits]);
  const budget = schedule.budget;
  const currency = destination.currency;
  const blocking = schedule.steps.some((s) => s.issues.some((i) => i.severity === "error"));

  // La carte ne recadre que lorsque la clé change (affichage carte ou liste d'étapes modifiée).
  const stepSignature = schedule.steps.map((s) => s.place.id).join(",");
  const stepLocations = schedule.steps.map((s) => s.place.location);
  const focus =
    view === "map"
      ? {
          key: fnv1a(`${view}:${stepSignature}`),
          bbox: (stepLocations.length === 0
            ? destination.bbox
            : [
                Math.min(...stepLocations.map((p) => p.lng)) - 0.005,
                Math.min(...stepLocations.map((p) => p.lat)) - 0.005,
                Math.max(...stepLocations.map((p) => p.lng)) + 0.005,
                Math.max(...stepLocations.map((p) => p.lat)) + 0.005,
              ]) as [number, number, number, number],
        }
      : null;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <label className="sr-only" htmlFor="excursion-title">
          Titre de l&apos;excursion
        </label>
        <input
          id="excursion-title"
          className="w-full rounded-xl bg-transparent font-display text-3xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-coral"
          value={excursion.title}
          maxLength={120}
          onChange={(e) => onChange({ ...excursion, title: e.target.value || "Excursion" })}
        />
        <p className="text-sm font-semibold text-ink-2">
          {destination.name} · {formatLocalDate(excursion.date)} · départ {excursion.startTime} · {formatDuration(excursion.durationMinutes)} · {PARTY_LABELS[excursion.party.kind]}
          {excursion.party.size > 2 ? ` (${excursion.party.size})` : ""} · {TRANSPORT_LABELS[excursion.transport]}
        </p>
        <p className="text-xs text-ink-3">
          Heures locales de {destination.name} ({destination.timezone})
          {deviceTz && deviceTz !== destination.timezone ? ` — votre appareil est réglé sur ${deviceTz}.` : "."}
        </p>
      </header>

      {explanation && explanation.length > 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
          <p className="mb-1 font-bold text-ink">Pourquoi cette proposition</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {explanation.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-label="Budget" className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs font-bold text-ink-3">Coûts connus / pers.</p>
          <p className="font-display text-xl font-semibold">{budget.perPerson.max === 0 ? formatMoney(0, currency) : formatMoneyRange(budget.perPerson.min, budget.perPerson.max, currency)}</p>
          <p className="text-[11px] text-ink-3">Groupe : {formatMoneyRange(budget.group.min, budget.group.max, currency)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs font-bold text-ink-3">Budget</p>
          <p
            className={`font-display text-xl font-semibold ${budget.verdict === "over" ? "text-danger-ink" : budget.verdict === "within" ? "text-green-ink" : ""}`}
          >
            {{ within: "Respecté", over: "Dépassé", uncertain: "Incertain", no_budget: "Libre" }[budget.verdict]}
          </p>
          <p className="text-[11px] text-ink-3">
            {budget.perPersonCap !== null ? `Plafond ${formatMoney(Math.round(budget.perPersonCap * 100) / 100, currency)} / pers.` : "Aucun plafond"}
            {budget.unknownSteps ? ` · ${budget.unknownSteps} coût(s) inconnu(s)` : ""}
            {budget.includesEstimates ? " · inclut des estimations" : ""}
          </p>
        </div>
      </section>

      <ExcursionWeather excursion={excursion} />

      {schedule.issues.map((i) => (
        <p key={i.message} className="flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn-ink" role="status">
          <TriangleAlert size={16} aria-hidden="true" /> {i.message}
        </p>
      ))}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{schedule.steps.length} étape{schedule.steps.length > 1 ? "s" : ""}</h2>
        <div className="flex rounded-full border border-line bg-surface p-1" role="group" aria-label="Affichage">
          <button type="button" className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-bold ${view === "list" ? "bg-ink text-bg" : "text-ink-2"}`} aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List size={15} aria-hidden="true" /> Liste
          </button>
          <button type="button" className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-bold ${view === "map" ? "bg-ink text-bg" : "text-ink-2"}`} aria-pressed={view === "map"} onClick={() => setView("map")}>
            <MapIcon size={15} aria-hidden="true" /> Carte
          </button>
        </div>
      </div>

      {view === "map" ? (
        <div className="relative h-[55dvh] overflow-hidden rounded-3xl border border-line">
          <HorizonMap
            places={schedule.steps.map((s) => s.place)}
            destinations={[]}
            selectedPlaceId={null}
            onSelectPlace={() => undefined}
            parcels={state.progression.parcels}
            showParcels={false}
            savedIds={new Set()}
            visitedIds={visited}
            focus={focus}
            reveal={null}
            userPosition={null}
            route={route}
            theme={theme}
            label={`Carte de l'excursion ${excursion.title}`}
          />
          <p className="absolute inset-x-2 top-2 rounded-xl bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] px-3 py-1.5 text-[11px] font-semibold text-ink-2">
            Tracé à vol d&apos;oiseau entre les étapes : ce n&apos;est pas un itinéraire praticable.
          </p>
        </div>
      ) : null}

      <ol aria-label="Étapes de l'excursion" className={view === "map" ? "sr-only" : "space-y-3"}>
        {schedule.steps.map((s, index) => {
          const reasons = reasonsByPlace?.[s.place.id];
          const issues = s.issues.filter((i) => i.code !== "hours_unknown" && i.code !== "estimate" && i.code !== "price_unknown");
          return (
            <li key={s.step.id} className="relative">
              {s.transfer ? (
                <p className="mb-2 ml-5 border-l-2 border-dashed border-line-strong pl-4 text-xs text-ink-3">
                  {formatDistance(s.transfer.straightLineM, state.settings.units)} à vol d&apos;oiseau · marge prévue {s.transfer.marginMinutes} min (estimation, pas un temps de trajet)
                </p>
              ) : null}
              <article className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-coral font-display text-lg font-bold text-on-coral" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-2">
                      {formatMinutes(s.arrival)} – {formatMinutes(s.departure)}
                      <span className="font-normal text-ink-3"> · {formatDuration(s.step.visitMinutes)}</span>
                    </p>
                    <h3 className="font-display text-xl font-semibold leading-snug">
                      <Link href={`/lieux/${s.place.id}`} className="hover:underline">
                        {s.place.name}
                      </Link>
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <CategoryBadge category={s.place.category} />
                      {s.hours === "unknown" ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">Horaires inconnus</span> : null}
                      {s.place.practical.price.status === "unknown" ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">Coût inconnu</span> : null}
                    </div>
                    {reasons ? (
                      <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
                        {reasons.slice(0, 3).map((r) => (
                          <li key={r}>· {r}</li>
                        ))}
                      </ul>
                    ) : null}
                    {issues.map((i) => (
                      <p key={i.message} className={`mt-2 text-sm font-semibold ${i.severity === "error" ? "text-danger-ink" : "text-warn-ink"}`}>
                        {i.message}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    className="btn btn-ghost min-h-10 px-3 text-sm"
                    disabled={index === 0}
                    onClick={() => onChange({ ...excursion, steps: moveStep(excursion.steps, index, index - 1) })}
                    aria-label={`Monter l'étape ${index + 1}`}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-10 px-3 text-sm"
                    disabled={index === schedule.steps.length - 1}
                    onClick={() => onChange({ ...excursion, steps: moveStep(excursion.steps, index, index + 1) })}
                    aria-label={`Descendre l'étape ${index + 1}`}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => setReplaceIndex(index)}>
                    <Replace size={16} aria-hidden="true" /> Remplacer
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-10 px-3 text-sm"
                    onClick={() => onChange({ ...excursion, steps: excursion.steps.filter((_, i) => i !== index) })}
                    aria-label={`Retirer l'étape ${index + 1} : ${s.place.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      {schedule.steps.length === 0 ? (
        <div className="card p-5 text-center text-ink-2">
          <p className="font-bold text-ink">Aucune étape</p>
          <p className="text-sm">Ajoutez des lieux ou relancez une proposition.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)} disabled={excursion.steps.length >= 12}>
          <Plus size={18} aria-hidden="true" /> Ajouter une étape
        </button>
        {onReroll ? (
          <button type="button" className="btn btn-ghost" onClick={onReroll}>
            <RefreshCw size={18} aria-hidden="true" /> Autre proposition
          </button>
        ) : null}
      </div>

      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 flex gap-2 rounded-3xl border border-line bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-2 shadow-float backdrop-blur lg:bottom-4">
        <button type="button" className="btn btn-primary flex-1" onClick={onSave} disabled={excursion.steps.length === 0}>
          <Save size={18} aria-hidden="true" /> {saved ? "Enregistrer les modifications" : "Enregistrer l'excursion"}
        </button>
        {onDelete ? (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)} aria-label="Supprimer l'excursion">
            <Trash2 size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {blocking ? <p className="text-sm font-semibold text-danger-ink">Certaines étapes sont fermées à l&apos;horaire prévu : réorganisez ou remplacez-les.</p> : null}

      <Dialog open={replaceIndex !== null} onClose={() => setReplaceIndex(null)} title="Remplacer l'étape">
        {alternatives.length === 0 ? (
          <p className="text-ink-2">Aucune alternative compatible avec vos contraintes dans cette destination.</p>
        ) : (
          <ul className="space-y-2">
            {alternatives.map((a) => {
              const warn = stepIssues(a.place, excursion).filter((i) => i.severity !== "info");
              return (
                <li key={a.place.id}>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-line p-3 text-left hover:border-line-strong"
                    onClick={() => {
                      onChange({ ...excursion, steps: replaceStep(excursion.steps, replaceIndex!, a.place, newId) });
                      setReplaceIndex(null);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <CategoryBadge category={a.place.category} compact />
                      <span className="font-bold">{a.place.name}</span>
                    </span>
                    <span className="mt-1 block text-sm text-ink-2">{a.reasons.slice(0, 2).join(" · ")}</span>
                    {warn.map((w) => (
                      <span key={w.message} className="mt-1 block text-xs font-semibold text-warn-ink">
                        {w.message}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>

      <Dialog open={adding} onClose={() => setAdding(false)} title={`Ajouter un lieu à ${destination.name}`}>
        <ul className="space-y-2">
          {(catalog.placesByDestination.get(destination.id) ?? [])
            .filter((p) => !excursion.steps.some((s) => s.placeId === p.id))
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-2xl border border-line p-3 text-left hover:border-line-strong"
                  onClick={() => {
                    const visitMinutes = p.practical.visitMinutes.status === "unknown" ? DEFAULT_VISIT_MINUTES : p.practical.visitMinutes.value;
                    onChange({ ...excursion, steps: [...excursion.steps, { id: newId(), placeId: p.id, visitMinutes, note: null }] });
                    setAdding(false);
                  }}
                >
                  <CategoryBadge category={p.category} compact />
                  <span className="font-semibold">{p.name}</span>
                </button>
              </li>
            ))}
        </ul>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette excursion ?"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setConfirmDelete(false);
                onDelete?.();
              }}
            >
              Supprimer
            </button>
          </>
        }
      >
        <p className="text-ink-2">Les visites déjà déclarées restent dans votre carnet.</p>
      </Dialog>
    </div>
  );
}
