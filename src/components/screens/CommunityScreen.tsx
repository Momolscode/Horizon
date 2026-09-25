"use client";

import Link from "next/link";
import { useState } from "react";
import { FlaskConical, ShieldCheck, UserPlus, Users } from "lucide-react";
import { DEMO_FRIENDS } from "@/modules/community/demo-community";
import { computeStats, totals } from "@/modules/progression/engine";
import { levelForXp } from "@/modules/progression/config";
import { useHorizon } from "../providers/HorizonProvider";
import { ConnectedCommunity } from "../community/ConnectedCommunity";

export function CommunityScreen() {
  const { status, state, catalog } = useHorizon();
  const [compare, setCompare] = useState(false);
  const mine = computeStats(state.progression, catalog.catalog);
  const myLevel = levelForXp(totals(state.progression).xp).current.level;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-6">
      <div>
        <p className="eyebrow">Communauté</p>
        <h1 className="text-4xl font-semibold">Entre explorateurs</h1>
        <p className="mt-2 text-ink-2">
          Amis, recommandations et défis amicaux — toujours par choix, jamais
          par défaut.
        </p>
      </div>

      {status.kind === "demo" ? (
        <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn-ink">
          <FlaskConical
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />
          Communauté de démonstration : les personnes, statistiques et avis
          ci-dessous sont fictifs. Les demandes d&apos;amis réelles nécessitent
          le mode connecté.
        </p>
      ) : null}

      {status.kind === "connected" ? <ConnectedCommunity /> : null}

      {status.kind === "demo" ? (
        <>
          <section aria-labelledby="add-friend" className="card p-5">
            <h2
              id="add-friend"
              className="flex items-center gap-2 text-xl font-semibold"
            >
              <UserPlus size={20} aria-hidden="true" /> Ajouter un ami
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Par pseudonyme, avec acceptation ou refus par la personne invitée.
              Blocage et signalement disponibles à tout moment.
            </p>
            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
              {status.kind === "demo"
                ? "Indisponible en démonstration : aucune personne réelle ne peut être invitée."
                : "Fonction disponible avec votre compte."}
            </p>
          </section>

          <section aria-labelledby="friends-title">
            <div className="flex items-center justify-between">
              <h2
                id="friends-title"
                className="flex items-center gap-2 text-2xl font-semibold"
              >
                <Users size={22} aria-hidden="true" /> Amis{" "}
                {status.kind === "demo" ? "(fictifs)" : ""}
              </h2>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--coral)]"
                  checked={compare}
                  onChange={(e) => setCompare(e.target.checked)}
                />
                Comparer
              </label>
            </div>
            {status.kind === "demo" ? (
              <ul className="mt-3 space-y-3">
                {DEMO_FRIENDS.map((f) => (
                  <li key={f.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-12 w-12 place-items-center rounded-full bg-coral-soft font-display text-xl font-bold text-coral-ink"
                        aria-hidden="true"
                      >
                        {f.pseudonym[0]}
                      </span>
                      <div>
                        <p className="font-bold">
                          {f.pseudonym}{" "}
                          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn-ink">
                            Profil fictif
                          </span>
                        </p>
                        <p className="text-sm text-ink-3">
                          Niveau {f.stats.level} (fictif) ·{" "}
                          {f.stats.placesVisited} lieux · {f.stats.parcels}{" "}
                          parcelles
                        </p>
                      </div>
                    </div>
                    {compare ? (
                      <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
                        Vous : niveau {myLevel}, {mine.distinctPlacesVisited}{" "}
                        lieux, {mine.parcels} parcelles — {f.pseudonym} (fictif)
                        : niveau {f.stats.level}, {f.stats.placesVisited} lieux,{" "}
                        {f.stats.parcels} parcelles.
                      </p>
                    ) : null}
                    <ul className="mt-3 space-y-1 text-sm">
                      {f.recommendations.map((r) => (
                        <li key={r.placeId}>
                          Recommande{" "}
                          <Link
                            href={`/lieux/${r.placeId}`}
                            className="font-bold text-coral-ink hover:underline"
                          >
                            {catalog.placesById.get(r.placeId)?.name}
                          </Link>{" "}
                          : « {r.note} »
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-ink-2">Aucun ami pour l&apos;instant.</p>
            )}
            <p className="mt-2 text-xs text-ink-3">
              Les comparaisons sont facultatives et désactivées par défaut.
            </p>
          </section>
        </>
      ) : null}

      <section
        aria-labelledby="safety"
        className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2"
      >
        <h2
          id="safety"
          className="mb-1 flex items-center gap-2 font-sans text-sm font-bold text-ink"
        >
          <ShieldCheck size={15} aria-hidden="true" /> Confidentialité
        </h2>
        Profil et historique privés par défaut. Pas de carte de vos déplacements
        en temps réel. Les contributions publiques passent par une modération
        avant publication.
      </section>
    </div>
  );
}
