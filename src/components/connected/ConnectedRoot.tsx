"use client";

import type { ReactNode } from "react";
import { ConfigErrorScreen } from "../shell/ConfigErrorScreen";

// Remplacé par l'implémentation Supabase (tâche mode connecté).
export function ConnectedRoot({ children }: { supabaseUrl: string; supabaseKey: string; children: ReactNode }) {
  void children;
  return <ConfigErrorScreen title="Mode connecté indisponible dans cette version" problems={["L'implémentation du mode connecté n'est pas encore livrée."]} />;
}
