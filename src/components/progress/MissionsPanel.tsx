"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Target } from "lucide-react";
import { MISSION_TIMEZONE, evaluateMissions } from "@/modules/progression/missions";
import { useHorizon } from "../providers/HorizonProvider";

const PERIOD_LABEL = { daily: "Aujourd'hui", weekly: "Cette semaine", monthly: "Ce mois-ci" } as const;

/** Missions de la période, calculées à partir des données réelles (hors simulations). */
export function MissionsPanel({ compact = false }: { compact?: boolean }) {
  const { state, catalog, actions, toast } = useHorizon();
  const [claiming, setClaiming] = useState<string | null>(null);
  // Horloge figée au montage : les périodes changent rarement pendant l'affichage.
  const [now] = useState(() => new Date());
  const statuses = useMemo(
    () => evaluateMissions({ snapshot: state.progression, catalog: catalog.catalog, excursionUpdates: state.excursions.map((e) => e.updatedAt) }, now, MISSION_TIMEZONE),
    [state.progression, state.excursions, catalog.catalog, now],
  );
  const list = compact ? statuses.filter((s) => !s.claimed).slice(0, 2) : statuses;

  return (
    <section aria-labelledby="missions-title" className={compact ? "" : "mt-8"}>
      <h2 id="missions-title" className="flex items-center gap-2 text-2xl font-semibold">
        <Target size={22} aria-hidden="true" /> Missions
      </h2>
      {!compact ? (
        <p className="text-sm text-ink-3">Faisables près de chez vous et gratuitement. Aucune mission n&apos;incite à entrer dans un lieu fermé ou à prendre des risques.</p>
      ) : null}
      <ul className={`mt-3 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        {list.map((s) => (
          <li key={s.mission.id} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-3">{PERIOD_LABEL[s.mission.period]}</p>
            <p className="mt-1 font-bold">{s.mission.title}</p>
            <p className="text-sm text-ink-2">{s.mission.description}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={s.target} aria-valuenow={s.progress} aria-label={`Progression : ${s.progress} sur ${s.target}`}>
                <div className="h-full rounded-full bg-green" style={{ width: `${(s.progress / s.target) * 100}%` }} />
              </div>
              <span className="text-sm font-bold">
                {s.progress}/{s.target}
              </span>
            </div>
            {s.claimed ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-green-ink">
                <CheckCircle2 size={16} aria-hidden="true" /> +{s.mission.xp} XP obtenus
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-explore mt-3 min-h-10 w-full text-sm"
                disabled={!s.completed || claiming === s.mission.id}
                onClick={async () => {
                  setClaiming(s.mission.id);
                  const xp = await actions.claimMission(s.mission.id);
                  setClaiming(null);
                  if (xp !== null) toast(`Mission accomplie : +${xp} XP.`, "success");
                }}
              >
                {s.completed ? `Récupérer +${s.mission.xp} XP` : `+${s.mission.xp} XP une fois accomplie`}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
