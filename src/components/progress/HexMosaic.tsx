import type { Parcel } from "@/modules/progression/parcels";
import { cellPolygon } from "@/modules/progression/parcels";

/**
 * Mosaïque des parcelles explorées d'une destination, dessinée hors carte
 * (aucune position précise n'est lisible : l'échelle et l'emplacement sont normalisés).
 */
export function projectParcels(parcels: Parcel[], size: number, padding = 8): Array<{ cell: string; points: string; state: Parcel["state"] }> {
  if (parcels.length === 0) return [];
  const rings = parcels.map((p) => ({ p, ring: cellPolygon(p.cell) }));
  const all = rings.flatMap((r) => r.ring);
  const lngs = all.map(([lng]) => lng);
  const lats = all.map(([, lat]) => lat);
  const minX = Math.min(...lngs);
  const maxX = Math.max(...lngs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const midLat = ((minY + maxY) / 2) * (Math.PI / 180);
  const spanX = (maxX - minX) * Math.cos(midLat) || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const scale = (size - padding * 2) / Math.max(spanX, spanY);
  const offX = (size - spanX * scale) / 2;
  const offY = (size - spanY * scale) / 2;
  return rings.map(({ p, ring }) => ({
    cell: p.cell,
    state: p.state,
    points: ring.map(([lng, lat]) => `${(offX + (lng - minX) * Math.cos(midLat) * scale).toFixed(1)},${(offY + (maxY - lat) * scale).toFixed(1)}`).join(" "),
  }));
}

export function HexMosaic({ parcels, size = 120, label }: { parcels: Parcel[]; size?: number; label: string }) {
  const shapes = projectParcels(parcels, size);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="overflow-visible">
      <rect width={size} height={size} rx="18" fill="var(--surface-2)" />
      {shapes.length === 0 ? (
        <path d={`M${size / 2} ${size * 0.28} l${size * 0.19} ${size * 0.11} v${size * 0.22} l-${size * 0.19} ${size * 0.11} l-${size * 0.19} -${size * 0.11} v-${size * 0.22} Z`} fill="none" stroke="var(--line-strong)" strokeDasharray="4 4" strokeWidth="2" />
      ) : (
        shapes.map((s) => (
          <polygon
            key={s.cell}
            points={s.points}
            fill={s.state === "simulated" ? "var(--line)" : "var(--green)"}
            fillOpacity={s.state === "checked" ? 1 : 0.8}
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
        ))
      )}
    </svg>
  );
}
