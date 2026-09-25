"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { surprise, type SurpriseResult } from "@/modules/excursions/surprise";
import type { Excursion, SurpriseRequest } from "@/modules/excursions/types";
import { DEFAULT_VISIT_MINUTES } from "@/modules/excursions/schedule";
import { addDays, formatLocalDate, todayIn } from "@/modules/shared/time";
import { useHorizon } from "../providers/HorizonProvider";
import { SurpriseForm } from "../excursions/SurpriseForm";
import { ExcursionEditor } from "../excursions/ExcursionEditor";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewExcursionScreen() {
  const { catalog, state, actions, toast } = useHorizon();
  const router = useRouter();
  const params = useSearchParams();
  // Un identifiant de destination inconnu dans l'URL est ignoré (pas de plantage).
  const requestedDestination = params.get("destination");
  const initialDestination = requestedDestination && catalog.destinationsById.has(requestedDestination) ? requestedDestination : null;
  const initialPlace = params.get("lieu") ? catalog.placesById.get(params.get("lieu")!) : undefined;
  const manual = params.get("mode") === "manuel" || Boolean(initialPlace);

  const [request, setRequest] = useState<SurpriseRequest | null>(null);
  const [result, setResult] = useState<SurpriseResult | null>(null);
  const [draft, setDraft] = useState<Excursion | null>(() => {
    if (!manual) return null;
    const destinationId = initialPlace?.destinationId ?? initialDestination ?? catalog.catalog.destinations[0]!.id;
    const destination = catalog.destinationsById.get(destinationId)!;
    const date = addDays(todayIn(destination.timezone), 1);
    const now = new Date().toISOString();
    const steps = initialPlace
      ? [{ id: newId(), placeId: initialPlace.id, visitMinutes: initialPlace.practical.visitMinutes.status === "unknown" ? DEFAULT_VISIT_MINUTES : initialPlace.practical.visitMinutes.value, note: null }]
      : [];
    return {
      ...state.preferences.trip,
      id: newId(),
      title: `${destination.name}, ${formatLocalDate(date)}`,
      destinationId,
      date,
      startTime: "10:00",
      durationMinutes: 300,
      seed: null,
      steps,
      origin: "manual",
      createdAt: now,
      updatedAt: now,
    };
  });

  const run = (req: SurpriseRequest) => {
    const res = surprise(req, catalog.catalog, newId);
    setRequest(req);
    setResult(res);
    const destination = catalog.destinationsById.get(req.destinationId)!;
    const now = new Date().toISOString();
    const { seed, ...rest } = req;
    setDraft({
      ...rest,
      seed,
      id: draft?.id ?? newId(),
      title: `Surprise à ${destination.name}`,
      steps: res.steps,
      origin: "surprise",
      createdAt: now,
      updatedAt: now,
    });
  };

  const reasons = useMemo(() => result?.reasonsByPlace, [result]);
  const [saving, setSaving] = useState(false);
  // Une proposition non enregistrée est un brouillon : on prévient avant de la perdre.
  useUnsavedChangesGuard(Boolean(draft && draft.steps.length > 0) && !saving);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <button type="button" onClick={() => {
          if (draft && !manual) {
            setDraft(null);
            setResult(null);
          } else if (!draft?.steps.length || window.confirm("Des modifications ne sont pas enregistrées. Quitter quand même ?")) router.push("/excursions");
        }} className="mb-2 inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft size={18} aria-hidden="true" /> {draft && !manual ? "Modifier les critères" : "Excursions"}
      </button>
      {!draft ? (
        <>
          <p className="eyebrow">Surprends-nous</p>
          <h1 className="mb-1 text-4xl font-semibold">On compose votre sortie</h1>
          <p className="mb-6 text-ink-2">Quelques réglages, puis une proposition de 3 à 5 étapes que vous pourrez modifier.</p>
          <SurpriseForm
            catalog={catalog.catalog}
            initialDestinationId={initialDestination}
            preferences={state.preferences.trip}
            availableMinutes={state.preferences.availableMinutes}
            initialRequest={request}
            onSubmit={run}
          />
        </>
      ) : (
        <>
          {result?.status === "insufficient" ? (
            <p className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn-ink" role="status">
              Proposition incomplète : {result.explanation[0]}
            </p>
          ) : null}
          <ExcursionEditor
            excursion={draft}
            saved={false}
            reasonsByPlace={reasons}
            explanation={result?.explanation}
            onChange={setDraft}
            onReroll={request ? () => run({ ...request, seed: request.seed + 1 }) : undefined}
            onSave={async () => {
              setSaving(true);
              if (await actions.saveExcursion(draft)) {
                toast("Excursion enregistrée.", "success");
                router.push(`/excursions/${draft.id}`);
              } else setSaving(false);
            }}
          />
        </>
      )}
    </div>
  );
}
