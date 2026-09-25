"use client";

import { CATEGORIES, CATEGORY_IDS, DIETS, DIET_LABELS } from "@/modules/catalog/categories";
import type { FilterReport, PlaceFilters } from "@/modules/discovery/search";
import { DEFAULT_FILTERS } from "@/modules/discovery/search";
import { CategoryIcon } from "../CategoryIcon";
import { Dialog } from "../shell/Dialog";

const BUDGETS: Array<{ id: PlaceFilters["budget"]; label: string }> = [
  { id: "any", label: "Tous" },
  { id: "free", label: "Gratuit" },
  { id: 15, label: "≤ 15 €" },
  { id: 30, label: "≤ 30 €" },
  { id: 60, label: "≤ 60 €" },
];

export function countActiveFilters(f: PlaceFilters): number {
  let n = 0;
  if (f.categories.length) n += 1;
  if (f.budget !== "any") n += 1;
  if (f.maxDistanceKm !== null) n += 1;
  if (f.maxVisitMinutes !== null) n += 1;
  if (f.openNow) n += 1;
  if (f.wheelchair) n += 1;
  if (f.setting !== "any") n += 1;
  if (f.diets.length) n += 1;
  return n;
}

export function FiltersDialog({
  open,
  onClose,
  filters,
  onChange,
  report,
  distanceOriginLabel,
}: {
  open: boolean;
  onClose: () => void;
  filters: PlaceFilters;
  onChange: (f: PlaceFilters) => void;
  report: FilterReport;
  distanceOriginLabel: string | null;
}) {
  const set = (patch: Partial<PlaceFilters>) => onChange({ ...filters, ...patch });
  const hidden = report.hiddenForUnknown;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Filtres"
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onChange({ ...DEFAULT_FILTERS, destinationId: filters.destinationId, origin: filters.origin })}>
            Réinitialiser
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Voir {report.places.length} lieu{report.places.length > 1 ? "x" : ""}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 font-bold">Catégories</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_IDS.map((id) => {
              const active = filters.categories.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={active}
                  onClick={() => set({ categories: active ? filters.categories.filter((c) => c !== id) : [...filters.categories, id] })}
                >
                  <CategoryIcon category={id} size={15} /> {CATEGORIES[id].label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-bold">Budget par personne</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {BUDGETS.map((b) => (
              <button key={String(b.id)} type="button" role="radio" aria-checked={filters.budget === b.id} className="chip" onClick={() => set({ budget: b.id })}>
                {b.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--coral)]" checked={filters.includeUnknownPrice} onChange={(e) => set({ includeUnknownPrice: e.target.checked })} />
            Inclure les lieux au coût inconnu (signalés comme tels)
          </label>
          {hidden.price > 0 ? <p className="mt-1 text-xs text-ink-3">{hidden.price} lieu(x) masqué(s) car leur coût est inconnu.</p> : null}
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-bold">Distance à vol d&apos;oiseau</legend>
          {distanceOriginLabel ? (
            <>
              <p className="mb-2 text-sm text-ink-3">Depuis : {distanceOriginLabel}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {[null, 1, 3, 10].map((km) => (
                  <button key={String(km)} type="button" role="radio" aria-checked={filters.maxDistanceKm === km} className="chip" onClick={() => set({ maxDistanceKm: km })}>
                    {km === null ? "Toutes" : `≤ ${km} km`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3">Choisissez une destination ou utilisez « Me localiser » pour filtrer par distance.</p>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-bold">Durée de visite</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {[null, 45, 90, 150].map((m) => (
              <button key={String(m)} type="button" role="radio" aria-checked={filters.maxVisitMinutes === m} className="chip" onClick={() => set({ maxVisitMinutes: m })}>
                {m === null ? "Toutes" : `≤ ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`}`}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 font-bold">Autres critères</legend>
          <label className={`flex items-start gap-3 text-sm ${report.openNowAvailable ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-[var(--coral)]"
              checked={filters.openNow}
              disabled={!report.openNowAvailable}
              onChange={(e) => set({ openNow: e.target.checked })}
            />
            <span>
              Ouvert maintenant
              <span className="block text-xs text-ink-3">
                {report.openNowAvailable
                  ? "Seuls les lieux avec des horaires exploitables sont pris en compte (horaires fictifs en démonstration)."
                  : "Indisponible : aucun lieu de ce périmètre n'a d'horaires exploitables."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--coral)]" checked={filters.wheelchair} onChange={(e) => set({ wheelchair: e.target.checked })} />
            <span>
              Accessible en fauteuil roulant
              <span className="block text-xs text-ink-3">Les lieux dont l&apos;accessibilité n&apos;est pas renseignée sont exclus{hidden.accessibility ? ` (${hidden.accessibility})` : ""}.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Intérieur ou extérieur">
            {(["any", "indoor", "outdoor"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={filters.setting === s} className="chip" onClick={() => set({ setting: s })}>
                {{ any: "Intérieur et extérieur", indoor: "Intérieur", outdoor: "Extérieur" }[s]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-bold">Préférences alimentaires (restaurants)</legend>
          <div className="flex flex-wrap gap-2">
            {DIETS.map((d) => {
              const active = filters.diets.includes(d);
              return (
                <button key={d} type="button" className="chip" aria-pressed={active} onClick={() => set({ diets: active ? filters.diets.filter((x) => x !== d) : [...filters.diets, d] })}>
                  {DIET_LABELS[d]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
