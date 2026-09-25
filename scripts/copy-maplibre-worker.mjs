// Copie le worker MapLibre GL v6 dans public/ : Turbopack ne sait pas émettre
// maplibre-gl-worker.mjs avec son voisin maplibre-gl-shared.mjs.
// Procédure officielle : https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md (onglet Turbopack)
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist");
const dest = path.join(process.cwd(), "public", "maplibre");

mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
