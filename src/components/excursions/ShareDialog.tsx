"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import { useAuth } from "../connected/AuthContext";
import { useHorizon } from "../providers/HorizonProvider";
import { Dialog } from "../shell/Dialog";

type ShareRow = { token: string; include_date: boolean; created_at: string; revoked_at: string | null };

/** Liens de partage en lecture seule, révocables à tout moment. */
export function ShareDialog({ excursionId, open, onClose }: { excursionId: string; open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const { toast } = useHorizon();
  const [includeDate, setIncludeDate] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!open || !auth?.user) return;
    let cancelled = false;
    void auth.supabase
      .from("excursion_shares")
      .select("token, include_date, created_at, revoked_at")
      .eq("excursion_id", excursionId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setShares((data ?? []) as ShareRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, auth, excursionId, version]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Dialog open={open} onClose={onClose} title="Partager l'excursion">
      {!auth?.user ? (
        <p className="text-ink-2">Le partage nécessite un compte (mode connecté). En démonstration, rien ne peut être partagé.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Le lien donne accès en lecture seule aux étapes. Vous pouvez le révoquer à tout moment. Seul le mode de transport accompagne les étapes : vos notes, visites, budget, besoins (accessibilité, régimes) et la composition du groupe ne sont jamais partagés.</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--coral)]" checked={includeDate} onChange={(e) => setIncludeDate(e.target.checked)} />
            <span>
              Montrer la date prévue
              <span className="block text-xs text-ink-3">Désactivé par défaut : une date future indique quand vous serez absent·e.</span>
            </span>
          </label>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await fetch("/api/partages", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ excursionId, includeDate }),
              }).catch(() => null);
              setBusy(false);
              const body = (await res?.json().catch(() => null)) as { path?: string; message?: string } | null;
              if (!res?.ok || !body?.path) return toast(body?.message ?? "Création du lien impossible.", "error");
              await navigator.clipboard?.writeText(`${origin}${body.path}`).catch(() => undefined);
              toast("Lien créé (copié dans le presse-papiers si autorisé).", "success");
              setVersion((v) => v + 1);
            }}
          >
            <Link2 size={18} aria-hidden="true" /> Créer un lien de partage
          </button>
          <ul className="space-y-2">
            {shares.map((s) => (
              <li key={s.token} className={`rounded-2xl border border-line p-3 text-sm ${s.revoked_at ? "opacity-60" : ""}`}>
                <p className="break-all font-mono text-xs">{`${origin}/partage/${s.token}`}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {s.revoked_at ? "Révoqué" : "Actif"} · {s.include_date ? "avec date" : "sans date"}
                </p>
                {!s.revoked_at ? (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void navigator.clipboard?.writeText(`${origin}/partage/${s.token}`)}>
                      <Copy size={14} aria-hidden="true" /> Copier
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost min-h-9 px-3 text-xs text-danger-ink"
                      onClick={async () => {
                        const res = await fetch(`/api/partages/${s.token}`, { method: "DELETE", credentials: "same-origin" }).catch(() => null);
                        if (res?.ok) {
                          toast("Lien révoqué.", "success");
                          setVersion((v) => v + 1);
                        } else toast("Révocation impossible.", "error");
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Révoquer
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
