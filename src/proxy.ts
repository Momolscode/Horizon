import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readModeConfig } from "@/config/mode";

/**
 * Mode connecté : rafraîchit la session Supabase avant les routes API
 * (jetons expirés), selon la procédure de @supabase/ssr. Sans effet en démo.
 */
export async function proxy(request: NextRequest) {
  const mode = readModeConfig();
  if (mode.mode !== "connected" || !mode.ok) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(mode.supabaseUrl, mode.supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
