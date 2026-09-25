import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseConfigured, getPool } from "@/server/db";
import { clientKey, rateLimit } from "@/server/rate-limit";

const WaitlistSchema = z.object({
  email: z.email().max(254),
  consent: z.literal(true),
  /** Champ piège invisible : rempli uniquement par des robots. */
  website: z.string().max(0).optional().default(""),
  source: z.string().max(40).optional().default("landing"),
});

export async function POST(request: Request) {
  const key = clientKey(request.headers);
  const limit = rateLimit(`waitlist:${key}`, 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = WaitlistSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  if (!databaseConfigured()) {
    // Honnêteté : sans stockage, rien n'est enregistré et on le dit.
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }
  const salt = process.env.WAITLIST_HASH_SALT ?? "";
  const ipHash = salt ? createHash("sha256").update(`${salt}:${key}`).digest("hex") : null;
  try {
    await getPool().query(
      `insert into public.waitlist (email, consent_at, source, ip_hash)
       values (lower($1), now(), $2, $3)
       on conflict (email) do nothing`,
      [parsed.data.email, parsed.data.source, ipHash],
    );
  } catch {
    return NextResponse.json({ ok: false, error: "storage_error" }, { status: 503 });
  }
  // Même réponse que l'adresse soit nouvelle ou déjà inscrite (pas d'énumération).
  return NextResponse.json({ ok: true });
}
