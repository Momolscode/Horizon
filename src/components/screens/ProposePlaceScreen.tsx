"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Crosshair, MapPinPlus, TriangleAlert } from "lucide-react";
import { CATEGORIES, RESTAURANT_STYLES, RESTAURANT_STYLE_LABELS, type RestaurantStyle } from "@/modules/catalog/categories";
import { destinationForPoint, PRICE_CHOICES, PROPOSABLE_CATEGORIES, type PriceChoice, type Proposal, type ProposableCategory } from "@/modules/catalog/contributions";
import type { LatLng } from "@/modules/catalog/schema";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHorizon } from "../providers/HorizonProvider";
import { CategoryIcon } from "../CategoryIcon";

const PointPicker = dynamic(() => import("../contrib/PointPicker").then((m) => m.PointPicker), {
  ssr: false,
  loading: () => <div className="skeleton h-64 w-full rounded-2xl" aria-hidden="true" />,
});

type Duplicate = { id: string | null; name: string; distanceM: number; pending: boolean };

/**
 * Proposer un lieu (restaurant, commerce, activité, loisir) dans une destination couverte.
 * La fiche n'est publiée qu'après modération, marquée « proposée par un membre, non vérifiée ».
 */
export function ProposePlaceScreen() {
  const { catalog, status, requiresAccount } = useHorizon();
  const destinations = catalog.catalog.destinations;
  const [destinationId, setDestinationId] = useState(destinations[0]!.id);
  const destination = catalog.destinationsById.get(destinationId)!;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProposableCategory>("restaurant");
  const [restaurantStyle, setRestaurantStyle] = useState<RestaurantStyle>("bistrot");
  const [summary, setSummary] = useState("");
  const [website, setWebsite] = useState("");
  const [price, setPrice] = useState<PriceChoice>("unknown");
  const [point, setPoint] = useState<LatLng | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const geo = useGeolocation();
  const existing = useMemo(() => catalog.catalog.places.filter((p) => p.destinationId === destinationId).map((p) => p.location), [catalog.catalog.places, destinationId]);
  const outside = point !== null && destinationForPoint(catalog.catalog, point)?.id !== destinationId;

  if (status.kind === "demo" || requiresAccount) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <p className="eyebrow">Référencement</p>
        <h1 className="text-3xl font-semibold">Proposer un lieu</h1>
        <p className="mt-3 text-ink-2">
          {status.kind === "demo"
            ? "Indisponible en démonstration : avec un compte, vous pourrez proposer un restaurant, un commerce ou une activité. Chaque proposition est publiée après modération et reste marquée « non vérifiée »."
            : "Connectez-vous pour proposer un lieu."}
        </p>
        {status.kind !== "demo" ? (
          <Link href="/connexion" className="btn btn-primary mt-4">
            Se connecter
          </Link>
        ) : null}
      </div>
    );
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <MapPinPlus className="mx-auto mb-2 text-green-ink" size={36} aria-hidden="true" />
        <h1 className="text-3xl font-semibold">Merci pour votre proposition</h1>
        <p className="mt-2 text-ink-2">Elle sera publiée après modération, marquée « proposée par un membre, non vérifiée ». Vous suivez son état dans vos contributions.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/contributions" className="btn btn-primary">
            Mes contributions
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => (setSent(false), setName(""), setSummary(""), setWebsite(""), setPoint(null), setDuplicates(null))}>
            Proposer un autre lieu
          </button>
        </div>
      </div>
    );
  }

  const submit = async (confirmNotDuplicate: boolean) => {
    if (!point) {
      setError("Placez le lieu sur la carte, ou utilisez votre position.");
      return;
    }
    setSending(true);
    setError(null);
    const proposal: Proposal = {
      destinationId,
      name: name.trim(),
      category,
      location: point,
      summary: summary.trim(),
      website: website.trim() || null,
      price,
      restaurantStyle: category === "restaurant" ? restaurantStyle : null,
    };
    const res = await fetch("/api/propositions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposal, confirmNotDuplicate }),
    }).catch(() => null);
    setSending(false);
    const data = (await res?.json().catch(() => ({}))) as { message?: string; duplicates?: Duplicate[] } | undefined;
    if (res?.ok) {
      setSent(true);
      return;
    }
    if (res?.status === 409 && data?.duplicates) {
      setDuplicates(data.duplicates);
      return;
    }
    setError(data?.message ?? "Envoi impossible pour le moment. Réessayez.");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6">
      <Link href="/decouvrir" className="mb-2 inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft size={18} aria-hidden="true" /> Découvrir
      </Link>
      <p className="eyebrow">Référencement</p>
      <h1 className="text-4xl font-semibold">Proposer un lieu</h1>
      <p className="mt-2 text-ink-2">Un restaurant, un commerce, une activité de plein air ou un loisir que vous connaissez. Publication après modération ; la fiche reste « non vérifiée ».</p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <label className="block font-bold">
          Destination
          <select
            className="field mt-1"
            value={destinationId}
            onChange={(e) => {
              setDestinationId(e.target.value);
              setPoint(null);
              setDuplicates(null);
            }}
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block font-bold">
          Nom du lieu
          <input className="field mt-1" value={name} minLength={2} maxLength={120} required onChange={(e) => (setName(e.target.value), setDuplicates(null))} />
        </label>

        <fieldset>
          <legend className="mb-2 font-bold">Catégorie</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {PROPOSABLE_CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} className="chip" onClick={() => setCategory(c)}>
                <CategoryIcon category={c} size={15} /> {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        </fieldset>

        {category === "restaurant" ? (
          <label className="block font-bold">
            Type de cuisine
            <select className="field mt-1" value={restaurantStyle} onChange={(e) => setRestaurantStyle(e.target.value as RestaurantStyle)}>
              {RESTAURANT_STYLES.map((s) => (
                <option key={s} value={s}>
                  {RESTAURANT_STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block font-bold">
          En quelques mots
          <textarea className="field mt-1 min-h-20 py-2" value={summary} minLength={10} maxLength={220} required onChange={(e) => setSummary(e.target.value)} />
          <span className="text-xs font-normal text-ink-3">{summary.trim().length}/220 · ce que l&apos;on y trouve, sans publicité.</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block font-bold">
            Site web (facultatif)
            <input className="field mt-1" type="url" inputMode="url" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          <label className="block font-bold">
            Prix par personne
            <select className="field mt-1" value={price} onChange={(e) => setPrice(e.target.value as PriceChoice)}>
              {(Object.keys(PRICE_CHOICES) as PriceChoice[]).map((k) => (
                <option key={k} value={k}>
                  {PRICE_CHOICES[k].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="font-bold">Emplacement</legend>
          <p className="text-sm text-ink-2">Touchez la carte à l&apos;emplacement du lieu. Le fond est simplifié (pas de rues) : le point sera indiqué comme approximatif. Les petits points gris sont les lieux déjà présents.</p>
          <PointPicker destination={destination} existing={existing} value={point} onChange={(p) => (setPoint(p), setDuplicates(null))} />
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              className="btn btn-ghost min-h-10"
              onClick={async () => {
                const fix = await geo.locate();
                if (fix) {
                  setPoint({ lat: Math.round(fix.lat * 1e5) / 1e5, lng: Math.round(fix.lng * 1e5) / 1e5 });
                  setDuplicates(null);
                }
              }}
            >
              <Crosshair size={16} aria-hidden="true" /> Utiliser ma position
            </button>
            <label className="text-sm font-bold">
              Latitude
              <input className="field mt-1 w-32" inputMode="decimal" value={point?.lat ?? ""} onChange={(e) => setPoint({ lat: Number(e.target.value), lng: point?.lng ?? destination.center.lng })} />
            </label>
            <label className="text-sm font-bold">
              Longitude
              <input className="field mt-1 w-32" inputMode="decimal" value={point?.lng ?? ""} onChange={(e) => setPoint({ lat: point?.lat ?? destination.center.lat, lng: Number(e.target.value) })} />
            </label>
          </div>
          {geo.state.status === "error" ? <p className="text-sm text-ink-3">{geo.state.message}</p> : null}
          {outside ? <p className="text-sm font-semibold text-danger-ink">Ce point est en dehors de {destination.name} : seules les destinations couvertes acceptent des propositions.</p> : null}
        </fieldset>

        {duplicates ? (
          <div role="status" className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">
            <p className="flex items-center gap-2 font-bold">
              <TriangleAlert size={16} aria-hidden="true" /> Ce lieu existe peut-être déjà
            </p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.map((d) => (
                <li key={`${d.name}-${d.distanceM}`}>
                  {d.id ? (
                    <Link href={`/lieux/${d.id}`} className="underline">
                      {d.name}
                    </Link>
                  ) : (
                    d.name
                  )}{" "}
                  · à {d.distanceM} m{d.pending ? " · proposition en attente de modération" : ""}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost mt-2 min-h-10" disabled={sending} onClick={() => void submit(true)}>
              C&apos;est un autre lieu : envoyer quand même
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={sending || outside}>
          <MapPinPlus size={18} aria-hidden="true" /> {sending ? "Envoi…" : "Envoyer la proposition"}
        </button>
        <p className="text-xs text-ink-3">Votre pseudonyme n&apos;est pas affiché sur la fiche. Les informations proposées restent « non vérifiées » tant que l&apos;établissement ne les a pas complétées.</p>
      </form>
    </div>
  );
}
