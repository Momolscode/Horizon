import type { Metadata } from "next";
import Link from "next/link";
import { readModeConfig } from "@/config/mode";
import { databaseConfigured, getPool } from "@/server/db";
import { getCachedCatalog } from "@/server/catalog";
import { getSharedExcursion } from "@/server/shares";
import { scheduleExcursion } from "@/modules/excursions/schedule";
import { DEFAULT_PREFERENCES } from "@/modules/excursions/types";
import { CATEGORIES } from "@/modules/catalog/categories";
import { formatDuration, formatLocalDate, formatMinutes } from "@/modules/shared/time";
import { CopySharedButton } from "@/components/excursions/CopySharedButton";

export const metadata: Metadata = { title: "Excursion partagée", robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="font-display text-lg font-bold tracking-[0.2em]">
          HORIZON
        </Link>
        {children}
      </div>
    </main>
  );
}

export default async function SharedExcursionPage({ params }: PageProps<"/partage/[token]">) {
  const { token } = await params;
  const mode = readModeConfig();
  if (mode.mode !== "connected" || !databaseConfigured()) {
    return (
      <Shell>
        <h1 className="mt-6 text-3xl font-semibold">Partage indisponible</h1>
        <p className="mt-2 text-ink-2">Le partage d&apos;excursions nécessite le mode connecté (comptes et base de données). Cette installation fonctionne en démonstration.</p>
      </Shell>
    );
  }
  const shared = await getSharedExcursion(getPool(), token);
  if (!shared) {
    return (
      <Shell>
        <h1 className="mt-6 text-3xl font-semibold">Lien révoqué ou inexistant</h1>
        <p className="mt-2 text-ink-2">La personne qui a partagé cette excursion a peut-être retiré l&apos;accès.</p>
      </Shell>
    );
  }
  const catalog = (await getCachedCatalog(getPool())).catalog;
  const destination = catalog.destinations.find((d) => d.id === shared.destinationId);
  const prefs = { ...DEFAULT_PREFERENCES, ...(shared.preferences as Partial<typeof DEFAULT_PREFERENCES>) };
  const schedule = scheduleExcursion(
    { date: shared.date ?? new Date().toISOString().slice(0, 10), startTime: shared.startTime, durationMinutes: shared.durationMinutes, steps: shared.steps, party: prefs.party, budget: prefs.budget, transport: prefs.transport, needs: prefs.needs },
    catalog,
  );
  return (
    <Shell>
      <p className="eyebrow mt-6">Excursion partagée · lecture seule</p>
      <h1 className="text-4xl font-semibold">{shared.title}</h1>
      <p className="mt-2 text-sm font-semibold text-ink-2">
        {destination?.name} · {shared.date ? formatLocalDate(shared.date) : "date non communiquée"} · départ {shared.startTime} · {formatDuration(shared.durationMinutes)}
      </p>
      <ol className="mt-6 space-y-3">
        {schedule.steps.map((s, i) => (
          <li key={s.step.id} className="card flex gap-3 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coral font-display font-bold text-on-coral" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-ink-2">
                {formatMinutes(s.arrival)} – {formatMinutes(s.departure)} · {CATEGORIES[s.place.category].label}
              </p>
              <p className="font-display text-lg font-semibold">{s.place.name}</p>
              <p className="text-sm text-ink-2">{s.place.summary}</p>
              {s.transfer ? <p className="mt-1 text-xs text-ink-3">Marge estimée à vol d&apos;oiseau depuis l&apos;étape précédente : {s.transfer.marginMinutes} min (pas un itinéraire).</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <CopySharedButton token={token} />
        <Link href="/carte" className="btn btn-ghost">
          Découvrir HORIZON
        </Link>
      </div>
      <p className="mt-3 text-xs text-ink-3">La copie est indépendante : elle ne modifie pas l&apos;original et ne valide aucune visite.</p>
    </Shell>
  );
}
