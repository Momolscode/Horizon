"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, MapPinPlus, MessageSquareReply, Store } from "lucide-react";
import { PRICE_CHOICES, weeklyFromSimple, type PriceChoice } from "@/modules/catalog/contributions";
import { WEEKDAYS, type Place } from "@/modules/catalog/schema";
import { useHorizon } from "../providers/HorizonProvider";

type Contributions = {
  proposals: Array<{ id: string; name: string; status: "pending" | "approved" | "rejected"; place_id: string | null; rejection_reason: string | null; created_at: string }>;
  claims: Array<{ id: string; place_id: string; place_name: string; status: "pending" | "approved" | "rejected"; rejection_reason: string | null }>;
  managedPlaceIds: string[];
};
type ManagedReview = { id: string; rating: number; body: string; created_at: string; pseudonym: string; reply_body: string | null; reply_status: "pending" | "published" | "rejected" | null; reply_rejection: string | null };

const DAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = { mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi", fri: "Vendredi", sat: "Samedi", sun: "Dimanche" };

async function send(path: string, method: "POST" | "PATCH", body: unknown) {
  const res = await fetch(path, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
  return { ok: Boolean(res?.ok), message: data?.message };
}

function priceChoiceOf(place: Place): PriceChoice {
  const p = place.practical.price;
  if (p.status === "unknown") return "unknown";
  if (p.value.kind === "free") return "free";
  const { minPerPerson, maxPerPerson } = p.value;
  const match = (Object.keys(PRICE_CHOICES) as PriceChoice[]).find((k) => {
    const r = PRICE_CHOICES[k].range;
    return r !== null && r[0] === minPerPerson && r[1] === maxPerPerson;
  });
  return match ?? "unknown";
}

function EstablishmentForm({ place }: { place: Place }) {
  const { toast } = useHorizon();
  const initialHours = place.practical.openingHours.status !== "unknown" ? place.practical.openingHours.value.weekly : null;
  const [website, setWebsite] = useState(place.practical.website.status !== "unknown" ? place.practical.website.value : "");
  const [price, setPrice] = useState<PriceChoice>(priceChoiceOf(place));
  const [booking, setBooking] = useState<"none" | "recommended" | "required" | "unknown">(place.practical.booking.status !== "unknown" ? place.practical.booking.value.mode : "unknown");
  const [shareHours, setShareHours] = useState(initialHours !== null);
  const [days, setDays] = useState(() =>
    Object.fromEntries(WEEKDAYS.map((d) => [d, initialHours?.[d]?.[0] ? { open: initialHours[d]![0]![0], close: initialHours[d]![0]![1] } : null])) as Record<(typeof WEEKDAYS)[number], { open: string; close: string } | null>,
  );
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const r = await send(`/api/pro/lieux/${place.id}`, "PATCH", {
          website: website.trim() || null,
          price,
          bookingMode: booking,
          openingHours: shareHours ? weeklyFromSimple(days) : null,
        });
        setSaving(false);
        toast(r.ok ? "Informations enregistrées : visibles sur la fiche après rechargement, avec la mention « fourni par l'établissement »." : (r.message ?? "Enregistrement impossible."), r.ok ? "success" : "error");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-bold sm:col-span-3">
          Site web
          <input className="field mt-1" type="url" value={website} placeholder="https://…" onChange={(e) => setWebsite(e.target.value)} />
        </label>
        <label className="text-sm font-bold">
          Prix par personne
          <select className="field mt-1" value={price} onChange={(e) => setPrice(e.target.value as PriceChoice)}>
            {(Object.keys(PRICE_CHOICES) as PriceChoice[]).map((k) => (
              <option key={k} value={k}>
                {k === "unknown" ? "Non communiqué" : PRICE_CHOICES[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Réservation
          <select className="field mt-1" value={booking} onChange={(e) => setBooking(e.target.value as typeof booking)}>
            <option value="unknown">Non communiqué</option>
            <option value="none">Sans réservation</option>
            <option value="recommended">Conseillée</option>
            <option value="required">Obligatoire</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" className="h-5 w-5 accent-[var(--coral)]" checked={shareHours} onChange={(e) => setShareHours(e.target.checked)} />
        Communiquer mes horaires (une plage par jour)
      </label>
      {shareHours ? (
        <div className="grid gap-2">
          {WEEKDAYS.map((d) => {
            const day = days[d];
            return (
              <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 font-bold">{DAY_LABELS[d]}</span>
                <label className="flex items-center gap-1">
                  <input type="checkbox" className="h-4 w-4" checked={day === null} onChange={(e) => setDays({ ...days, [d]: e.target.checked ? null : { open: "09:00", close: "18:00" } })} />
                  Fermé
                </label>
                {day ? (
                  <>
                    <input type="time" aria-label={`${DAY_LABELS[d]} : ouverture`} className="field w-28" value={day.open} onChange={(e) => setDays({ ...days, [d]: { ...day, open: e.target.value } })} />
                    <span aria-hidden="true">–</span>
                    <input type="time" aria-label={`${DAY_LABELS[d]} : fermeture`} className="field w-28" value={day.close} onChange={(e) => setDays({ ...days, [d]: { ...day, close: e.target.value } })} />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="text-xs text-ink-3">Ces informations sont affichées « fournies par l&apos;établissement », datées, et ne sont pas vérifiées par HORIZON. « Non communiqué » les affiche comme inconnues.</p>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer les informations"}
      </button>
    </form>
  );
}

function ManagedReviews({ placeId }: { placeId: string }) {
  const { toast } = useHorizon();
  const [reviews, setReviews] = useState<ManagedReview[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/pro/lieux/${placeId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d: { reviews: ManagedReview[] }) => {
        if (!cancelled) setReviews(d.reviews);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [placeId, version]);

  if (reviews === null) return <p className="text-sm text-ink-3">Chargement des avis…</p>;
  if (reviews.length === 0) return <p className="text-sm text-ink-3">Aucun avis publié pour l&apos;instant.</p>;
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line p-3 text-sm">
          <p className="font-bold">
            {r.pseudonym} · {"★".repeat(r.rating)}
          </p>
          <p className="text-ink-2">{r.body}</p>
          {r.reply_body ? (
            <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-ink-2">
              <span className="font-bold">Votre réponse</span> ({r.reply_status === "published" ? "publiée" : r.reply_status === "pending" ? "en attente de modération" : `refusée : ${r.reply_rejection ?? "non conforme"}`}) : {r.reply_body}
            </p>
          ) : null}
          <form
            className="mt-2 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = (drafts[r.id] ?? "").trim();
              const res = await send("/api/pro/reponses", "POST", { reviewId: r.id, body });
              toast(res.ok ? "Réponse envoyée : publiée après modération." : (res.message ?? "Envoi impossible."), res.ok ? "success" : "error");
              if (res.ok) {
                setDrafts({ ...drafts, [r.id]: "" });
                setVersion((v) => v + 1);
              }
            }}
          >
            <label className="block font-bold">
              {r.reply_body ? "Modifier la réponse" : "Répondre publiquement"}
              <textarea className="field mt-1 min-h-16 py-2" minLength={2} maxLength={1000} required value={drafts[r.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-ghost min-h-10">
              <MessageSquareReply size={16} aria-hidden="true" /> Envoyer la réponse
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** Espace contributeur et établissement : propositions, revendications, fiches gérées. */
export function ContributionsScreen() {
  const { catalog, status, requiresAccount } = useHorizon();
  const [data, setData] = useState<Contributions | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (status.kind !== "connected" || requiresAccount) return;
    let cancelled = false;
    void fetch("/api/contributions", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Contributions | null) => {
        if (!cancelled) setData(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status.kind, requiresAccount, version]);

  if (status.kind === "demo" || requiresAccount) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Mes contributions</h1>
        <p className="mt-3 text-ink-2">
          {status.kind === "demo" ? "Indisponible en démonstration : propositions de lieux et gestion de fiche par un établissement nécessitent un compte." : "Connectez-vous pour suivre vos contributions."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-12 pt-6">
      <header>
        <p className="eyebrow">Référencement</p>
        <h1 className="text-4xl font-semibold">Mes contributions</h1>
        <p className="mt-2 text-ink-2">Vos propositions de lieux, vos demandes de gestion de fiche et les fiches de votre établissement. Aucune de ces fonctions n&apos;est payante.</p>
        <Link href="/lieux/proposer" className="btn btn-primary mt-4">
          <MapPinPlus size={18} aria-hidden="true" /> Proposer un lieu
        </Link>
      </header>

      <section aria-labelledby="my-proposals">
        <h2 id="my-proposals" className="mb-2 text-2xl font-semibold">
          Propositions
        </h2>
        {!data ? (
          <p className="text-ink-3">Chargement…</p>
        ) : data.proposals.length === 0 ? (
          <p className="text-ink-2">Aucune proposition pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {data.proposals.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-bold">{p.name}</span>
                <span className="text-ink-2">
                  {p.status === "pending" ? "En attente de modération" : p.status === "approved" && p.place_id ? <Link href={`/lieux/${p.place_id}`} className="font-bold text-green-ink underline">Publiée</Link> : `Refusée : ${p.rejection_reason ?? "non retenue"}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-claims">
        <h2 id="my-claims" className="mb-2 flex items-center gap-2 text-2xl font-semibold">
          <Store size={22} aria-hidden="true" /> Gestion de fiche
        </h2>
        <p className="mb-2 text-sm text-ink-3">Pour gérer la fiche de votre établissement, ouvrez-la et choisissez « C&apos;est votre établissement ? ». Un administrateur vérifie le SIRET et votre preuve.</p>
        {data && data.claims.length > 0 ? (
          <ul className="space-y-2">
            {data.claims.map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <Link href={`/lieux/${c.place_id}`} className="font-bold underline">
                  {c.place_name}
                </Link>
                <span className="text-ink-2">{c.status === "pending" ? "Vérification en cours" : c.status === "approved" ? "Validée : vous gérez cette fiche" : `Refusée : ${c.rejection_reason ?? "justificatif insuffisant"}`}</span>
              </li>
            ))}
          </ul>
        ) : data ? (
          <p className="text-ink-2">Aucune demande.</p>
        ) : null}
      </section>

      {data?.managedPlaceIds.map((id) => {
        const place = catalog.placesById.get(id);
        if (!place) return null;
        return (
          <section key={id} aria-labelledby={`managed-${id}`} className="card space-y-5 p-5">
            <h2 id={`managed-${id}`} className="flex items-center gap-2 text-2xl font-semibold">
              <BadgeCheck size={22} aria-hidden="true" className="text-green-ink" /> {place.name}
            </h2>
            <div>
              <h3 className="mb-2 font-bold">Informations pratiques</h3>
              <EstablishmentForm place={place} />
            </div>
            <div>
              <h3 className="mb-2 font-bold">Avis et réponses</h3>
              <p className="mb-2 text-xs text-ink-3">Vous pouvez répondre gratuitement à chaque avis ; la réponse est publiée après modération. Vous ne pouvez ni modifier, ni supprimer, ni noter les avis de votre établissement.</p>
              <ManagedReviews placeId={id} />
            </div>
          </section>
        );
      })}
      {data ? (
        <button type="button" className="btn btn-ghost" onClick={refresh}>
          Actualiser
        </button>
      ) : null}
    </div>
  );
}
