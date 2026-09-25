"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import type { Catalog } from "@/modules/catalog/schema";
import { DIETS, DIET_LABELS } from "@/modules/catalog/categories";
import {
  INTERESTS,
  INTEREST_LABELS,
  PARTY_KINDS,
  PARTY_LABELS,
  TRANSPORTS,
  TRANSPORT_LABELS,
  type SurpriseRequest,
  type TripPreferences,
} from "@/modules/excursions/types";
import { addDays, todayIn } from "@/modules/shared/time";

const DURATIONS = [
  { minutes: 180, label: "3 h" },
  { minutes: 300, label: "Demi-journée longue (5 h)" },
  { minutes: 480, label: "Journée (8 h)" },
];

export function SurpriseForm({
  catalog,
  initialDestinationId,
  preferences,
  availableMinutes,
  onSubmit,
}: {
  catalog: Catalog;
  initialDestinationId: string | null;
  preferences: TripPreferences;
  availableMinutes: number;
  onSubmit: (request: SurpriseRequest) => void;
}) {
  const firstDestination = catalog.destinations.find((d) => d.id === initialDestinationId) ?? catalog.destinations[0]!;
  const [destinationId, setDestinationId] = useState(firstDestination.id);
  const destination = catalog.destinations.find((d) => d.id === destinationId)!;
  const [date, setDate] = useState(() => addDays(todayIn(destination.timezone), 1));
  const [startTime, setStartTime] = useState("10:00");
  const [durationMinutes, setDuration] = useState(DURATIONS.some((d) => d.minutes === availableMinutes) ? availableMinutes : 300);
  const [prefs, setPrefs] = useState<TripPreferences>(preferences);
  const [budgetText, setBudgetText] = useState(preferences.budget.amount === null ? "" : String(preferences.budget.amount));

  const set = (patch: Partial<TripPreferences>) => setPrefs((p) => ({ ...p, ...patch }));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = budgetText.trim() === "" ? null : Math.max(0, Number(budgetText.replace(",", ".")));
        onSubmit({
          ...prefs,
          budget: { ...prefs.budget, amount: Number.isFinite(amount) ? amount : null },
          destinationId,
          date,
          startTime,
          durationMinutes,
          seed: 1,
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 font-bold">Destination</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {catalog.destinations.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={destinationId === d.id} className="chip" onClick={() => setDestinationId(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Date (heure locale de {destination.name})
          <input type="date" required className="field mt-1" value={date} min={todayIn(destination.timezone)} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          Départ
          <input type="time" required className="field mt-1" value={startTime} step={900} onChange={(e) => setStartTime(e.target.value)} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 font-bold">Temps disponible</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {DURATIONS.map((d) => (
            <button key={d.minutes} type="button" role="radio" aria-checked={durationMinutes === d.minutes} className="chip" onClick={() => setDuration(d.minutes)}>
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-bold">Avec qui ?</legend>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup">
          {PARTY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={prefs.party.kind === k}
              className="chip"
              onClick={() => set({ party: { kind: k, size: k === "solo" ? 1 : k === "couple" ? 2 : Math.max(3, prefs.party.size) } })}
            >
              {PARTY_LABELS[k]}
            </button>
          ))}
          {prefs.party.kind === "friends" || prefs.party.kind === "family" ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              Nombre
              <input
                type="number"
                min={2}
                max={12}
                className="field w-20"
                value={prefs.party.size}
                onChange={(e) => set({ party: { ...prefs.party, size: Math.min(12, Math.max(2, Number(e.target.value) || 2)) } })}
              />
            </label>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-bold">Budget</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span className="sr-only">Montant en euros (vide = sans limite)</span>
            <input
              inputMode="decimal"
              className="field w-28"
              placeholder="Sans limite"
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value.replace(/[^\d.,]/g, ""))}
              aria-describedby="budget-help"
            />
            €
          </label>
          <div className="flex gap-2" role="radiogroup" aria-label="Base du budget">
            <button type="button" role="radio" aria-checked={prefs.budget.basis === "per_person"} className="chip" onClick={() => set({ budget: { ...prefs.budget, basis: "per_person" } })}>
              par personne
            </button>
            <button type="button" role="radio" aria-checked={prefs.budget.basis === "group"} className="chip" onClick={() => set({ budget: { ...prefs.budget, basis: "group" } })}>
              pour le groupe
            </button>
          </div>
        </div>
        <p id="budget-help" className="mt-1 text-xs text-ink-3">
          Laisser vide pour ne pas fixer de limite. Les coûts inconnus ne sont jamais comptés comme gratuits.
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-bold">Déplacements</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {TRANSPORTS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={prefs.transport === t} className="chip" onClick={() => set({ transport: t })}>
              {TRANSPORT_LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-bold">Envies</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const active = prefs.interests.includes(i);
            return (
              <button key={i} type="button" aria-pressed={active} className="chip" onClick={() => set({ interests: active ? prefs.interests.filter((x) => x !== i) : [...prefs.interests, i] })}>
                {INTEREST_LABELS[i]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-bold">Besoins et repas</legend>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-[var(--coral)]"
            checked={prefs.needs.wheelchair}
            onChange={(e) => set({ needs: { ...prefs.needs, wheelchair: e.target.checked } })}
          />
          <span>
            Accessibilité en fauteuil nécessaire
            <span className="block text-xs text-ink-3">Seuls les lieux signalés comme accessibles sont proposés (peu de données en démonstration).</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => {
            const active = prefs.needs.diets.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                className="chip"
                onClick={() => set({ needs: { ...prefs.needs, diets: active ? prefs.needs.diets.filter((x) => x !== d) : [...prefs.needs.diets, d] } })}
              >
                {DIET_LABELS[d]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Repas">
          {(["auto", "yes", "no"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={prefs.includeMeal === m} className="chip" onClick={() => set({ includeMeal: m })}>
              {{ auto: "Repas si l'horaire s'y prête", yes: "Inclure un repas", no: "Sans repas" }[m]}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="btn btn-primary w-full text-base">
        <Wand2 size={20} aria-hidden="true" /> Composer ma sortie
      </button>
      <p className="text-center text-xs text-ink-3">Moteur déterministe et explicable : aucune IA, aucun lieu inventé.</p>
    </form>
  );
}
