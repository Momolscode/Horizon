"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Award, Sparkles, TrendingUp } from "lucide-react";
import { VISIT_RULES, levelForXp } from "@/modules/progression/config";
import { badgeLabel, totals } from "@/modules/progression/engine";
import { useHorizon } from "../providers/HorizonProvider";
import { HexReveal } from "./HexReveal";

/**
 * Célébration après une visite : révélation de la parcelle, XP, badges, niveau.
 * Les mentions distinguent toujours visite déclarée, contrôlée et simulée.
 */
export function RevealOverlay() {
  const { reveal, clearReveal, catalog, state } = useHorizon();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (reveal && !dialog.open) {
      dialog.showModal();
      headingRef.current?.focus();
    }
    if (!reveal && dialog.open) dialog.close();
  }, [reveal]);

  const place = reveal ? catalog.placesById.get(reveal.placeId) : undefined;
  const destination = place ? catalog.destinationsById.get(place.destinationId) : undefined;
  const outcome = reveal?.outcome;
  const parcel = outcome?.parcel;
  const rule = outcome ? VISIT_RULES[outcome.visit.status] : null;
  const level = levelForXp(totals(state.progression).xp);

  const title = !parcel
    ? "Visite ajoutée au carnet"
    : parcel.isNew
      ? "Parcelle révélée !"
      : parcel.previousState !== parcel.parcel.state
        ? "Parcelle confirmée"
        : "Parcelle déjà explorée";

  return (
    <dialog
      ref={ref}
      aria-labelledby="reveal-title"
      onClose={clearReveal}
      onCancel={(e) => {
        e.preventDefault();
        clearReveal();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-[28px] border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[rgba(10,18,36,0.55)] backdrop:backdrop-blur-sm"
    >
      {reveal && place && outcome ? (
        <div className="grain">
          <div className="relative flex flex-col items-center bg-gradient-to-b from-green-soft to-surface px-6 pb-2 pt-8 text-center">
            <div className="relative">
              <HexReveal state={parcel?.parcel.state ?? "declared"} />
              {parcel?.isNew ? (
                <span className="animate-stamp absolute -right-6 top-2 rounded-md border-2 border-coral px-2 py-0.5 font-display text-sm font-bold uppercase tracking-widest text-coral-ink">
                  Révélée
                </span>
              ) : null}
            </div>
            <p className="eyebrow mt-4">{destination?.name ?? ""}</p>
            <h2 id="reveal-title" ref={headingRef} tabIndex={-1} className="mt-1 text-3xl font-semibold outline-none">
              {title}
            </h2>
            <p className="mt-2 text-ink-2">{place.name}</p>
          </div>

          <div className="space-y-3 px-6 pb-6 pt-3">
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
              <strong className="block text-ink">{rule?.label}</strong>
              {outcome.statusExplanation !== rule?.label ? outcome.statusExplanation : null}
              {outcome.visit.status === "simulated" ? " Aucune XP : une simulation ne compte pas comme une visite réelle." : null}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-line p-3">
                <p className="flex items-center gap-1 text-xs font-bold text-ink-3">
                  <Sparkles size={14} aria-hidden="true" /> XP gagnée
                </p>
                <p className="font-display text-2xl font-semibold text-green-ink">+{outcome.xpGained}</p>
                <p className="text-[11px] text-ink-3">non dépensable</p>
              </div>
              <div className="rounded-2xl border border-line p-3">
                <p className="flex items-center gap-1 text-xs font-bold text-ink-3">
                  <TrendingUp size={14} aria-hidden="true" /> Niveau
                </p>
                <p className="font-display text-2xl font-semibold">{level.current.level}</p>
                <p className="text-[11px] text-ink-3">{outcome.levelAfter > outcome.levelBefore ? `Nouveau : ${level.current.title}` : level.current.title}</p>
              </div>
            </div>

            {outcome.pointsGained > 0 ? (
              <p className="text-sm text-ink-2">
                +{outcome.pointsGained} points récompense (récompense de niveau). Aucune offre d&apos;échange n&apos;est active pour le moment.
              </p>
            ) : null}

            {outcome.badges.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-bold text-ink-3">Nouveaux badges</p>
                <ul className="flex flex-wrap gap-2">
                  {outcome.badges.map((b) => (
                    <li key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-3 py-1.5 text-sm font-bold text-coral-ink">
                      <Award size={15} aria-hidden="true" />
                      {badgeLabel(b.id, catalog.catalog)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                className="btn btn-explore flex-1"
                onClick={() => {
                  clearReveal();
                  router.push(`/carte?lieu=${place.id}&revele=1`);
                }}
              >
                Voir sur ma carte
              </button>
              <button type="button" className="btn btn-ghost flex-1" onClick={clearReveal}>
                Continuer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
