#!/usr/bin/env node
/**
 * Construit le fond géographique local utilisé quand aucun fournisseur de tuiles
 * n'est configuré (mode démo par défaut).
 *
 * Source : Natural Earth 1:10m, version v5.1.2 (domaine public,
 * https://www.naturalearthdata.com/about/terms-of-use/), récupérée depuis le dépôt
 * GitHub officiel nvkelso/natural-earth-vector.
 *
 * Le résultat est committé dans public/geo/ pour que l'application démarre sans
 * réseau. Relancer ce script seulement pour changer l'emprise ou les couches.
 *
 * Usage : node scripts/build-basemap.mjs
 * Derrière un proxy HTTP : NODE_USE_ENV_PROXY=1 node scripts/build-basemap.mjs (Node >= 22.21)
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const NE_TAG = "v5.1.2";
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson`;
const CACHE_DIR = path.join(process.cwd(), ".cache", "natural-earth");
const OUT_DIR = path.join(process.cwd(), "public", "geo");

// Emprise : France métropolitaine et frontières proches (ouest, sud, est, nord).
const BBOX = [-6.5, 41.0, 10.5, 51.8];
const PRECISION = 4; // ~11 m à l'équateur ; bien en dessous de la précision de Natural Earth 1:10m

const LAYERS = [
  { file: "ne_10m_admin_0_countries", layer: "country", keep: (p) => ({ iso: p.ADM0_A3 ?? p.adm0_a3 ?? null, name: p.NAME_FR ?? p.NAME ?? null }) },
  { file: "ne_10m_admin_1_states_provinces_lines", layer: "admin1", filter: (p) => (p.ADM0_A3 ?? p.adm0_a3) === "FRA", keep: () => ({}) },
  { file: "ne_10m_lakes", layer: "lake", keep: (p) => ({ name: p.name_fr ?? p.name ?? null }) },
  { file: "ne_10m_lakes_europe", layer: "lake", keep: (p) => ({ name: p.name_fr ?? p.name ?? null }) },
  { file: "ne_10m_rivers_lake_centerlines", layer: "river", keep: (p) => ({ name: p.name_fr ?? p.name ?? null, rank: p.scalerank ?? null }) },
  { file: "ne_10m_rivers_europe", layer: "river", keep: (p) => ({ name: p.name_fr ?? p.name ?? null, rank: p.scalerank ?? null }) },
  {
    file: "ne_10m_populated_places_simple",
    layer: "place",
    filter: (p) => (p.adm0_a3 ?? p.ADM0_A3) === "FRA",
    keep: (p) => ({ name: p.name ?? null, pop: p.pop_max ?? null, rank: p.scalerank ?? null }),
  },
];

async function download(file) {
  const target = path.join(CACHE_DIR, `${file}.geojson`);
  try {
    await stat(target);
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    // pas en cache
  }
  const url = `${NE_BASE}/${file}.geojson`;
  process.stdout.write(`Téléchargement ${url}\n`);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(target, text);
  return JSON.parse(text);
}

const round = (n) => Number(n.toFixed(PRECISION));
const inside = ([x, y]) => x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3];

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const q = [round(p[0]), round(p[1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out;
}

// Sutherland–Hodgman : découpe d'un anneau par le rectangle BBOX (convexe).
function clipRing(ring) {
  const edges = [
    (p) => p[0] >= BBOX[0],
    (p) => p[0] <= BBOX[2],
    (p) => p[1] >= BBOX[1],
    (p) => p[1] <= BBOX[3],
  ];
  const intersect = [
    (a, b) => [BBOX[0], a[1] + ((b[1] - a[1]) * (BBOX[0] - a[0])) / (b[0] - a[0])],
    (a, b) => [BBOX[2], a[1] + ((b[1] - a[1]) * (BBOX[2] - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX[1] - a[1])) / (b[1] - a[1]), BBOX[1]],
    (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX[3] - a[1])) / (b[1] - a[1]), BBOX[3]],
  ];
  let output = ring.slice(0, -1);
  for (let e = 0; e < 4; e += 1) {
    const input = output;
    output = [];
    if (input.length === 0) break;
    for (let i = 0; i < input.length; i += 1) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = edges[e](cur);
      const prevIn = edges[e](prev);
      if (curIn) {
        if (!prevIn) output.push(intersect[e](prev, cur));
        output.push(cur);
      } else if (prevIn) {
        output.push(intersect[e](prev, cur));
      }
    }
  }
  const cleaned = dedupe(output);
  if (cleaned.length < 3) return null;
  cleaned.push(cleaned[0]);
  return cleaned;
}

// Liang–Barsky : découpe d'un segment ; renvoie null s'il est entièrement dehors.
function clipSegment(a, b) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks = [
    [-dx, a[0] - BBOX[0]],
    [dx, BBOX[2] - a[0]],
    [-dy, a[1] - BBOX[1]],
    [dy, BBOX[3] - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

function clipLine(line) {
  const parts = [];
  let current = [];
  for (let i = 1; i < line.length; i += 1) {
    const seg = clipSegment(line[i - 1], line[i]);
    if (!seg) {
      if (current.length > 1) parts.push(current);
      current = [];
      continue;
    }
    if (current.length === 0) current.push(seg[0]);
    current.push(seg[1]);
    if (!inside(line[i])) {
      if (current.length > 1) parts.push(current);
      current = [];
    }
  }
  if (current.length > 1) parts.push(current);
  return parts.map(dedupe).filter((p) => p.length > 1);
}

function clipGeometry(geometry) {
  if (!geometry) return null;
  switch (geometry.type) {
    case "Point":
      return inside(geometry.coordinates) ? { type: "Point", coordinates: geometry.coordinates.map(round) } : null;
    case "LineString":
    case "MultiLineString": {
      const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
      const parts = lines.flatMap(clipLine);
      if (parts.length === 0) return null;
      return parts.length === 1 ? { type: "LineString", coordinates: parts[0] } : { type: "MultiLineString", coordinates: parts };
    }
    case "Polygon":
    case "MultiPolygon": {
      const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
      const out = [];
      for (const poly of polys) {
        const outer = clipRing(poly[0]);
        if (!outer) continue;
        const holes = poly.slice(1).map(clipRing).filter(Boolean);
        out.push([outer, ...holes]);
      }
      if (out.length === 0) return null;
      return out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
    }
    default:
      return null;
  }
}

async function main() {
  const features = [];
  const counts = {};
  for (const spec of LAYERS) {
    const data = await download(spec.file);
    for (const f of data.features) {
      const props = f.properties ?? {};
      if (spec.filter && !spec.filter(props)) continue;
      const geometry = clipGeometry(f.geometry);
      if (!geometry) continue;
      features.push({ type: "Feature", properties: { layer: spec.layer, ...spec.keep(props) }, geometry });
      counts[spec.layer] = (counts[spec.layer] ?? 0) + 1;
    }
  }
  await mkdir(OUT_DIR, { recursive: true });
  const collection = { type: "FeatureCollection", features };
  const json = JSON.stringify(collection);
  await writeFile(path.join(OUT_DIR, "basemap-fr.geojson"), json);
  const meta = {
    name: "Fond simplifié France — HORIZON",
    source: "Natural Earth 1:10m",
    sourceVersion: NE_TAG,
    sourceUrl: "https://github.com/nvkelso/natural-earth-vector",
    license: "Domaine public (Natural Earth terms of use)",
    licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
    attribution: "Made with Natural Earth",
    bbox: BBOX,
    precisionDecimals: PRECISION,
    layers: counts,
    builtAt: new Date().toISOString().slice(0, 10),
    limitations:
      "Fond à petite échelle (1:10 000 000) : pas de routes, pas de rues, contours approximatifs. Ne pas utiliser pour se déplacer.",
  };
  await writeFile(path.join(OUT_DIR, "basemap-fr.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  process.stdout.write(`Écrit public/geo/basemap-fr.geojson (${(json.length / 1024).toFixed(0)} Kio) — ${JSON.stringify(counts)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
