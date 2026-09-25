"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  INTERESTS,
  INTEREST_LABELS,
  PARTY_KINDS,
  PARTY_LABELS,
  TRANSPORTS,
  TRANSPORT_LABELS,
  type TripPreferences,
} from "@/modules/excursions/types";
import { useHorizon } from "../providers/HorizonProvider";

const BUDGETS: Array<{ amount: number | null; label: string }> = [
  { amount: 0, label: "Gratuit" },
  { amount: 20, label: "≈ 20 €" },
  { amount: 60, label: "≈ 60 €" },
  { amount: 100, label: "≈ 100 €" },
  { amount: null, label: "Sans limite" },
];

export function OnboardingScreen() {
  const { state, actions } = useHorizon();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [trip, setTrip] = useState<TripPreferences>(state.preferences.trip);
  const [time, setTime] = useState<"2h" | "half" | "day">("half");

  const finish = async (save: boolean) => {
    const availableMinutes = { "2h": 180, half: 300, day: 480 }[time];
    await actions.updatePreferences({ onboarded: true, ...(save ? { trip, availableMinutes } : {}) });
    router.push("/carte");
  };

  const steps = [
    {
      title: "Vous partez…",
      body: (
        <div className="grid grid-cols-2 gap-3">
          {PARTY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={trip.party.kind === k}
              className={`card min-h-24 p-4 text-left font-display text-xl font-semibold ${trip.party.kind === k ? "border-coral ring-2 ring-coral" : ""}`}
              onClick={() => setTrip({ ...trip, party: { kind: k, size: k === "solo" ? 1 : k === "couple" ? 2 : 4 } })}
            >
              {PARTY_LABELS[k]}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Votre budget par personne",
      body: (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {BUDGETS.map((b) => (
            <button key={b.label} type="button" role="radio" aria-checked={trip.budget.amount === b.amount} className="chip min-h-12 px-5 text-base" onClick={() => setTrip({ ...trip, budget: { amount: b.amount, basis: "per_person" } })}>
              {b.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Votre temps disponible",
      body: (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {(
            [
              ["2h", "Quelques heures"],
              ["half", "Une demi-journée"],
              ["day", "Une journée"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={time === id} className="chip min-h-12 px-5 text-base" onClick={() => setTime(id)}>
              {label}
            </button>
          ))}
          <p className="w-full text-sm text-ink-3">Réglable à chaque excursion.</p>
        </div>
      ),
    },
    {
      title: "Comment vous déplacez-vous ?",
      body: (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {TRANSPORTS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={trip.transport === t} className="chip min-h-12 px-5 text-base" onClick={() => setTrip({ ...trip, transport: t })}>
              {TRANSPORT_LABELS[t]}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Vos envies",
      body: (
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const active = trip.interests.includes(i);
            return (
              <button key={i} type="button" aria-pressed={active} className="chip min-h-12 px-5 text-base" onClick={() => setTrip({ ...trip, interests: active ? trip.interests.filter((x) => x !== i) : [...trip.interests, i] })}>
                {INTEREST_LABELS[i]}
              </button>
            );
          })}
        </div>
      ),
    },
  ];
  const current = steps[step]!;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-10 pt-6">
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <button type="button" className="inline-flex min-h-11 items-center gap-1 font-bold text-ink-2" onClick={() => setStep(step - 1)}>
            <ChevronLeft size={18} aria-hidden="true" /> Retour
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="min-h-11 font-bold text-ink-2 underline-offset-2 hover:underline" onClick={() => void finish(false)}>
          Passer
        </button>
      </div>
      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-coral" : "bg-line"}`} />
        ))}
      </div>
      <p className="eyebrow mt-6">
        Étape {step + 1} sur {steps.length}
      </p>
      <h1 className="mb-6 text-4xl font-semibold">{current.title}</h1>
      <div className="flex-1">{current.body}</div>
      <button
        type="button"
        className="btn btn-primary mt-8 w-full text-base"
        onClick={() => (step < steps.length - 1 ? setStep(step + 1) : void finish(true))}
      >
        {step < steps.length - 1 ? "Continuer" : "C'est parti"}
      </button>
      <p className="mt-3 text-center text-xs text-ink-3">Préférences modifiables à chaque excursion. Aucun compte requis.</p>
    </div>
  );
}
