"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Share2 } from "lucide-react";
import type { Excursion } from "@/modules/excursions/types";
import { useHorizon } from "../providers/HorizonProvider";
import { ExcursionEditor } from "../excursions/ExcursionEditor";
import { ShareDialog } from "../excursions/ShareDialog";
import { DuoPanel } from "../duo/DuoPanel";
import { useDuo } from "../duo/useDuo";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

/** Contenu comparable d'une excursion (sans la version ni la date de modification). */
function content(e: Excursion | null): string {
  if (!e) return "";
  return JSON.stringify({ ...e, version: null, updatedAt: null });
}

export function ExcursionDetailScreen({ id }: { id: string }) {
  const { state, actions, toast } = useHorizon();
  const [sharing, setSharing] = useState(false);
  const router = useRouter();
  const duo = useDuo();
  const stored = state.excursions.find((e) => e.id === id) ?? null;
  const membership = duo.overview?.memberships.find((m) => m.excursionId === id) ?? null;
  const [draft, setDraft] = useState<Excursion | null>(stored);
  const [syncedWith, setSyncedWith] = useState<Excursion | null>(stored);
  const [remoteChanged, setRemoteChanged] = useState(false);
  // Après un conflit d'enregistrement (Duo), on affiche la version récente chargée par le magasin.
  const [adoptLatest, setAdoptLatest] = useState(false);
  const dirty = Boolean(stored && draft) && content(draft) !== content(stored);
  useUnsavedChangesGuard(dirty);

  if (stored !== syncedWith) {
    // La version enregistrée a changé : sauvegarde, autre onglet ou modification de l'autre
    // personne (Duo). Sans modification locale en cours, on repart de la version à jour ;
    // sinon on garde le brouillon et on prévient, sans rien écraser.
    const newVersion = stored?.version !== syncedWith?.version || content(stored) !== content(syncedWith);
    const localEdits = content(draft) !== content(syncedWith);
    setSyncedWith(stored);
    if (!newVersion) {
      // Même version relue (retour sur l'onglet) : rien de nouveau.
    } else if (localEdits && content(stored) !== content(draft)) setRemoteChanged(true);
    else {
      setDraft(stored);
      setRemoteChanged(false);
    }
  }
  if (adoptLatest) {
    setAdoptLatest(false);
    // Seulement si une version plus récente existe (pas après une simple erreur réseau).
    if (stored && draft && stored.version !== draft.version) {
      setDraft(stored);
      setRemoteChanged(false);
    }
  }

  // Excursion Duo : relire la version en base au retour sur l'onglet.
  const shared = membership?.status === "accepted";
  const { refreshExcursions } = actions;
  useEffect(() => {
    if (!shared) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshExcursions();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shared, refreshExcursions]);

  if (!stored || !draft) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <h1 className="text-3xl font-semibold">Excursion introuvable</h1>
        <p className="mt-2 text-ink-2">Elle a peut-être été supprimée, la démonstration réinitialisée, ou elle ne vous est plus partagée.</p>
        <Link href="/excursions" className="btn btn-primary mt-4">
          Mes excursions
        </Link>
      </div>
    );
  }
  const isGuest = membership?.role === "guest";
  const partner = membership?.status === "accepted" ? membership.partnerPseudonym : null;
  const sent = duo.overview?.sentRequests.filter((r) => r.excursionId === id) ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <Link href="/excursions" className="inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
          <ChevronLeft size={18} aria-hidden="true" /> Excursions
        </Link>
        {!isGuest ? (
          <button type="button" className="btn btn-ghost min-h-10" onClick={() => setSharing(true)} aria-haspopup="dialog">
            <Share2 size={17} aria-hidden="true" /> Partager
          </button>
        ) : null}
      </div>
      <ShareDialog excursionId={draft.id} open={sharing} onClose={() => setSharing(false)} />
      <DuoPanel
        excursionId={draft.id}
        membership={membership}
        enabled={duo.enabled}
        call={duo.call}
        onChanged={() => {
          duo.refresh();
          void actions.refreshExcursions();
          if (isGuest) router.push("/excursions");
        }}
      />
      {remoteChanged ? (
        <p role="status" className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn-ink">
          {partner ?? "L'autre personne"} a modifié l&apos;excursion pendant que vous l&apos;éditiez.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setDraft(stored);
              setRemoteChanged(false);
            }}
          >
            Voir la version à jour
          </button>{" "}
          (vos modifications non enregistrées seront abandonnées).
        </p>
      ) : dirty ? (
        <p className="rounded-2xl bg-warn-soft px-4 py-2 text-sm font-semibold text-warn-ink">Modifications non enregistrées.</p>
      ) : null}
      <ExcursionEditor
        excursion={draft}
        saved
        onChange={setDraft}
        onSave={async () => {
          const saved = await actions.saveExcursion(draft);
          if (saved) {
            // Le brouillon adopte la nouvelle version : le prochain enregistrement partira d'elle.
            setDraft(saved);
            setRemoteChanged(false);
            toast("Modifications enregistrées.", "success");
          } else setAdoptLatest(true);
        }}
        onDelete={
          isGuest
            ? undefined
            : async () => {
                if (await actions.deleteExcursion(draft.id)) {
                  toast("Excursion supprimée.", "success");
                  router.push("/excursions");
                }
              }
        }
        together={
          partner && !dirty
            ? {
                partner,
                statusOf: (placeId) => sent.find((r) => r.placeId === placeId)?.status ?? "none",
                onDeclare: async (placeId) => {
                  const result = await actions.declareTogether(draft.id, placeId);
                  if (result) {
                    toast(result.requestCreated ? `Visite enregistrée. ${partner} doit la confirmer de son côté (7 jours).` : "Visite déjà déclarée pour vous deux.", "success");
                    duo.refresh();
                  }
                },
              }
            : undefined
        }
      />
    </div>
  );
}
