import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Garde-fou « server-only » neutralisé dans les tests Node.
      "server-only": path.resolve(import.meta.dirname, "src/test/empty-module.ts"),
      "@data": path.resolve(import.meta.dirname, "data"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "data/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["**/*.db.test.ts", "node_modules/**", "e2e/**"],
    // Fuseau volontairement différent de celui des destinations : les calculs
    // doivent dépendre du fuseau de la destination, pas de celui de la machine.
    env: { TZ: "America/New_York" },
  },
});
