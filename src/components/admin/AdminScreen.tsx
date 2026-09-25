"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { formatRatio, type Metrics } from "@/modules/admin/metrics";
import { MODE } from "@/config/mode";

type Tab = "overview" | "reports" | "reviews" | "places" | "missions" | "adjust" | "audit";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "reports", label: "Signalements" },
  { id: "reviews", label: "Avis" },
  { id: "places", label: "Lieux" },
  { id: "missions", label: "Missions & barèmes" },
  { id: "adjust", label: "Corrections" },
  { id: "audit", label: "Journal" },
];

type Json = Record<string, unknown>;

async function api<T = Json>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, data: {} as T };
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

function useAdminData<T>(path: string, version: number) {
  const [state, setState] = useState<{ status: number; data: T | null }>({ status: -1, data: null });
  useEffect(() => {
    let cancelled = false;
    void api<T>(path).then((r) => {
      if (!cancelled) setState({ status: r.status, data: r.ok ? r.data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [path, version]);
  return state;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>("overview");
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const overview = useAdminData<{ counts: Record<string, number>; metrics: Metrics }>("/api/admin/overview", version);

  if (MODE.mode !== "connected") {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-center">
        <h1 className="text-3xl font-semibold">Administration</h1>
        <p className="mt-2 text-ink-2">L&apos;administration nécessite le mode connecté (base de données et comptes). Cette installation est une démonstration.</p>
        <Link href="/carte" className="btn btn-primary mt-4">
          Retour
        </Link>
      </main>
    );
  }
  if (overview.status === -1) return <main className="p-8 text-ink-2">Chargement…</main>;
  if (overview.status === 401 || overview.status === 403) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-center">
        <ShieldAlert className="mx-auto text-danger-ink" aria-hidden="true" />
        <h1 className="mt-2 text-3xl font-semibold">Accès réservé</h1>
        <p className="mt-2 text-ink-2">{overview.status === 401 ? "Connectez-vous avec un compte administrateur." : "Ce compte n'a pas le rôle administrateur."}</p>
        <Link href={overview.status === 401 ? "/connexion" : "/carte"} className="btn btn-primary mt-4">
          {overview.status === 401 ? "Se connecter" : "Retour"}
        </Link>
      </main>
    );
  }

  const act = async (path: string, method: "PATCH" | "POST", body: Json, success: string) => {
    const r = await api(path, { method, body: JSON.stringify(body) });
    setMessage(r.ok ? success : `Échec (${r.status}) : ${String((r.data as Json).message ?? (r.data as Json).error ?? "erreur")}`);
    refresh();
    return r.ok;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <Link href="/profil" className="inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft size={18} aria-hidden="true" /> Application
      </Link>
      <h1 className="text-4xl font-semibold">Administration</h1>
      <p className="text-sm text-ink-3">Toutes les opérations sont journalisées. Les comptes de test et administrateurs sont exclus des mesures.</p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="chip shrink-0" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold text-ink-2">
        {message}
      </p>
      <div className="mt-2 space-y-4">
        {tab === "overview" && overview.data ? <Overview counts={overview.data.counts} metrics={overview.data.metrics} /> : null}
        {tab === "reports" ? <Reports version={version} act={act} /> : null}
        {tab === "reviews" ? <Reviews version={version} act={act} /> : null}
        {tab === "places" ? <Places version={version} act={act} /> : null}
        {tab === "missions" ? <MissionsAndConfig version={version} act={act} /> : null}
        {tab === "adjust" ? <Adjust act={act} /> : null}
        {tab === "audit" ? <Audit version={version} /> : null}
      </div>
    </main>
  );
}

type Act = (path: string, method: "PATCH" | "POST", body: Json, success: string) => Promise<boolean>;

function Overview({ counts, metrics }: { counts: Record<string, number>; metrics: Metrics }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Lieux publiés", `${counts.places_published} / ${counts.places}`],
          ["Signalements ouverts", counts.open_reports],
          ["Avis à modérer", counts.pending_reviews],
          ["Liste d'attente", counts.waitlist],
          ["Comptes réels", metrics.accounts],
          ["Comptes de test (exclus)", counts.test_accounts],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-4">
            <p className="text-xs font-bold text-ink-3">{label}</p>
            <p className="font-display text-3xl font-semibold">{String(value)}</p>
          </div>
        ))}
      </div>
      <Card title="Indicateurs">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-bold">Activation</dt>
            <dd>
              {formatRatio(metrics.activation)} — visite déclarée ou excursion créée dans les 7 jours suivant l&apos;inscription ; cohorte : {metrics.activation.cohort}.
            </dd>
          </div>
          <div>
            <dt className="font-bold">Utilisateurs actifs</dt>
            <dd>
              {metrics.accounts < 20 ? "Données insuffisantes" : `${metrics.active7d} sur 7 jours, ${metrics.active30d} sur 30 jours`} (activité = visite, excursion, favori ou ouverture consentie ; n = {metrics.accounts} comptes).
            </dd>
          </div>
        </dl>
        <table className="mt-4 w-full text-left text-sm">
          <caption className="mb-2 text-left font-bold">Rétention par cohorte hebdomadaire (semaine d&apos;inscription)</caption>
          <thead>
            <tr className="text-ink-3">
              <th className="py-1">Cohorte</th>
              <th>Taille</th>
              <th>S+1</th>
              <th>S+2</th>
              <th>S+4</th>
            </tr>
          </thead>
          <tbody>
            {metrics.retention.map((r) => (
              <tr key={r.cohortWeek} className="border-t border-line">
                <td className="py-1">{r.cohortWeek}</td>
                <td>{r.size}</td>
                <td>{r.week1.value === null ? "—" : formatRatio(r.week1)}</td>
                <td>{r.week2.value === null ? "—" : formatRatio(r.week2)}</td>
                <td>{r.week4.value === null ? "—" : formatRatio(r.week4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-3">« — » : dénominateur inférieur à 20 comptes ou semaine non écoulée. Aucune valeur n&apos;est extrapolée.</p>
      </Card>
    </>
  );
}

function Reports({ version, act }: { version: number; act: Act }) {
  const { data } = useAdminData<{ reports: Array<Json> }>("/api/admin/reports", version);
  return (
    <Card title="Signalements d'erreurs">
      {!data?.reports.length ? (
        <p className="text-sm text-ink-3">Aucun signalement.</p>
      ) : (
        <ul className="space-y-2">
          {data.reports.map((r) => (
            <li key={String(r.id)} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-bold">
                {String(r.place_name)} · {String(r.kind)} · <span className="text-ink-3">{String(r.status)}</span>
              </p>
              <p className="text-ink-2">{String(r.message)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/reports/${r.id}`, "PATCH", { status: "resolved" }, "Signalement résolu.")}>
                  Résolu
                </button>
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/reports/${r.id}`, "PATCH", { status: "rejected" }, "Signalement rejeté.")}>
                  Rejeter
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Reviews({ version, act }: { version: number; act: Act }) {
  const { data } = useAdminData<{ reviews: Array<Json> }>("/api/admin/reviews", version);
  return (
    <Card title="Avis à modérer">
      {!data?.reviews.length ? (
        <p className="text-sm text-ink-3">Aucun avis en attente ou signalé.</p>
      ) : (
        <ul className="space-y-2">
          {data.reviews.map((r) => (
            <li key={String(r.id)} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-bold">
                {String(r.place_name)} · {"★".repeat(Number(r.rating))} · {String(r.pseudonym)} · {String(r.status)}
                {Number(r.reports) ? ` · ${r.reports} signalement(s)` : ""}
              </p>
              <p className="text-ink-2">{String(r.body)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/reviews/${r.id}`, "PATCH", { decision: "publish", reviewedVersion: String(r.version) }, "Avis publié.")}>
                  Publier
                </button>
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/reviews/${r.id}`, "PATCH", { decision: "reject", reviewedVersion: String(r.version) }, "Avis refusé.")}>
                  Refuser
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Places({ version, act }: { version: number; act: Act }) {
  const { data } = useAdminData<{ places: Array<Json> }>("/api/admin/places", version);
  return (
    <Card title="Lieux">
      <ul className="divide-y divide-line text-sm">
        {data?.places.map((p) => (
          <li key={String(p.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <strong>{String(p.name)}</strong> <span className="text-ink-3">· {String(p.destination_id)} · {String(p.status)} · {String(p.verification)}</span>
            </span>
            <select
              aria-label={`Statut de ${String(p.name)}`}
              className="field max-w-40"
              value={String(p.status)}
              onChange={(e) => void act(`/api/admin/places/${p.id}`, "PATCH", { status: e.target.value }, "Statut mis à jour.")}
            >
              <option value="published">Publié</option>
              <option value="draft">Brouillon</option>
              <option value="archived">Archivé</option>
            </select>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MissionsAndConfig({ version, act }: { version: number; act: Act }) {
  const missions = useAdminData<{ missions: Array<Json> }>("/api/admin/missions", version);
  const config = useAdminData<{ active: { version: number; xp: Record<string, number>; missionXp: Record<string, number> }; history: Array<Json> }>("/api/admin/config", version);
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const xp = draft ?? config.data?.active.xp ?? null;
  return (
    <>
      <Card title="Missions">
        <ul className="divide-y divide-line text-sm">
          {missions.data?.missions.map((m) => (
            <li key={String(m.id)} className="flex items-center justify-between gap-2 py-2">
              <span>
                <strong>{String(m.title)}</strong> <span className="text-ink-3">· {String(m.period)} · {String(m.xp)} XP</span>
              </span>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={Boolean(m.active)} onChange={(e) => void act(`/api/admin/missions/${m.id}`, "PATCH", { active: e.target.checked }, "Mission mise à jour.")} />
                Active
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Barèmes d'XP (version active ${config.data?.active.version ?? "…"})`}>
        <p className="mb-3 text-xs text-ink-3">Une nouvelle version s&apos;applique aux prochaines attributions uniquement ; les écritures déjà créditées ne changent pas. Les seuils de niveaux sont définis dans le code.</p>
        {xp ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act("/api/admin/config", "POST", { xp, missionXp: config.data?.active.missionXp ?? {} }, "Nouvelle version de barème enregistrée.");
              setDraft(null);
            }}
          >
            {Object.entries(xp).map(([key, value]) => (
              <label key={key} className="text-sm font-bold">
                {{ declaredFirstVisit: "Première visite déclarée", checkedFirstVisit: "Première visite contrôlée", proximityBonus: "Bonus de proximité", newParcel: "Nouvelle parcelle" }[key] ?? key}
                <input
                  type="number"
                  min={0}
                  max={200}
                  className="field mt-1"
                  value={value}
                  onChange={(e) => setDraft({ ...xp, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <button type="submit" className="btn btn-primary sm:col-span-2" disabled={!draft}>
              Créer une nouvelle version
            </button>
          </form>
        ) : null}
      </Card>
    </>
  );
}

const emptyAdjustment = () => ({ pseudonym: "", kind: "xp", amount: 0, note: "", adjustmentId: crypto.randomUUID() });

function Adjust({ act }: { act: Act }) {
  // L'identifiant de correction accompagne le formulaire : un double envoi n'est appliqué qu'une fois.
  const [form, setForm] = useState(emptyAdjustment);
  const [pending, setPending] = useState(false);
  return (
    <Card title="Correction d'XP ou de points">
      <p className="mb-3 text-xs text-ink-3">Motif obligatoire, visible par l&apos;utilisateur dans son journal. Un solde de points ne peut pas devenir négatif.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending) return;
          setPending(true);
          const ok = await act("/api/admin/adjustments", "POST", form, "Correction enregistrée et journalisée.");
          setPending(false);
          if (ok) setForm(emptyAdjustment());
        }}
      >
        <label className="text-sm font-bold">
          Pseudonyme
          <input className="field mt-1" value={form.pseudonym} onChange={(e) => setForm({ ...form, pseudonym: e.target.value })} required />
        </label>
        <label className="text-sm font-bold">
          Type
          <select className="field mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="xp">XP</option>
            <option value="points">Points récompense</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Montant (négatif pour retirer)
          <input type="number" className="field mt-1" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required />
        </label>
        <label className="text-sm font-bold">
          Motif
          <input className="field mt-1" value={form.note} minLength={5} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} required />
        </label>
        <button type="submit" className="btn btn-primary sm:col-span-2" disabled={pending}>
          {pending ? "Envoi…" : "Appliquer la correction"}
        </button>
      </form>
    </Card>
  );
}

function Audit({ version }: { version: number }) {
  const { data } = useAdminData<{ entries: Array<Json> }>("/api/admin/audit", version);
  return (
    <Card title="Journal des opérations sensibles">
      <ul className="divide-y divide-line text-sm">
        {data?.entries.map((e) => (
          <li key={String(e.id)} className="py-2">
            <strong>{String(e.action)}</strong> · {String(e.target_type)} {e.target_id ? `· ${String(e.target_id)}` : ""} · par {String(e.admin)} ·{" "}
            <span className="text-ink-3">{new Date(String(e.created_at)).toLocaleString("fr-FR")}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
