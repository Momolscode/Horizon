/**
 * Limiteur de débit en mémoire (fenêtre glissante simple).
 * Limite : par instance de serveur uniquement. En production multi-instances,
 * le remplacer par un stockage partagé (voir docs/HANDOVER.md § Quotas).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterS: number } {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { allowed: false, retryAfterS: Math.ceil((windowMs - (now - hits[0]!)) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    // Mémoire bornée même sous attaque (clés uniques) : on repart de zéro.
    if (buckets.size > 20_000) buckets.clear();
  }
  return { allowed: true, retryAfterS: 0 };
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "inconnu";
}
