import { describe, expect, it } from "vitest";
import { readModeConfig } from "./mode";

describe("configuration du mode", () => {
  it("démarre en démo sans aucune variable", () => {
    expect(readModeConfig({})).toEqual({ mode: "demo" });
  });

  it("ne bascule jamais en démo quand le mode connecté est incomplet", () => {
    const config = readModeConfig({ NEXT_PUBLIC_HORIZON_MODE: "connected" });
    expect(config).toMatchObject({ mode: "connected", ok: false });
    if (config.mode === "connected" && !config.ok) expect(config.problems).toHaveLength(2);
  });

  it("signale une URL invalide ou un mode inconnu", () => {
    expect(readModeConfig({ NEXT_PUBLIC_HORIZON_MODE: "connected", NEXT_PUBLIC_SUPABASE_URL: "pas-une-url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" })).toMatchObject({ ok: false });
    expect(readModeConfig({ NEXT_PUBLIC_HORIZON_MODE: "prod" })).toMatchObject({ mode: "connected", ok: false });
  });

  it("accepte une configuration complète", () => {
    expect(
      readModeConfig({ NEXT_PUBLIC_HORIZON_MODE: "connected", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" }),
    ).toMatchObject({ mode: "connected", ok: true });
  });
});
