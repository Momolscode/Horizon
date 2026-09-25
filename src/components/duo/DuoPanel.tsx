"use client";

import { useEffect, useState } from "react";
import { UserPlus, Users, X } from "lucide-react";
import { useHorizon } from "../providers/HorizonProvider";
import { formatRelative, type DuoOverview } from "./useDuo";

type Membership = DuoOverview["memberships"][number];
type Friend = { id: string; pseudonym: string };

/**
 * Mode Duo sur une excursion : inviter un ami, voir avec qui on la prépare, quitter ou
 * retirer l'invité. En démonstration, la fonction est présentée mais indisponible.
 */
export function DuoPanel({
  excursionId,
  membership,
  enabled,
  onChanged,
  call,
}: {
  excursionId: string;
  membership: Membership | null;
  enabled: boolean;
  onChanged: () => void;
  call: (path: string, method: "POST" | "PATCH", body: unknown) => Promise<{ ok: boolean; message?: string }>;
}) {
  const { toast, status } = useHorizon();
  const [choosing, setChoosing] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [friendshipId, setFriendshipId] = useState("");

  useEffect(() => {
    if (!choosing) return;
    let cancelled = false;
    void fetch("/api/amis", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { friends?: Friend[] } | null) => {
        if (!cancelled) setFriends(data?.friends ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [choosing]);

  const act = async (path: string, method: "POST" | "PATCH", body: unknown, success: string) => {
    const r = await call(path, method, body);
    toast(r.ok ? success : (r.message ?? "Action impossible."), r.ok ? "success" : "error");
    if (r.ok) {
      setChoosing(false);
      onChanged();
    }
  };

  if (status.kind === "demo" || !enabled) {
    return (
      <section aria-labelledby="duo-title" className="rounded-2xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm">
        <h2 id="duo-title" className="flex items-center gap-2 font-bold">
          <Users size={17} aria-hidden="true" /> Préparer à deux (Mode Duo)
        </h2>
        <p className="mt-1 text-ink-2">
          {status.kind === "demo"
            ? "Indisponible en démonstration : avec un compte, invitez un ami à modifier cette excursion avec vous et déclarez vos visites pour deux."
            : "Connectez-vous pour préparer cette excursion avec un ami."}
        </p>
      </section>
    );
  }

  if (!membership) {
    return (
      <section aria-labelledby="duo-title" className="card p-4 text-sm">
        <h2 id="duo-title" className="flex items-center gap-2 font-bold">
          <Users size={17} aria-hidden="true" /> Préparer à deux
        </h2>
        <p className="mt-1 text-ink-2">Invitez un ami : vous modifierez tous les deux les étapes, et chacun pourra déclarer une visite pour vous deux, que l&apos;autre confirme.</p>
        {!choosing ? (
          <button type="button" className="btn btn-ghost mt-3 min-h-10" onClick={() => setChoosing(true)}>
            <UserPlus size={17} aria-hidden="true" /> Inviter un ami
          </button>
        ) : friends === null ? (
          <p className="mt-3 text-ink-3">Chargement de vos amis…</p>
        ) : friends.length === 0 ? (
          <p className="mt-3 text-ink-2">Aucun ami pour l&apos;instant : ajoutez-en depuis l&apos;onglet Communauté.</p>
        ) : (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (friendshipId) void act("/api/duo", "POST", { excursionId, friendshipId }, "Invitation envoyée.");
            }}
          >
            <label className="sr-only" htmlFor="duo-friend">
              Ami à inviter
            </label>
            <select id="duo-friend" className="field min-w-0 flex-1" value={friendshipId} onChange={(e) => setFriendshipId(e.target.value)} required>
              <option value="">Choisir un ami…</option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.pseudonym}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary min-h-11">
              Inviter
            </button>
          </form>
        )}
      </section>
    );
  }

  const partner = membership.partnerPseudonym;
  return (
    <section aria-labelledby="duo-title" className="card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="duo-title" className="flex items-center gap-2 font-bold">
            <Users size={17} aria-hidden="true" />
            {membership.role === "guest" ? `Excursion de ${partner}, préparée à deux` : membership.status === "pending" ? `Invitation envoyée à ${partner}` : `Duo avec ${partner}`}
          </h2>
          <p className="mt-1 text-ink-2">
            {membership.status === "pending"
              ? "En attente de sa réponse."
              : membership.lastEditedBy === "partner"
                ? `Dernière modification par ${partner}, ${formatRelative(membership.updatedAt)}.`
                : membership.lastEditedBy === "me"
                  ? `Dernière modification par vous, ${formatRelative(membership.updatedAt)}.`
                  : "Vous pouvez tous les deux modifier les étapes."}
          </p>
        </div>
        {membership.role === "owner" ? (
          <button type="button" className="btn btn-ghost min-h-10 px-3" onClick={() => void act(`/api/duo/${excursionId}`, "PATCH", { action: "remove" }, membership.status === "pending" ? "Invitation annulée." : `${partner} a été retiré·e de l'excursion.`)}>
            <X size={16} aria-hidden="true" /> {membership.status === "pending" ? "Annuler l'invitation" : `Retirer ${partner}`}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost min-h-10 px-3" onClick={() => void act(`/api/duo/${excursionId}`, "PATCH", { action: "leave" }, "Vous avez quitté l'excursion.")}>
            <X size={16} aria-hidden="true" /> Quitter l&apos;excursion
          </button>
        )}
      </div>
    </section>
  );
}
