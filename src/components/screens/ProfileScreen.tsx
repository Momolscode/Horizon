"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Award, BookOpen, Download, Lock, Medal, Pencil, Settings, Share2, Trash2 } from "lucide-react";
import { BADGES, LEVELS, VISIT_RULES, levelForXp, medalBadgeId } from "@/modules/progression/config";
import { badgeLabel, computeStats, medalProgress, totals } from "@/modules/progression/engine";
import { cellsInBbox, parcelsInBbox } from "@/modules/progression/parcels";
import { useHorizon } from "../providers/HorizonProvider";
import { HexMosaic } from "../progress/HexMosaic";
import { MissionsPanel } from "../progress/MissionsPanel";
import { renderPassportImage } from "../progress/passport-image";
import { iconByName } from "../CategoryIcon";
import { Dialog } from "../shell/Dialog";

export function ProfileScreen() {
  const { state, catalog, status, actions, toast } = useHorizon();
  const [exporting, setExporting] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const progression = state.progression;
  const { xp, points } = totals(progression);
  const level = levelForXp(xp);
  const stats = computeStats(progression, catalog.catalog);
  const owned = new Set(progression.badges.map((b) => b.id));
  const destinations = catalog.catalog.destinations;
  const perDestination = useMemo(
    () =>
      destinations.map((d) => {
        const parcels = parcelsInBbox(progression.parcels, d.bbox);
        return { destination: d, parcels, cells: cellsInBbox(d.bbox), medal: medalProgress(progression, catalog.catalog, d.id) };
      }),
    [destinations, progression, catalog.catalog],
  );
  const journal = [...progression.visits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unlockedRewards = LEVELS.filter((l) => l.reward && l.level <= level.current.level);

  const exportPassport = async () => {
    setExporting(true);
    try {
      const blob = await renderPassportImage({
        pseudonym: state.profile.pseudonym,
        levelTitle: level.current.title,
        level: level.current.level,
        xp,
        placesVisited: stats.distinctPlacesVisited,
        destinationsDiscovered: stats.destinationsWithVisit,
        destinationsTotal: destinations.length,
        parcels: progression.parcels.filter((p) => p.state !== "simulated").length,
        badges: progression.badges.length,
        mosaics: perDestination.map((d) => ({ name: d.destination.name, parcels: d.parcels })),
        style: state.settings.passportStyle,
        demo: status.kind === "demo",
      });
      const file = new File([blob], "passeport-horizon.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mon passeport HORIZON" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "passeport-horizon.png";
        a.click();
        URL.revokeObjectURL(url);
        toast("Image du passeport téléchargée.", "success");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast("L'export du passeport a échoué.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Profil</p>
        <Link href="/profil/parametres" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-ink-2">
          <Settings size={18} aria-hidden="true" /> Paramètres
        </Link>
      </div>

      {/* Passeport */}
      <section aria-labelledby="passport-title" className={`grain relative mt-2 overflow-hidden rounded-[28px] p-6 shadow-float ${state.settings.passportStyle === "carnet-nuit" ? "bg-[#0a1224] text-[#edf1f8]" : "bg-ink text-bg"}`}>
        <div className="relative z-[2]">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">Passeport d&apos;exploration</p>
          <h1 id="passport-title" className="mt-1 text-4xl font-semibold">
            {state.profile.pseudonym}
          </h1>
          <p className="mt-1 font-semibold opacity-85">
            Niveau {level.current.level} · {level.current.title}
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-xs font-bold opacity-80">
              <span>{xp} XP (non dépensable)</span>
              <span>{level.next ? `Niveau ${level.next.level} à ${level.next.minXp} XP` : "Niveau maximal"}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)} aria-label="Progression vers le niveau suivant">
              <div className="h-full rounded-full bg-coral" style={{ width: `${Math.round(level.progress * 100)}%` }} />
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Lieux visités", value: String(stats.distinctPlacesVisited), note: "visites réelles (hors simulations)" },
              { label: "Destinations", value: `${stats.destinationsWithVisit}/${destinations.length}`, note: "avec au moins une visite" },
              { label: "Parcelles", value: String(progression.parcels.filter((p) => p.state !== "simulated").length), note: "cellules H3 rés. 8 révélées" },
              { label: "Points récompense", value: String(points), note: "échange indisponible" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-bg/10 p-3">
                <dt className="text-xs font-bold opacity-80">{s.label}</dt>
                <dd className="font-display text-3xl font-semibold">{s.value}</dd>
                <dd className="text-[11px] opacity-70">{s.note}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void exportPassport()} disabled={exporting}>
              {typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
              {exporting ? "Préparation…" : "Partager mon passeport"}
            </button>
          </div>
          <p className="mt-2 text-[11px] opacity-70">L&apos;image ne contient ni domicile, ni position précise, ni voyage à venir. Rien n&apos;est partagé sans votre action.</p>
        </div>
      </section>

      {/* Carte explorée */}
      <section aria-labelledby="explored-title" className="mt-8">
        <h2 id="explored-title" className="text-2xl font-semibold">
          Carte explorée
        </h2>
        <p className="text-sm text-ink-3">Parcelles révélées par destination. Pourcentage = parcelles explorées ÷ cellules de l&apos;emprise de la destination.</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {perDestination.map(({ destination, parcels, cells, medal }) => {
            const real = parcels.filter((p) => p.state !== "simulated").length;
            const hasMedal = owned.has(medalBadgeId(destination.id));
            return (
              <li key={destination.id} className="card flex items-center gap-4 p-4">
                <HexMosaic parcels={parcels} size={96} label={`${parcels.length} parcelle(s) révélée(s) à ${destination.name}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-semibold">{destination.name}</p>
                  <p className="text-sm text-ink-2">
                    {real} / {cells} parcelles ({((real / cells) * 100).toFixed(1).replace(".", ",")} %)
                    {parcels.length > real ? ` · ${parcels.length - real} simulée(s)` : ""}
                  </p>
                  <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${hasMedal ? "text-coral-ink" : "text-ink-3"}`}>
                    <Medal size={15} aria-hidden="true" /> {destination.medalRoute.title} : {medal.done}/{medal.total} lieux du parcours
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-green" style={{ width: `${(medal.done / medal.total) * 100}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <MissionsPanel />

      {/* Badges */}
      <section aria-labelledby="badges-title" className="mt-8">
        <h2 id="badges-title" className="text-2xl font-semibold">
          Badges
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.values(BADGES).map((b) => {
            const has = owned.has(b.id);
            const Icon = iconByName(b.icon);
            return (
              <li key={b.id} className={`card p-4 ${has ? "" : "border-dashed bg-surface-2"}`}>
                <span className={`grid h-11 w-11 place-items-center rounded-full ${has ? "bg-coral-soft text-coral-ink" : "bg-surface-2 text-ink-3"}`}>
                  {has ? <Icon size={20} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
                </span>
                <p className="mt-2 font-bold">{b.label}</p>
                <p className="text-xs text-ink-2">{b.description}</p>
                <p className="mt-1 text-[11px] font-bold">{has ? "Obtenu" : "À obtenir"}</p>
              </li>
            );
          })}
          {destinations.map((d) => {
            const has = owned.has(medalBadgeId(d.id));
            return (
              <li key={d.id} className={`card p-4 ${has ? "" : "border-dashed bg-surface-2"}`}>
                <span className={`grid h-11 w-11 place-items-center rounded-full ${has ? "bg-coral-soft text-coral-ink" : "bg-surface-2 text-ink-3"}`}>
                  {has ? <Award size={20} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
                </span>
                <p className="mt-2 font-bold">{badgeLabel(medalBadgeId(d.id), catalog.catalog)}</p>
                <p className="text-xs text-ink-2">Visiter les {d.medalRoute.placeIds.length} lieux du parcours défini.</p>
                <p className="mt-1 text-[11px] font-bold">{has ? "Obtenue" : "À obtenir"}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
          <p className="font-bold text-ink">Récompenses de niveau</p>
          <ul className="mt-1 space-y-0.5">
            {LEVELS.filter((l) => l.reward).map((l) => (
              <li key={l.level} className={l.level <= level.current.level ? "text-ink" : ""}>
                Niveau {l.level} — {l.reward!.label} {l.level <= level.current.level ? "✓" : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            {unlockedRewards.length} récompense(s) débloquée(s). Les points récompense ne peuvent pas encore être échangés : aucune offre partenaire n&apos;est active.
          </p>
        </div>
      </section>

      {/* Carnet */}
      <section aria-labelledby="journal-title" className="mt-8">
        <h2 id="journal-title" className="flex items-center gap-2 text-2xl font-semibold">
          <BookOpen aria-hidden="true" size={22} /> Carnet de visites
        </h2>
        {journal.length === 0 ? (
          <div className="card mt-3 p-5 text-center">
            <p className="font-bold">Votre carnet est vide</p>
            <p className="text-sm text-ink-2">Ouvrez un lieu et touchez « J&apos;y suis allé » pour révéler votre première parcelle.</p>
            <Link href="/carte" className="btn btn-primary mt-3">
              Explorer la carte
            </Link>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {journal.slice(0, 30).map((v) => {
              const place = catalog.placesById.get(v.placeId);
              return (
                <li key={v.id} className="px-4 py-3">
                  <Link href={`/lieux/${v.placeId}`} className="font-bold hover:underline">
                    {place?.name ?? v.placeId}
                  </Link>
                  <p className="text-sm text-ink-3">
                    {v.visitedOn} · {VISIT_RULES[v.status].label}
                  </p>
                  {v.note ? <p className="mt-1 text-sm text-ink-2">« {v.note} »</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Collections */}
      <section aria-labelledby="collections-title" className="mt-8">
        <h2 id="collections-title" className="text-2xl font-semibold">
          Collections
        </h2>
        <ul className="mt-3 space-y-3">
          {state.collections.map((c, index) => (
            <li key={c.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold">
                  {c.name} <span className="font-sans text-sm font-normal text-ink-3">· {c.placeIds.length} lieu(x)</span>
                </p>
                <div className="flex gap-1">
                  <button type="button" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2" aria-label={`Renommer ${c.name}`} onClick={() => setRenaming({ id: c.id, name: c.name })}>
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  {index > 0 ? (
                    <button type="button" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2" aria-label={`Supprimer ${c.name}`} onClick={() => void actions.deleteCollection(c.id)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
              {c.placeIds.length === 0 ? (
                <p className="text-sm text-ink-3">Aucun lieu enregistré.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {c.placeIds.map((id) => (
                    <li key={id}>
                      <Link href={`/lieux/${id}`} className="chip">
                        {catalog.placesById.get(id)?.name ?? id}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renommer la collection"
        size="sm"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (renaming && (await actions.renameCollection(renaming.id, renaming.name))) setRenaming(null);
            }}
          >
            Enregistrer
          </button>
        }
      >
        <label className="block text-sm font-bold">
          Nom
          <input className="field mt-1" maxLength={60} value={renaming?.name ?? ""} onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))} />
        </label>
      </Dialog>
    </div>
  );
}
