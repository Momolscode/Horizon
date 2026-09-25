"use client";

import { useId, useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import type { Catalog } from "@/modules/catalog/schema";
import { searchCatalog, type SearchHit } from "@/modules/discovery/search";
import { CategoryIcon } from "../CategoryIcon";
import { CATEGORIES } from "@/modules/catalog/categories";

/** Recherche de villes, villages et lieux (motif combobox ARIA 1.2). */
export function SearchBox({ catalog, onPick, placeholder = "Ville, village ou lieu" }: { catalog: Catalog; onPick: (hit: SearchHit) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const hits = useMemo(() => searchCatalog(catalog, query, 8), [catalog, query]);
  const destinationName = (id: string) => catalog.destinations.find((d) => d.id === id)?.name ?? "";

  const pick = (hit: SearchHit) => {
    onPick(hit);
    setQuery(hit.kind === "destination" ? hit.destination.name : hit.place.name);
    setOpen(false);
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div className="relative w-full">
      <div className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 shadow-card focus-within:border-line-strong">
        <Search size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
        <input
          type="search"
          role="combobox"
          aria-label="Rechercher une ville, un village ou un lieu"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink" aria-label="Effacer la recherche">
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul id={listId} role="listbox" aria-label="Résultats de recherche" className="absolute inset-x-0 top-full z-30 mt-2 max-h-[50dvh] overflow-y-auto rounded-3xl border border-line bg-surface p-2 shadow-float">
          {hits.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-3" role="option" aria-selected="false" aria-disabled="true">
              Aucun résultat dans le catalogue de démonstration (4 destinations françaises).
            </li>
          ) : (
            hits.map((hit, i) => (
              <li
                key={hit.kind === "destination" ? `d-${hit.destination.id}` : `p-${hit.place.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
                  {hit.kind === "destination" ? <MapPin size={17} aria-hidden="true" /> : <CategoryIcon category={hit.place.category} size={17} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{hit.kind === "destination" ? hit.destination.name : hit.place.name}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {hit.kind === "destination" ? `Destination · ${hit.destination.region}` : `${CATEGORIES[hit.place.category].label} · ${destinationName(hit.place.destinationId)}`}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
