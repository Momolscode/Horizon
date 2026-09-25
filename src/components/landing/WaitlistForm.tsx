"use client";

import { useState } from "react";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "ok" } | { kind: "error"; message: string };

const ERRORS: Record<string, string> = {
  storage_unavailable: "Enregistrement indisponible sur cette installation : aucun stockage n'est configuré. Votre adresse n'a PAS été enregistrée.",
  storage_error: "Le stockage n'a pas répondu. Votre adresse n'a pas été enregistrée ; réessayez plus tard.",
  rate_limited: "Trop de tentatives. Réessayez dans quelques minutes.",
  invalid: "Vérifiez l'adresse e-mail et cochez le consentement.",
};

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus({ kind: "sending" });
        try {
          const res = await fetch("/api/waitlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, consent, website, source: "landing" }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (res.ok && data.ok) setStatus({ kind: "ok" });
          else setStatus({ kind: "error", message: ERRORS[data.error ?? ""] ?? "Une erreur est survenue. Votre adresse n'a pas été enregistrée." });
        } catch {
          setStatus({ kind: "error", message: "Connexion impossible. Votre adresse n'a pas été enregistrée." });
        }
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Adresse e-mail
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          className="field min-h-12 flex-1"
          placeholder="vous@exemple.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-primary min-h-12" disabled={status.kind === "sending" || !consent}>
          {status.kind === "sending" ? "Envoi…" : "Rejoindre la liste"}
        </button>
      </div>
      {/* Champ piège, invisible pour les humains */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Site web
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--coral)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        J&apos;accepte que mon adresse soit utilisée uniquement pour être informé·e du lancement de HORIZON. Désinscription sur simple demande.
      </label>
      <p role="status" aria-live="polite" className={status.kind === "error" ? "text-sm font-semibold text-danger-ink" : "text-sm font-semibold text-green-ink"}>
        {status.kind === "ok" ? "Merci ! Votre demande est enregistrée." : status.kind === "error" ? status.message : ""}
      </p>
    </form>
  );
}
