/**
 * Mode d'exécution, fixé à la construction (variables NEXT_PUBLIC_*).
 *
 * - "demo" (défaut) : aucune clé, données de démonstration, progression locale.
 * - "connected" : comptes réels et base Supabase. Si la configuration est
 *   incomplète, l'application AFFICHE l'erreur ; elle ne bascule jamais en démo.
 */
export type ModeConfig =
  | { mode: "demo" }
  | { mode: "connected"; ok: true; supabaseUrl: string; supabaseKey: string }
  | { mode: "connected"; ok: false; problems: string[] };

export function readModeConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_HORIZON_MODE: process.env.NEXT_PUBLIC_HORIZON_MODE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}): ModeConfig {
  const raw = (env.NEXT_PUBLIC_HORIZON_MODE ?? "demo").trim().toLowerCase();
  if (raw === "" || raw === "demo") return { mode: "demo" };
  if (raw !== "connected") {
    return { mode: "connected", ok: false, problems: [`NEXT_PUBLIC_HORIZON_MODE a une valeur inconnue (« ${raw} »). Valeurs admises : demo, connected.`] };
  }
  const problems: string[] = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL est absente.");
  else {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) problems.push("NEXT_PUBLIC_SUPABASE_URL doit être une URL http(s).");
    } catch {
      problems.push("NEXT_PUBLIC_SUPABASE_URL n'est pas une URL valide.");
    }
  }
  if (!key) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY est absente.");
  if (problems.length > 0) return { mode: "connected", ok: false, problems };
  return { mode: "connected", ok: true, supabaseUrl: url, supabaseKey: key };
}

export const MODE: ModeConfig = readModeConfig();
export const IS_DEMO = MODE.mode === "demo";
