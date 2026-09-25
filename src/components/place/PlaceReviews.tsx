"use client";

import { useEffect, useState } from "react";
import { Flag, MessageSquare, Star } from "lucide-react";
import { DEMO_REVIEWS } from "@/modules/community/demo-community";
import { useHorizon } from "../providers/HorizonProvider";
import { useAuth } from "../connected/AuthContext";

type PublishedReview = { id: string; rating: number; body: string; created_at: string; author: string; mine: boolean };
type OwnReview = { id: string; rating: number; body: string; status: "pending" | "published" | "rejected"; rejection_reason: string | null };

function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-sand" role="img" aria-label={label ?? `${value} sur 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={14} aria-hidden="true" fill={i < value ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

/**
 * Avis : en démonstration, avis fictifs clairement étiquetés ; en mode connecté, avis
 * publiés après modération. Aucune récompense n'est liée au fait de laisser un avis.
 */
export function PlaceReviews({ placeId }: { placeId: string }) {
  const { status, requiresAccount, toast } = useHorizon();
  const auth = useAuth();
  const [published, setPublished] = useState<PublishedReview[] | null>(null);
  const [own, setOwn] = useState<OwnReview | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (status.kind !== "connected" || !auth) return;
    let cancelled = false;
    void Promise.all([
      auth.supabase.rpc("published_reviews", { target_place: placeId }),
      auth.user ? auth.supabase.from("reviews").select("id, rating, body, status, rejection_reason").eq("place_id", placeId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([pub, mine]) => {
      if (cancelled) return;
      setPublished(((pub as { data: PublishedReview[] | null }).data ?? []) as PublishedReview[]);
      setOwn(((mine as { data: OwnReview | null }).data ?? null) as OwnReview | null);
    });
    return () => {
      cancelled = true;
    };
  }, [status.kind, auth, placeId, version]);

  if (status.kind === "demo") {
    const reviews = DEMO_REVIEWS.filter((r) => r.placeId === placeId);
    return (
      <section aria-labelledby={`reviews-${placeId}`}>
        <h2 id={`reviews-${placeId}`} className="mb-2 flex items-center gap-2 text-xl font-semibold">
          <MessageSquare size={20} aria-hidden="true" /> Avis
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-ink-3">Aucun avis de démonstration pour ce lieu.</p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {r.author} <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn-ink">Avis fictif</span> <Stars value={r.rating} />
                </p>
                <p className="mt-1 text-ink-2">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-3">En démonstration, les avis sont fictifs et vous ne pouvez pas en publier.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`reviews-${placeId}`}>
      <h2 id={`reviews-${placeId}`} className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <MessageSquare size={20} aria-hidden="true" /> Avis
      </h2>
      {published === null ? (
        <p className="text-sm text-ink-3">Chargement…</p>
      ) : published.length === 0 ? (
        <p className="text-sm text-ink-3">Aucun avis publié pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {published.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                {r.author} <Stars value={r.rating} />
              </p>
              <p className="mt-1 text-ink-2">{r.body}</p>
              {!r.mine && auth?.user ? (
                <button
                  type="button"
                  className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-ink-3 hover:text-coral-ink"
                  onClick={async () => {
                    const { error } = await auth.supabase.from("review_reports").insert({ review_id: r.id, reason: "Contenu inapproprié" });
                    toast(error ? "Signalement impossible (déjà signalé ?)." : "Avis signalé à la modération.", error ? "error" : "success");
                  }}
                >
                  <Flag size={13} aria-hidden="true" /> Signaler
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {requiresAccount ? (
        <p className="mt-3 text-sm text-ink-3">Connectez-vous pour laisser un avis.</p>
      ) : own ? (
        <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Votre avis : <Stars value={own.rating} /> —{" "}
          {own.status === "pending" ? "en attente de modération." : own.status === "published" ? "publié." : `refusé (${own.rejection_reason ?? "non conforme"}).`}
        </p>
      ) : (
        <form
          className="mt-3 space-y-2 rounded-2xl border border-line p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!auth) return;
            const { error } = await auth.supabase.from("reviews").insert({ place_id: placeId, rating, body: body.trim() });
            if (error) toast("Envoi impossible : vérifiez la longueur de votre avis (10 à 1 000 caractères).", "error");
            else {
              toast("Merci ! Votre avis sera publié après modération.", "success");
              setBody("");
              setVersion((v) => v + 1);
            }
          }}
        >
          <fieldset>
            <legend className="text-sm font-bold">Votre note</legend>
            <div className="mt-1 flex gap-1" role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} sur 5`} className="grid h-11 w-11 place-items-center rounded-full text-sand hover:bg-surface-2" onClick={() => setRating(n)}>
                  <Star size={20} aria-hidden="true" fill={n <= rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-bold">
            Votre avis
            <textarea className="field mt-1 min-h-20 py-2" minLength={10} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          <p className="text-xs text-ink-3">Publié après modération, avec votre pseudonyme. Aucune récompense n&apos;est liée aux avis.</p>
          <button type="submit" className="btn btn-primary">
            Envoyer
          </button>
        </form>
      )}
    </section>
  );
}
