"use client";

import Link from "next/link";
import { Check, Users, X } from "lucide-react";
import { formatLocalDate } from "@/modules/shared/time";
import { useHorizon } from "../providers/HorizonProvider";
import type { DuoOverview } from "./useDuo";

/** Invitations Duo reçues et visites « pour deux » à confirmer. */
export function DuoInbox({
  overview,
  onChanged,
  call,
}: {
  overview: DuoOverview | null;
  onChanged: () => void;
  call: (path: string, method: "POST" | "PATCH", body: unknown) => Promise<{ ok: boolean; message?: string }>;
}) {
  const { catalog, toast, actions } = useHorizon();
  if (!overview || (overview.invitations.length === 0 && overview.visitRequests.length === 0)) return null;

  const respondInvitation = async (excursionId: string, accept: boolean) => {
    const r = await call(`/api/duo/${excursionId}`, "PATCH", { action: accept ? "accept" : "decline" });
    toast(r.ok ? (accept ? "Invitation acceptée : l'excursion est dans votre liste." : "Invitation refusée.") : (r.message ?? "Action impossible."), r.ok ? "success" : "error");
    if (r.ok) {
      await actions.refreshExcursions();
      onChanged();
    }
  };

  return (
    <section aria-labelledby="duo-inbox" className="mt-6 space-y-3">
      <h2 id="duo-inbox" className="flex items-center gap-2 text-2xl font-semibold">
        <Users size={22} aria-hidden="true" /> Mode Duo
      </h2>
      {overview.invitations.map((i) => (
        <article key={i.excursionId} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-bold">{i.ownerPseudonym} vous invite à préparer « {i.title} »</p>
            <p className="text-sm text-ink-2">
              {catalog.destinationsById.get(i.destinationId)?.name} · {formatLocalDate(i.date)}
            </p>
          </div>
          <span className="flex gap-2">
            <button type="button" className="btn btn-explore min-h-10 px-3 text-sm" onClick={() => void respondInvitation(i.excursionId, true)}>
              <Check size={16} aria-hidden="true" /> Accepter
            </button>
            <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => void respondInvitation(i.excursionId, false)}>
              <X size={16} aria-hidden="true" /> Refuser
            </button>
          </span>
        </article>
      ))}
      {overview.visitRequests.map((r) => {
        const place = catalog.placesById.get(r.placeId);
        return (
          <article key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold">
                {r.fromPseudonym} dit que vous étiez ensemble à{" "}
                <Link href={`/lieux/${r.placeId}`} className="text-coral-ink underline">
                  {place?.name ?? "un lieu"}
                </Link>
              </p>
              <p className="text-sm text-ink-2">
                Le {formatLocalDate(r.visitedOn)} · « {r.excursionTitle} » · à confirmer avant le{" "}
                {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(r.expiresAt))}
              </p>
              <p className="text-xs text-ink-3">Confirmer ajoute cette visite à votre carnet (parcelle et XP selon les règles habituelles). Refuser n&apos;ajoute rien.</p>
            </div>
            <span className="flex gap-2">
              <button
                type="button"
                className="btn btn-explore min-h-10 px-3 text-sm"
                onClick={async () => {
                  if (await actions.respondDuoVisit(r.id, true, r.placeId)) onChanged();
                }}
              >
                <Check size={16} aria-hidden="true" /> J&apos;y étais
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-10 px-3 text-sm"
                onClick={async () => {
                  if (await actions.respondDuoVisit(r.id, false, r.placeId)) {
                    toast("Visite refusée : rien n'a été ajouté à votre carnet.", "success");
                    onChanged();
                  }
                }}
              >
                <X size={16} aria-hidden="true" /> Refuser
              </button>
            </span>
          </article>
        );
      })}
    </section>
  );
}
