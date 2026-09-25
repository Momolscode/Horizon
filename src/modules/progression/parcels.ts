import { cellToBoundary, cellToChildren, cellToLatLng, cellToParent, getResolution, isValidCell, latLngToCell, polygonToCells } from "h3-js";
import type { LatLng } from "@/modules/catalog/schema";
import type { BBox } from "@/modules/shared/geo";
import { PARCEL_RESOLUTION } from "./config";

export type ParcelState = "simulated" | "declared" | "checked";

export type Parcel = {
  cell: string;
  resolution: number;
  state: ParcelState;
  firstRevealedAt: string;
  /** Lieu dont la visite a révélé la parcelle. */
  placeId: string;
};

const STATE_RANK: Record<ParcelState, number> = { simulated: 0, declared: 1, checked: 2 };

export function strongerState(a: ParcelState, b: ParcelState): ParcelState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

export function parcelForLocation(location: LatLng, resolution: number = PARCEL_RESOLUTION): string {
  return latLngToCell(location.lat, location.lng, resolution);
}

/** Contour GeoJSON ([lng, lat], anneau fermé) d'une cellule. */
export function cellPolygon(cell: string): Array<[number, number]> {
  return cellToBoundary(cell, true) as Array<[number, number]>;
}

export function cellCenter(cell: string): LatLng {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

/** Résolution d'affichage selon le zoom : jamais plus fine que la référence. */
export function displayResolutionForZoom(zoom: number, reference: number = PARCEL_RESOLUTION): number | null {
  if (zoom >= 11.5) return reference;
  if (zoom >= 10) return Math.max(0, reference - 1);
  if (zoom >= 8.5) return Math.max(0, reference - 2);
  return null;
}

export type ViewCells = { resolution: number; cells: string[] } | { resolution: null; cells: [] };

/**
 * Cellules couvrant la zone visible, uniquement. Si la zone est trop grande pour
 * la résolution demandée, on passe à une résolution plus grossière plutôt que de
 * générer des milliers de cellules.
 */
export function cellsForView(bbox: BBox, zoom: number, maxCells = 2500, reference: number = PARCEL_RESOLUTION): ViewCells {
  let resolution = displayResolutionForZoom(zoom, reference);
  if (resolution === null) return { resolution: null, cells: [] };
  const [w, s, e, n] = bbox;
  if (!(e > w && n > s)) return { resolution: null, cells: [] };
  const ring = [
    [s, w],
    [s, e],
    [n, e],
    [n, w],
  ];
  while (resolution >= 0) {
    const cells = polygonToCells(ring, resolution);
    if (cells.length <= maxCells) return { resolution, cells };
    resolution -= 1;
  }
  return { resolution: null, cells: [] };
}

/** Projette les parcelles explorées vers une résolution d'affichage. */
export function exploredAtResolution(parcels: Parcel[], displayResolution: number): Map<string, { explored: number; total: number; state: ParcelState }> {
  const result = new Map<string, { explored: number; total: number; state: ParcelState }>();
  for (const parcel of parcels) {
    if (!isValidCell(parcel.cell)) continue;
    const res = getResolution(parcel.cell);
    const targets = res >= displayResolution ? [cellToParent(parcel.cell, displayResolution)] : cellToChildren(parcel.cell, displayResolution);
    const childrenPerTarget = res >= displayResolution ? 7 ** (res - displayResolution) : 1;
    for (const target of targets) {
      const current = result.get(target);
      if (current) {
        current.explored += 1;
        current.state = strongerState(current.state, parcel.state);
      } else {
        result.set(target, { explored: 1, total: childrenPerTarget, state: parcel.state });
      }
    }
  }
  return result;
}

const destinationCellCountCache = new Map<string, number>();

/** Dénominateur des pourcentages de parcelles d'une destination : cellules de son emprise. */
export function cellsInBbox(bbox: BBox, resolution: number = PARCEL_RESOLUTION): number {
  const key = `${bbox.join(",")}@${resolution}`;
  const cached = destinationCellCountCache.get(key);
  if (cached !== undefined) return cached;
  const [w, s, e, n] = bbox;
  const count = polygonToCells(
    [
      [s, w],
      [s, e],
      [n, e],
      [n, w],
    ],
    resolution,
  ).length;
  destinationCellCountCache.set(key, count);
  return count;
}

export function parcelsInBbox(parcels: Parcel[], bbox: BBox): Parcel[] {
  return parcels.filter((p) => {
    const c = cellCenter(p.cell);
    return c.lng >= bbox[0] && c.lng <= bbox[2] && c.lat >= bbox[1] && c.lat <= bbox[3];
  });
}
