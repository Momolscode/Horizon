import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Fichiers générés ou copiés (worker MapLibre, service worker, caches)
    "public/**",
    ".cache/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "scripts/.*.tmp.mjs",
  ]),
]);

export default eslintConfig;
