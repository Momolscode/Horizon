"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, UserMinus, UserPlus, X } from "lucide-react";
import { levelForXp } from "@/modules/progression/config";
import { computeStats, totals } from "@/modules/progression/engine";
import { useHorizon } from "../providers/HorizonProvider";

type Pending = { id: string; pseudonym: string; created_at: string };
type Friend = { id: string; pseudonym: string; visibility: string; xp: number | null; places_visited: number | null; parcels: number | null };
type Overview = { incoming: Pending[]; outgoing: Pending[]; friends: Friend[]; blocked: string[] };

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { message?: string };
  return { ok: Boolean(res?.ok), status: res?.status ?? 0, message: data?.message };
}

/** Amis réels : demandes par pseudonyme, acceptation/refus, blocage. */
export function ConnectedCommunity() {
  const { toast, requiresAccount, state, catalog } = useHorizon();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [version, setVersion] = useState(0);
  const [pseudonym, setPseudonym] = useState("");
  const [compare, setCompare] = useState(false);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (requiresAccount) return;
    let cancelled = false;
    void fetch("/api/amis", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Overview | null) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requiresAccount, version]);

  if (requiresAccount) return <p className="card p-5 text-ink-2">Connectez-vous pour ajouter des amis.</p>;
  const mine = computeStats(state.progression, catalog.catalog);
  const myLevel = levelForXp(totals(state.progression).xp).current.level;

  const act = async (path: string, method: string, body: unknown, success: string) => {
    const r = await call(path, method, body);
    toast(r.ok ? success : (r.message ?? "Action impossible."), r.ok ? "success" : "error");
    refresh();
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="add-friend-c" className="card p-5">
        <h2 id="add-friend-c" className="flex items-center gap-2 text-xl font-semibold">
          <UserPlus size={20} aria-hidden="true" /> Ajouter un ami
        </h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await act("/api/amis", "POST", { pseudonym }, "Demande envoyée.");
            setPseudonym("");
          }}
        >
          <label className="sr-only" htmlFor="friend-pseudonym">
            Pseudonyme
          </label>
          <input id="friend-pseudonym" className="field" placeholder="Pseudonyme exact" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} minLength={2} maxLength={32} required />
          <button type="submit" className="btn btn-primary">
            Inviter
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-3">La personne accepte ou refuse. Votre pseudonyme lui est visible ; votre historique reste privé sauf si vous le partagez avec vos amis.</p>
      </section>

      {overview?.incoming.length ? (
        <section aria-labelledby="incoming">
          <h2 id="incoming" className="text-xl font-semibold">
            Demandes reçues
          </h2>
          <ul className="mt-2 space-y-2">
            {overview.incoming.map((r) => (
              <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="font-bold">{r.pseudonym}</span>
                <span className="flex gap-2">
                  <button type="button" className="btn btn-explore min-h-10 px-3 text-sm" onClick={() => void act(`/api/amis/${r.id}`, "PATCH", { action: "accept" }, "Demande acceptée.")}>
                    <Check size={16} aria-hidden="true" /> Accepter
                  </button>
                  <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => void act(`/api/amis/${r.id}`, "PATCH", { action: "decline" }, "Demande refusée.")}>
                    <X size={16} aria-hidden="true" /> Refuser
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="friends-c">
        <div className="flex items-center justify-between">
          <h2 id="friends-c" className="text-2xl font-semibold">
            Amis
          </h2>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-[var(--coral)]" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Comparer
          </label>
        </div>
        {!overview ? (
          <p className="mt-2 text-ink-3">Chargement…</p>
        ) : overview.friends.length === 0 ? (
          <p className="mt-2 text-ink-2">Aucun ami pour l&apos;instant.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {overview.friends.map((f) => (
              <li key={f.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{f.pseudonym}</p>
                    <p className="text-sm text-ink-3">
                      {f.xp === null ? "Profil privé" : `Niveau ${levelForXp(f.xp).current.level} · ${f.places_visited} lieux · ${f.parcels} parcelles`}
                    </p>
                  </div>
                  <span className="flex gap-1">
                    <button type="button" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2" aria-label={`Retirer ${f.pseudonym}`} onClick={() => void act(`/api/amis/${f.id}`, "DELETE", undefined, "Ami retiré.")}>
                      <UserMinus size={17} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2"
                      aria-label={`Bloquer ${f.pseudonym}`}
                      onClick={() => void act("/api/blocages", "POST", { pseudonym: f.pseudonym, action: "block" }, "Personne bloquée.")}
                    >
                      <Ban size={17} aria-hidden="true" />
                    </button>
                  </span>
                </div>
                {compare && f.xp !== null ? (
                  <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
                    Vous : niveau {myLevel}, {mine.distinctPlacesVisited} lieux, {mine.parcels} parcelles.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview?.outgoing.length ? (
        <section aria-labelledby="outgoing">
          <h2 id="outgoing" className="text-xl font-semibold">
            Demandes envoyées
          </h2>
          <ul className="mt-2 space-y-2">
            {overview.outgoing.map((r) => (
              <li key={r.id} className="card flex items-center justify-between p-3">
                <span>{r.pseudonym}</span>
                <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => void act(`/api/amis/${r.id}`, "DELETE", undefined, "Demande annulée.")}>
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview?.blocked.length ? (
        <section aria-labelledby="blocked">
          <h2 id="blocked" className="text-xl font-semibold">
            Personnes bloquées
          </h2>
          <ul className="mt-2 space-y-2">
            {overview.blocked.map((p) => (
              <li key={p} className="card flex items-center justify-between p-3">
                <span>{p}</span>
                <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => void act("/api/blocages", "POST", { pseudonym: p, action: "unblock" }, "Personne débloquée.")}>
                  Débloquer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
