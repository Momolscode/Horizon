/**
 * Limiteur de débit en mémoire (fenêtre glissante simple).
 * Limite : par instance de serveur uniquement. En production multi-instances,
 * le remplacer par un stockage partagé (voir docs/HANDOVER.md § Déploiement).
 *
 * Une table par espace de clés (préfixe avant « : ») : un afflux de clés anonymes
 * (liste d'attente, en-têtes falsifiables) ne peut pas évincer les compteurs des
 * comptes connectés. Chaque table est bornée ; au-delà, les clés les moins
 * récemment utilisées sont évincées une à une (jamais de remise à zéro globale).
 */
const MAX_KEYS_PER_SPACE = 10_000;
const spaces = new Map<string, Map<string, number[]>>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterS: number } {
  const spaceName = key.split(":", 1)[0] ?? "";
  let buckets = spaces.get(spaceName);
  if (!buckets) {
    buckets = new Map();
    spaces.set(spaceName, buckets);
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  // Réinsertion : l'ordre d'itération de la Map devient l'ordre d'utilisation récente.
  buckets.delete(key);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { allowed: false, retryAfterS: Math.ceil((windowMs - (now - hits[0]!)) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS_PER_SPACE) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    for (const k of buckets.keys()) {
      if (buckets.size <= MAX_KEYS_PER_SPACE) break;
      buckets.delete(k);
    }
  }
  return { allowed: true, retryAfterS: 0 };
}

/**
 * Clé client pour les routes anonymes. `x-forwarded-for` n'est fiable que derrière un
 * proxy qui l'écrase (cas des hébergeurs usuels) : à vérifier au déploiement.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "inconnu";
}
