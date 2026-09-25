import {
  Award,
  Baby,
  Bike,
  Building2,
  Castle,
  Church,
  Compass,
  Footprints,
  Hexagon,
  Landmark,
  Leaf,
  Map,
  Mountain,
  Palette,
  PiggyBank,
  Sailboat,
  ShoppingBasket,
  Soup,
  Store,
  Tent,
  Sparkles,
  Sun,
  Ticket,
  Trees,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { CATEGORIES, type CategoryId } from "@/modules/catalog/categories";

const ICONS: Record<string, LucideIcon> = {
  Landmark,
  Building2,
  Castle,
  Church,
  UtensilsCrossed,
  ShoppingBasket,
  Store,
  Tent,
  Footprints,
  Trees,
  Waves,
  Sailboat,
  Mountain,
  Ticket,
  Palette,
  Leaf,
  Soup,
  Bike,
  Sun,
  Baby,
  PiggyBank,
  Hexagon,
  Sparkles,
  Compass,
  Map,
  Award,
};

export function iconByName(name: string): LucideIcon {
  return ICONS[name] ?? Award;
}

const TONE_CLASS: Record<string, string> = {
  coral: "bg-coral-soft text-coral-ink",
  green: "bg-green-soft text-green-ink",
  blue: "bg-[color-mix(in_srgb,var(--sky)_16%,transparent)] text-sky",
  sand: "bg-[color-mix(in_srgb,var(--sand)_20%,transparent)] text-[color-mix(in_srgb,var(--sand)_60%,var(--ink))]",
  plum: "bg-[color-mix(in_srgb,var(--plum)_16%,transparent)] text-plum",
};

export function CategoryIcon({ category, size = 16, className = "" }: { category: CategoryId; size?: number; className?: string }) {
  return createElement(ICONS[CATEGORIES[category].icon] ?? Award, { "aria-hidden": true, width: size, height: size, className, strokeWidth: 2 });
}

/** Pastille catégorie : icône + libellé (jamais la couleur seule). */
export function CategoryBadge({ category, compact = false }: { category: CategoryId; compact?: boolean }) {
  const meta = CATEGORIES[category];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${TONE_CLASS[meta.tone]}`}>
      <CategoryIcon category={category} size={14} />
      {compact ? null : meta.label}
      {compact ? <span className="sr-only">{meta.label}</span> : null}
    </span>
  );
}
