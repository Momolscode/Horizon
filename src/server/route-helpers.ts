import "server-only";
import { NextResponse } from "next/server";
import { databaseConfigured } from "./db";
import { getSessionUser, type SessionUser } from "./auth";
import { rejectCrossSite } from "./request-guard";
import { rateLimit } from "./rate-limit";
import { ContributionError } from "./contributions";

/**
 * Préambule commun des routes « compte connecté » : protection intersites (mutations),
 * base configurée, session valide, limite de débit facultative.
 */
export async function requireAccount(request: Request, options: { mutation?: boolean; limit?: { key: string; max: number; windowMs: number } } = {}): Promise<SessionUser | Response> {
  if (options.mutation) {
    const blocked = rejectCrossSite(request);
    if (blocked) return blocked;
  }
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (options.limit && !rateLimit(`${options.limit.key}:${user.id}`, options.limit.max, options.limit.windowMs).allowed) {
    return NextResponse.json({ error: "rate_limited", message: "Trop de demandes : réessayez plus tard." }, { status: 429 });
  }
  return user;
}

/** Traduit les erreurs métier du référencement en réponses HTTP explicites. */
export function contributionErrorResponse(error: unknown, context: string): Response {
  if (error instanceof ContributionError) return NextResponse.json({ error: "contribution", message: error.message, ...(error.details ?? {}) }, { status: error.status });
  if ((error as { code?: string })?.code === "23505") return NextResponse.json({ error: "conflict", message: "Opération déjà effectuée par ailleurs." }, { status: 409 });
  console.error(`${context} : échec`, error instanceof Error ? error.message : "erreur inconnue");
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}
