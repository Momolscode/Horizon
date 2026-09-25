import "server-only";
import { NextResponse } from "next/server";

/**
 * Protection CSRF des routes à cookies : origine identique exigée et corps JSON.
 * Les cookies Supabase sont SameSite=Lax, ce qui ne protège pas d'un sous-domaine voisin ;
 * cette vérification le fait.
 */
export function rejectCrossSite(request: Request, { requireJson = true }: { requireJson?: boolean } = {}): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "cross_site_forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) return NextResponse.json({ error: "cross_site_forbidden" }, { status: 403 });
  }
  if (requireJson && request.method !== "DELETE") {
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 });
  }
  return null;
}
