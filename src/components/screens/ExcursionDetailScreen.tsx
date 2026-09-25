"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Excursion } from "@/modules/excursions/types";
import { useHorizon } from "../providers/HorizonProvider";
import { ExcursionEditor } from "../excursions/ExcursionEditor";

export function ExcursionDetailScreen({ id }: { id: string }) {
  const { state, actions, toast } = useHorizon();
  const router = useRouter();
  const stored = state.excursions.find((e) => e.id === id) ?? null;
  const [draft, setDraft] = useState<Excursion | null>(stored);
  const [syncedWith, setSyncedWith] = useState<Excursion | null>(stored);
  if (stored !== syncedWith) {
    // La version enregistrée a changé (sauvegarde, autre onglet) : on repart d'elle.
    setSyncedWith(stored);
    setDraft(stored);
  }

  if (!stored || !draft) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <h1 className="text-3xl font-semibold">Excursion introuvable</h1>
        <p className="mt-2 text-ink-2">Elle a peut-être été supprimée ou la démonstration réinitialisée.</p>
        <Link href="/excursions" className="btn btn-primary mt-4">
          Mes excursions
        </Link>
      </div>
    );
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <Link href="/excursions" className="mb-2 inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft size={18} aria-hidden="true" /> Excursions
      </Link>
      {dirty ? <p className="mb-3 rounded-2xl bg-warn-soft px-4 py-2 text-sm font-semibold text-warn-ink">Modifications non enregistrées.</p> : null}
      <ExcursionEditor
        excursion={draft}
        saved
        onChange={setDraft}
        onSave={async () => {
          if (await actions.saveExcursion(draft)) toast("Modifications enregistrées.", "success");
        }}
        onDelete={async () => {
          if (await actions.deleteExcursion(draft.id)) {
            toast("Excursion supprimée.", "success");
            router.push("/excursions");
          }
        }}
      />
    </div>
  );
}
