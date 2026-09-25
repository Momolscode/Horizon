/**
 * Indicateurs produit, calculés à partir des données réelles (comptes de test et
 * administrateurs exclus en amont, démonstration jamais comptée : elle n'écrit rien en base).
 * Chaque indicateur porte sa période, son numérateur et son dénominateur ; sous le seuil
 * minimal, on affiche « Données insuffisantes » au lieu d'un pourcentage.
 */
export const MIN_DENOMINATOR = 20;

export type Account = { id: string; createdAt: string };
export type Activity = { userId: string; at: string; kind: "visit" | "excursion" | "favorite" | "app_open" };

export type Ratio = {
  numerator: number;
  denominator: number;
  /** null si le dénominateur est inférieur au seuil. */
  value: number | null;
  sufficient: boolean;
};

export type Metrics = {
  generatedAt: string;
  accounts: number;
  /** Activation : comptes ayant déclaré une visite ou créé une excursion dans les 7 jours suivant l'inscription. */
  activation: Ratio & { cohort: string };
  /** Utilisateurs actifs : au moins une activité dans la fenêtre. */
  active7d: number;
  active30d: number;
  /** Rétention hebdomadaire par cohorte d'inscription (semaines 1, 2 et 4 après l'inscription). */
  retention: Array<{ cohortWeek: string; size: number; week1: Ratio; week2: Ratio; week4: Ratio }>;
};

const DAY = 86_400_000;

function ratio(numerator: number, denominator: number): Ratio {
  const sufficient = denominator >= MIN_DENOMINATOR;
  return { numerator, denominator, value: sufficient ? numerator / denominator : null, sufficient };
}

/** Lundi (UTC) de la semaine d'un instant, au format AAAA-MM-JJ. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export function computeMetrics(accounts: Account[], activities: Activity[], now: Date, cohortWeeks = 6): Metrics {
  const nowMs = now.getTime();
  const byUser = new Map<string, number[]>();
  for (const a of activities) {
    const t = Date.parse(a.at);
    if (!Number.isFinite(t)) continue;
    const list = byUser.get(a.userId) ?? [];
    list.push(t);
    byUser.set(a.userId, list);
  }
  const accountIds = new Set(accounts.map((a) => a.id));
  const activeWithin = (days: number) => [...byUser.entries()].filter(([id, ts]) => accountIds.has(id) && ts.some((t) => t <= nowMs && nowMs - t <= days * DAY)).length;

  // Activation : cohorte des comptes créés il y a entre 7 et 37 jours (fenêtre de 7 jours complète).
  const cohortAccounts = accounts.filter((a) => {
    const age = nowMs - Date.parse(a.createdAt);
    return age >= 7 * DAY && age <= 37 * DAY;
  });
  const activationKinds = new Set(["visit", "excursion"]);
  const activated = cohortAccounts.filter((a) => {
    const start = Date.parse(a.createdAt);
    return activities.some((x) => x.userId === a.id && activationKinds.has(x.kind) && Date.parse(x.at) >= start && Date.parse(x.at) <= start + 7 * DAY);
  }).length;

  const retention: Metrics["retention"] = [];
  for (let w = cohortWeeks; w >= 1; w -= 1) {
    const cohortStart = weekStart(new Date(nowMs - w * 7 * DAY).toISOString());
    const startMs = Date.parse(`${cohortStart}T00:00:00Z`);
    const members = accounts.filter((a) => weekStart(a.createdAt) === cohortStart);
    const retained = (k: number) => {
      const from = startMs + k * 7 * DAY;
      const to = from + 7 * DAY;
      if (to > nowMs) return null; // semaine pas encore écoulée
      return members.filter((m) => (byUser.get(m.id) ?? []).some((t) => t >= from && t < to)).length;
    };
    const r = (k: number): Ratio => {
      const n = retained(k);
      return n === null ? { numerator: 0, denominator: members.length, value: null, sufficient: false } : ratio(n, members.length);
    };
    retention.push({ cohortWeek: cohortStart, size: members.length, week1: r(1), week2: r(2), week4: r(4) });
  }

  return {
    generatedAt: now.toISOString(),
    accounts: accounts.length,
    activation: { ...ratio(activated, cohortAccounts.length), cohort: "comptes créés il y a 7 à 37 jours" },
    active7d: activeWithin(7),
    active30d: activeWithin(30),
    retention,
  };
}

export function formatRatio(r: Ratio): string {
  if (!r.sufficient || r.value === null) return `Données insuffisantes (n = ${r.denominator})`;
  return `${(r.value * 100).toFixed(1).replace(".", ",")} % (${r.numerator}/${r.denominator})`;
}
