"use client";

import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthValue = {
  supabase: SupabaseClient;
  user: { id: string; email: string | null } | null;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);

/** Session du mode connecté ; `null` en démonstration. */
export function useAuth(): AuthValue | null {
  return useContext(AuthContext);
}
