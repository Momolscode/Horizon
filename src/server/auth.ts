import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { readModeConfig } from "@/config/mode";

export type SessionUser = { id: string; email: string | null };

/**
 * Utilisateur authentifié de la requête (cookies Supabase), vérifié auprès du
 * service Auth (`getUser`), jamais déduit d'un identifiant envoyé par le client.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const mode = readModeConfig();
  if (mode.mode !== "connected" || !mode.ok) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(mode.supabaseUrl, mode.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Appel depuis un contexte en lecture seule : le proxy rafraîchit la session.
        }
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
