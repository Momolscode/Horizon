import Link from "next/link";
import { Footprints } from "lucide-react";
import type { Destination, Place } from "@/modules/catalog/schema";
import { priceText } from "@/modules/catalog/present";
import { PlaceArt } from "../PlaceArt";
import { CategoryBadge } from "../CategoryIcon";

export function PlaceCard({
  place,
  destination,
  reason,
  visited = false,
  href,
  onSelect,
  layout = "vertical",
}: {
  place: Place;
  destination: Destination;
  reason?: string;
  visited?: boolean;
  href?: string;
  onSelect?: () => void;
  layout?: "vertical" | "horizontal";
}) {
  const body = (
    <>
      <div className={`grain relative shrink-0 overflow-hidden ${layout === "vertical" ? "h-36 w-full rounded-t-[18px]" : "h-24 w-24 rounded-2xl"}`}>
        <PlaceArt seed={place.id} motif={place.art.motif} palette={place.art.palette} className="absolute inset-0 h-full w-full" />
        {visited ? (
          <span className="absolute left-2 top-2 z-[2] inline-flex items-center gap-1 rounded-full bg-green px-2 py-0.5 text-[11px] font-bold text-on-green">
            <Footprints size={12} aria-hidden="true" /> Visité
          </span>
        ) : null}
      </div>
      <div className={`min-w-0 ${layout === "vertical" ? "p-3" : "py-1"}`}>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={place.category} compact={layout === "horizontal"} />
          {place.fictional ? <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn-ink">Fictif</span> : null}
          {place.sponsored ? <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[11px] font-bold text-coral-ink">Sponsorisé</span> : null}
        </div>
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug">{place.name}</h3>
        <p className="text-xs font-semibold text-ink-3">
          {destination.name} · {priceText(place, destination)}
        </p>
        {reason ? <p className="mt-1 line-clamp-2 text-sm text-ink-2">{reason}</p> : null}
      </div>
    </>
  );
  const className = `card flex overflow-hidden text-left transition-transform hover:-translate-y-0.5 ${layout === "vertical" ? "flex-col" : "items-center gap-3 p-2"}`;
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onSelect} className={`${className} w-full`}>
      {body}
    </button>
  );
}
