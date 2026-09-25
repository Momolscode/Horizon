"use client";

import Link from "next/link";
import { useState } from "react";
import { isValidSiret } from "@/modules/catalog/contributions";
import type { Place } from "@/modules/catalog/schema";
import { useHorizon } from "../providers/HorizonProvider";
import { Dialog } from "../shell/Dialog";

/**
 * Revendication d'une fiche par l'établissement : SIRET (contrôle de forme) et preuve.
 * Rien n'est modifiable avant la validation manuelle d'un administrateur. Aucun paiement.
 */
export function ClaimDialog({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const { toast } = useHorizon();
  const [siret, setSiret] = useState("");
  const [proofKind, setProofKind] = useState<"email_domain" | "document">("email_domain");
  const [proofText, setProofText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const siretOk = isValidSiret(siret);

  return (
    <Dialog open={open} onClose={onClose} title="Revendiquer la fiche">
      {done ? (
        <div className="space-y-3 text-sm">
          <p className="font-bold">Demande envoyée.</p>
          <p className="text-ink-2">Un administrateur vérifie le SIRET et votre preuve. Vous suivez la demande dans vos contributions ; vous pourrez ensuite corriger les informations pratiques et répondre aux avis.</p>
          <Link href="/contributions" className="btn btn-primary">
            Mes contributions
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!siretOk) return;
            setSending(true);
            const res = await fetch("/api/revendications", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ placeId: place.id, siret, proofKind, proofText }),
            }).catch(() => null);
            setSending(false);
            const data = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
            if (res?.ok) setDone(true);
            else toast(data?.message ?? "Envoi impossible pour le moment.", "error");
          }}
        >
          <p className="text-ink-2">
            Vous représentez <strong>{place.name}</strong> ? Après vérification, vous pourrez corriger ses informations pratiques (affichées « fournies par l&apos;établissement ») et répondre gratuitement aux avis. Vous ne pourrez ni modifier, ni supprimer, ni noter les avis. Si vous avez déjà laissé un avis sur ce lieu, il sera retiré à la validation.
          </p>
          <label className="block font-bold">
            SIRET de l&apos;établissement
            <input className="field mt-1" inputMode="numeric" autoComplete="off" value={siret} onChange={(e) => setSiret(e.target.value)} aria-describedby="siret-help" required />
            <span id="siret-help" className={`text-xs font-normal ${siret && !siretOk ? "text-danger-ink" : "text-ink-3"}`}>
              {siret && !siretOk ? "SIRET invalide : 14 chiffres avec une clé de contrôle." : "14 chiffres. L'administrateur contrôle l'établissement dans la base Sirene (données publiques)."}
            </span>
          </label>
          <fieldset>
            <legend className="font-bold">Preuve</legend>
            <div className="mt-1 space-y-1">
              <label className="flex items-center gap-2">
                <input type="radio" name="proof" checked={proofKind === "email_domain"} onChange={() => setProofKind("email_domain")} /> Une adresse e-mail sur le domaine de l&apos;établissement
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="proof" checked={proofKind === "document"} onChange={() => setProofKind("document")} /> Un justificatif (extrait Kbis, facture…) que vous pouvez transmettre sur demande
              </label>
            </div>
          </fieldset>
          <label className="block font-bold">
            {proofKind === "email_domain" ? "Adresse e-mail professionnelle" : "Justificatif et moyen de vous contacter"}
            <textarea className="field mt-1 min-h-16 py-2" minLength={5} maxLength={500} required value={proofText} onChange={(e) => setProofText(e.target.value)} />
          </label>
          <p className="text-xs text-ink-3">Aucun fichier n&apos;est téléversé ici : l&apos;administrateur vous recontacte si besoin. La gestion de fiche est gratuite.</p>
          <button type="submit" className="btn btn-primary w-full" disabled={sending || !siretOk}>
            {sending ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
