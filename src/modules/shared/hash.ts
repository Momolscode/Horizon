/** Hachage FNV-1a 32 bits : déterministe, utilisé pour départager sans aléa caché. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Nombre déterministe dans [0, 1[ dérivé d'une graine et d'une clé. */
export function seededUnit(seed: number | string, key: string): number {
  return fnv1a(`${seed}:${key}`) / 0x100000000;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
