import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests d'intégration sur une VRAIE base PostgreSQL/PostGIS avec le schéma Supabase.
 * Par défaut : base de `supabase start` (port 54322). Surcharge : TEST_DATABASE_URL.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "src/test/empty-module.ts"),
      "@data": path.resolve(import.meta.dirname, "data"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
  },
});
