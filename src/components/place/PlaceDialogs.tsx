"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, LocateFixed, Plus } from "lucide-react";
import type { Destination, Place } from "@/modules/catalog/schema";
import { externalNavigationLinks } from "@/adapters/navigation/links";
import { todayIn } from "@/modules/shared/time";
import { formatDistance, straightLineMeters } from "@/modules/shared/geo";
import { PROXIMITY, type VisitStatus } from "@/modules/progression/config";
import { useGeolocation } from "@/hooks/useGeolocation";
import { DEFAULT_VISIT_MINUTES } from "@/modules/excursions/schedule";
import { useHorizon } from "../providers/HorizonProvider";
import { Dialog } from "../shell/Dialog";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function VisitDialog({ place, destination, open, onClose }: { place: Place; destination: Destination; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Ajouter une visite au carnet">
      {/* Monté à chaque ouverture : nouvelle clé d'idempotence et formulaire vierge. */}
      {open ? <VisitForm place={place} destination={destination} onDone={onClose} /> : null}
    </Dialog>
  );
}

function VisitForm({ place, destination, onDone }: { place: Place; destination: Destination; onDone: () => void }) {
  const { actions, status, busy } = useHorizon();
  const geo = useGeolocation();
  // Clé stable pendant les clics répétés : un double envoi ne crédite qu'une fois.
  const [idempotencyKey] = useState(newKey);
  const [mode, setMode] = useState<VisitStatus>("declared");
  const today = todayIn(destination.timezone);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let position = null;
      if (mode === "proximity_checked") {
        position = await geo.locate();
        if (!position) return; // l'utilisateur choisit alors de déclarer sans contrôle
      }
      const outcome = await actions.declareVisit({ placeId: place.id, requestedStatus: mode, visitedOn: date, idempotencyKey, position, note: note || null });
      if (outcome) onDone();
    } finally {
      setSubmitting(false);
    }
  };

  const options: Array<{ id: VisitStatus; title: string; text: string }> = [
    { id: "declared", title: "Je déclare ma visite", text: "Inscrite au carnet, révèle la parcelle. Aucune vérification : c'est votre parole." },
    {
      id: "proximity_checked",
      title: "Contrôler ma position maintenant",
      text: `Position ponctuelle demandée une seule fois. Seules la distance et la précision sont conservées, pas vos coordonnées. Contrôle limité (précision ≤ ${PROXIMITY.maxAccuracyM} m), pas une preuve de présence.`,
    },
  ];
  if (status.kind === "demo") {
    options.push({ id: "simulated", title: "Simuler une visite (présentation)", text: "Pour une démonstration : révèle la parcelle, marquée « simulée », sans XP ni statistique réelle." });
  }

  return (
    <>
      <p className="mb-4 text-sm text-ink-2">
        <strong className="text-ink">{place.name}</strong> — {destination.name}
      </p>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">Type de visite</legend>
        {options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${mode === o.id ? "border-green bg-green-soft" : "border-line"}`}>
            <input type="radio" name="visit-mode" value={o.id} checked={mode === o.id} onChange={() => setMode(o.id)} className="mt-1 h-5 w-5 accent-[var(--green)]" />
            <span>
              <span className="block font-bold">{o.title}</span>
              <span className="block text-sm text-ink-2">{o.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {geo.state.status === "error" ? (
        <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink" role="alert">
          {geo.state.message} Vous pouvez déclarer la visite sans contrôle.
        </p>
      ) : null}
      {geo.state.status === "locating" ? (
        <p className="mt-3 text-sm text-ink-2" role="status">
          Localisation en cours…
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Date de la visite (heure de {destination.name})
          <input type="date" className="field mt-1" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="mt-3 block text-sm font-bold">
        Souvenir privé (facultatif)
        <textarea className="field mt-1 min-h-20 py-2" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce que vous voulez retenir de ce moment…" />
      </label>
      <p className="mt-1 text-xs text-ink-3">Visible par vous seul{status.kind === "demo" ? " — conservé dans ce navigateur" : ""}.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Annuler
        </button>
        <button type="button" className="btn btn-explore" onClick={() => void submit()} disabled={submitting || busy || date > today}>
          {mode === "proximity_checked" ? <LocateFixed size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          {submitting ? "Enregistrement…" : mode === "proximity_checked" ? "Contrôler et enregistrer" : "Enregistrer la visite"}
        </button>
      </div>
    </>
  );
}

export function SaveDialog({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const { state, actions } = useHorizon();
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Enregistrer dans une collection" size="sm">
      <ul className="space-y-2">
        {state.collections.map((c) => {
          const checked = c.placeIds.includes(place.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => void actions.togglePlaceInCollection(c.id, place.id)}
                className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left font-semibold ${checked ? "border-coral bg-coral-soft" : "border-line"}`}
              >
                <span>
                  {c.name} <span className="text-sm font-normal text-ink-3">· {c.placeIds.length} lieu(x)</span>
                </span>
                {checked ? <Check aria-hidden="true" className="text-coral-ink" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await actions.createCollection(name)) setName("");
        }}
      >
        <label className="sr-only" htmlFor="new-collection">
          Nouvelle collection
        </label>
        <input id="new-collection" className="field" placeholder="Nouvelle collection" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button type="submit" className="btn btn-ghost" disabled={!name.trim()} aria-label="Créer la collection">
          <Plus size={18} aria-hidden="true" />
        </button>
      </form>
    </Dialog>
  );
}

export function AddToExcursionDialog({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const { state, actions, toast } = useHorizon();
  const router = useRouter();
  const candidates = state.excursions.filter((e) => e.destinationId === place.destinationId);
  return (
    <Dialog open={open} onClose={onClose} title="Ajouter à une excursion" size="sm">
      {candidates.length > 0 ? (
        <ul className="space-y-2">
          {candidates.map((e) => {
            const already = e.steps.some((s) => s.placeId === place.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={already || e.steps.length >= 12}
                  onClick={async () => {
                    const visitMinutes = place.practical.visitMinutes.status === "unknown" ? DEFAULT_VISIT_MINUTES : place.practical.visitMinutes.value;
                    const ok = await actions.saveExcursion({ ...e, steps: [...e.steps, { id: newKey(), placeId: place.id, visitMinutes, note: null }] });
                    if (ok) {
                      toast(`Ajouté à « ${e.title} ».`, "success");
                      onClose();
                    }
                  }}
                  className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-line px-4 text-left font-semibold disabled:opacity-60"
                >
                  <span>
                    {e.title}
                    <span className="block text-sm font-normal text-ink-3">
                      {e.steps.length} étape(s){already ? " · déjà présent" : ""}
                    </span>
                  </span>
                  <Plus aria-hidden="true" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-2">Aucune excursion enregistrée pour cette destination.</p>
      )}
      <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        onClick={() => {
          onClose();
          router.push(`/excursions/nouvelle?destination=${place.destinationId}&lieu=${place.id}`);
        }}
      >
        Nouvelle excursion avec ce lieu
      </button>
    </Dialog>
  );
}

export function NavigateDialog({ place, open, onClose, from }: { place: Place; open: boolean; onClose: () => void; from: { lat: number; lng: number } | null }) {
  const { state } = useHorizon();
  const links = externalNavigationLinks(place.location, place.name);
  return (
    <Dialog open={open} onClose={onClose} title="S'y rendre" size="sm">
      <p className="mb-3 text-sm text-ink-2">
        Ouvre une application de navigation externe avec la destination. HORIZON n&apos;intègre ni leur trafic ni leur guidage.
        {place.locationPrecision === "approximate" ? " Coordonnées approximatives (démonstration) : vérifiez l'adresse sur place." : ""}
      </p>
      {from ? <p className="mb-3 text-sm font-semibold">À {formatDistance(straightLineMeters(from, place.location), state.settings.units)} à vol d&apos;oiseau de votre position ponctuelle.</p> : null}
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.id}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between rounded-2xl border border-line px-4 font-semibold hover:border-line-strong">
              {l.label}
              <ExternalLink size={16} aria-hidden="true" />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function ReportDialog({ place, open, onClose }: { place: Place; open: boolean; onClose: () => void }) {
  const { actions, toast, status } = useHorizon();
  const [kind, setKind] = useState<"location" | "hours" | "price" | "closed" | "description" | "other">("other");
  const [message, setMessage] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Signaler une erreur"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={message.trim().length < 3}
            onClick={async () => {
              if (await actions.reportError({ placeId: place.id, kind, message: message.trim() })) {
                toast(status.kind === "demo" ? "Signalement conservé dans ce navigateur (démo : non transmis)." : "Signalement envoyé à la modération.", "success");
                setMessage("");
                onClose();
              }
            }}
          >
            Envoyer
          </button>
        </>
      }
    >
      <label className="block text-sm font-bold">
        Nature de l&apos;erreur
        <select className="field mt-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="location">Emplacement</option>
          <option value="hours">Horaires</option>
          <option value="price">Prix</option>
          <option value="closed">Lieu fermé définitivement</option>
          <option value="description">Description</option>
          <option value="other">Autre</option>
        </select>
      </label>
      <label className="mt-3 block text-sm font-bold">
        Détails
        <textarea className="field mt-1 min-h-24 py-2" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {status.kind === "demo" ? <p className="mt-2 text-xs text-ink-3">En démonstration, le signalement reste dans ce navigateur et n&apos;est transmis à personne.</p> : null}
    </Dialog>
  );
}
