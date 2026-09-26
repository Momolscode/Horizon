"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { formatRatio, type Metrics } from "@/modules/admin/metrics";
import { MODE } from "@/config/mode";

type Tab = "overview" | "reports" | "reviews" | "proposals" | "claims" | "replies" | "places" | "missions" | "adjust" | "audit";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "reports", label: "Signalements" },
  { id: "reviews", label: "Avis" },
  { id: "proposals", label: "Propositions" },
  { id: "claims", label: "Revendications" },
  { id: "replies", label: "Réponses" },
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

function useAdminData<T>(path: string | null, version: number) {
  const [state, setState] = useState<{ status: number; data: T | null }>({ status: -1, data: null });
  useEffect(() => {
    if (!path) return; // démonstration : aucune requête vers une API absente
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
  const id = useId();
  return (
    <section className="card p-4" aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>("overview");
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const overview = useAdminData<{ counts: Record<string, number>; metrics: Metrics; mail: MailStatus }>(MODE.mode === "connected" ? "/api/admin/overview" : null, version);

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
        {tab === "overview" && overview.data ? <Overview counts={overview.data.counts} metrics={overview.data.metrics} mail={overview.data.mail} act={act} /> : null}
        {tab === "reports" ? <Reports version={version} act={act} /> : null}
        {tab === "reviews" ? <Reviews version={version} act={act} /> : null}
        {tab === "proposals" ? <Proposals version={version} act={act} /> : null}
        {tab === "claims" ? <Claims version={version} act={act} /> : null}
        {tab === "replies" ? <Replies version={version} act={act} /> : null}
        {tab === "places" ? <Places version={version} act={act} /> : null}
        {tab === "missions" ? <MissionsAndConfig version={version} act={act} /> : null}
        {tab === "adjust" ? <Adjust act={act} /> : null}
        {tab === "audit" ? <Audit version={version} /> : null}
      </div>
    </main>
  );
}

type Act = (path: string, method: "PATCH" | "POST", body: Json, success: string) => Promise<boolean>;

type MailStatus = { configured: boolean; siteUrlConfigured: boolean; pending: number; failed: number; sent_7d: number; last_error: string | null };

function MailCard({ mail, act }: { mail: MailStatus; act: Act }) {
  return (
    <Card title="E-mails de notification">
      {!mail.configured ? (
        <p className="mb-2 rounded-xl bg-warn-soft px-3 py-2 text-sm font-bold text-warn-ink">
          SMTP non configuré (variables SMTP_URL et MAIL_FROM) : aucun e-mail n&apos;est envoyé. Les e-mails restent en file et partiront une fois la configuration faite.
        </p>
      ) : null}
      {mail.configured && !mail.siteUrlConfigured ? <p className="mb-2 text-xs text-ink-3">SITE_URL absente : les e-mails ne contiennent pas de lien vers l&apos;application.</p> : null}
      <p className="text-sm">
        {mail.pending} en attente · {mail.failed} abandonné{mail.failed > 1 ? "s" : ""} après plusieurs tentatives · {mail.sent_7d} envoyé{mail.sent_7d > 1 ? "s" : ""} sur 7 jours
      </p>
      {mail.last_error ? <p className="mt-1 text-xs text-danger-ink">Dernière erreur : {mail.last_error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" disabled={!mail.configured || !mail.pending} onClick={() => void act("/api/admin/emails", "POST", { retryFailed: false }, "Envoi effectué.")}>
          Envoyer maintenant
        </button>
        <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" disabled={!mail.configured || !mail.failed} onClick={() => void act("/api/admin/emails", "POST", { retryFailed: true }, "E-mails abandonnés remis en file et envoi effectué.")}>
          Relancer les abandonnés
        </button>
      </div>
    </Card>
  );
}

function Overview({ counts, metrics, mail, act }: { counts: Record<string, number>; metrics: Metrics; mail: MailStatus; act: Act }) {
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
      <MailCard mail={mail} act={act} />
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

function Proposals({ version, act }: { version: number; act: Act }) {
  const { data } = useAdminData<{ proposals: Array<Json> }>("/api/admin/propositions", version);
  return (
    <Card title="Propositions de lieux">
      <p className="mb-3 text-xs text-ink-3">Publier ajoute le lieu au catalogue, marqué « proposé par un membre, non vérifié ». Vérifiez l&apos;absence de publicité et de doublon.</p>
      {!data?.proposals.length ? (
        <p className="text-sm text-ink-3">Aucune proposition en attente.</p>
      ) : (
        <ul className="space-y-2">
          {data.proposals.map((p) => {
            const payload = (p.payload ?? {}) as Json;
            const dups = (p.duplicate_of as string[] | undefined) ?? [];
            return (
              <li key={String(p.id)} className="rounded-2xl border border-line p-3 text-sm">
                <p className="font-bold">
                  {String(p.name)} · {String(p.category)} · {String(p.destination_id)} · par {String(p.pseudonym)}
                </p>
                <p className="text-ink-2">{String(payload.summary ?? "")}</p>
                <p className="text-xs text-ink-3">
                  {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
                  {payload.website ? ` · ${String(payload.website)}` : ""} · prix : {String(payload.price)}
                </p>
                {dups.length ? <p className="mt-1 text-xs font-bold text-warn-ink">Doublon possible signalé à l&apos;envoi : {dups.join(", ")} (la personne a confirmé qu&apos;il s&apos;agit d&apos;un autre lieu).</p> : null}
                <div className="mt-2 flex gap-2">
                  <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/propositions/${p.id}`, "PATCH", { decision: "approve" }, "Lieu publié.")}>
                    Publier
                  </button>
                  <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/propositions/${p.id}`, "PATCH", { decision: "reject", reason: dups.length ? "Doublon d'un lieu existant" : "Proposition non retenue" }, "Proposition refusée.")}>
                    Refuser
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Claims({ version, act }: { version: number; act: Act }) {
  const { status, data } = useAdminData<{ claims: Array<Json>; managers: Array<Json> }>("/api/admin/revendications", version);
  if (!data) {
    return (
      <Card title="Revendications et fiches gérées">
        <p className="text-sm text-ink-3">{status === -1 ? "Chargement…" : `Chargement impossible (${status || "réseau"}). Réessayez.`}</p>
      </Card>
    );
  }
  return (
    <>
      <PendingClaims claims={data.claims} act={act} />
      <ManagedPlaces managers={data.managers} act={act} />
    </>
  );
}

const CLAIM_REJECTION_REASONS = [
  "Justificatif insuffisant",
  "SIRET introuvable ou sans lien avec ce lieu",
  "Adresse e-mail sans rapport avec l'établissement",
  "Preuve impossible à vérifier",
];

function RejectClaimForm({ claim, onCancel, onConfirm }: { claim: Json; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(CLAIM_REJECTION_REASONS[0]!);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const id = `reject-${String(claim.id)}`;
  const valid = reason.trim().length >= 3;
  return (
    <form
      className="mt-2 space-y-2 rounded-2xl bg-warn-soft p-3"
      aria-label={`Refuser la demande de ${String(claim.pseudonym)}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || sending.current) return;
        sending.current = true;
        setBusy(true);
        await onConfirm(reason.trim());
        sending.current = false;
        setBusy(false);
      }}
    >
      <label className="block text-xs font-bold" htmlFor={`${id}-reason`}>
        Motif du refus (affiché au demandeur et envoyé par e-mail)
      </label>
      <input id={`${id}-reason`} className="field mt-1" list={`${id}-choices`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      <datalist id={`${id}-choices`}>
        {CLAIM_REJECTION_REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary min-h-9 px-3 text-xs" disabled={!valid || busy}>
          Confirmer le refus
        </button>
        <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function PendingClaims({ claims, act }: { claims: Array<Json>; act: Act }) {
  const data = { claims };
  const [rejecting, setRejecting] = useState<string | null>(null);
  return (
    <Card title="Revendications de fiches">
      <p className="mb-3 text-xs text-ink-3">
        Contrôle manuel : l&apos;établissement doit exister à l&apos;adresse du lieu (base Sirene) et la preuve doit être crédible. Lien vers l&apos;Annuaire des entreprises fourni à titre d&apos;aide (format non vérifié hors ligne).
      </p>
      {!data?.claims.length ? (
        <p className="text-sm text-ink-3">Aucune demande en attente.</p>
      ) : (
        <ul className="space-y-2">
          {data.claims.map((c) => (
            <li key={String(c.id)} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-bold">
                {String(c.place_name)} · demandé par {String(c.pseudonym)}
              </p>
              <p className="text-ink-2">
                SIRET{" "}
                <a className="underline" href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${String(c.siret)}`} target="_blank" rel="noopener noreferrer">
                  {String(c.siret)}
                </a>{" "}
                · preuve ({c.proof_kind === "email_domain" ? "e-mail du domaine" : "justificatif"}) : {String(c.proof_text)}
              </p>
              {Number(c.own_reviews) > 0 ? (
                <p className="mt-1 text-xs font-bold text-warn-ink">
                  Cette personne a déposé un avis sur ce lieu : il sera retiré si vous validez la demande (un établissement ne note pas sa fiche).
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/revendications/${c.id}`, "PATCH", { decision: "approve" }, "Revendication validée.")}>
                  Valider
                </button>
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => setRejecting(String(c.id))}>
                  Refuser…
                </button>
              </div>
              {rejecting === String(c.id) ? (
                <RejectClaimForm
                  claim={c}
                  onCancel={() => setRejecting(null)}
                  onConfirm={async (reason) => {
                    if (await act(`/api/admin/revendications/${c.id}`, "PATCH", { decision: "reject", reason }, "Revendication refusée.")) setRejecting(null);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ManagedPlaces({ managers, act }: { managers: Array<Json>; act: Act }) {
  const [revoking, setRevoking] = useState<string | null>(null);
  return (
    <Card title="Fiches gérées">
      <p className="mb-3 text-xs text-ink-3">
        Retirer la gestion rend la fiche de nouveau revendicable. L&apos;établissement ne peut plus modifier la fiche ni répondre aux avis ; ses réponses en attente sont refusées. Sans les options ci-dessous, ses informations et ses réponses publiées restent affichées. L&apos;ancien gestionnaire ne pourra toujours pas noter la fiche.
      </p>
      {!managers.length ? (
        <p className="text-sm text-ink-3">Aucune fiche gérée par un établissement.</p>
      ) : (
        <ul className="space-y-2">
          {managers.map((m) => {
            const id = String(m.id);
            return (
              <li key={id} className="rounded-2xl border border-line p-3 text-sm">
                <p className="font-bold">
                  {String(m.place_name)} · géré par {String(m.pseudonym)}
                  {m.place_status !== "published" ? ` · lieu ${String(m.place_status)}` : ""}
                </p>
                <p className="text-ink-2">
                  SIRET {String(m.siret)} · validé le {m.reviewed_at ? new Date(String(m.reviewed_at)).toLocaleDateString("fr-FR") : "?"} · {m.has_info ? "informations « fournies par l'établissement » sur la fiche" : "aucune information « fournie par l'établissement »"} ·{" "}
                  {Number(m.published_replies)} réponse{Number(m.published_replies) > 1 ? "s" : ""} publiée{Number(m.published_replies) > 1 ? "s" : ""}
                </p>
                {revoking === id ? (
                  <RevokeForm
                    manager={m}
                    onCancel={() => setRevoking(null)}
                    onConfirm={async (body) => {
                      if (await act(`/api/admin/revendications/${id}`, "PATCH", { decision: "revoke", ...body }, `Gestion retirée : ${String(m.place_name)}.`)) setRevoking(null);
                    }}
                  />
                ) : (
                  <button type="button" className="btn btn-ghost mt-2 min-h-9 px-3 text-xs" onClick={() => setRevoking(id)}>
                    Retirer la gestion…
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RevokeForm({ manager, onCancel, onConfirm }: { manager: Json; onCancel: () => void; onConfirm: (body: { reason: string; removeReplies: boolean; clearInfo: boolean }) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [removeReplies, setRemoveReplies] = useState(false);
  const [clearInfo, setClearInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // garde synchrone contre le double envoi
  const valid = reason.trim().length >= 3;
  const formId = `revoke-${String(manager.id)}`;
  return (
    <form
      className="mt-2 space-y-2 rounded-2xl bg-warn-soft p-3"
      aria-label={`Retirer la gestion de ${String(manager.place_name)}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || sending.current) return;
        sending.current = true;
        setBusy(true);
        await onConfirm({ reason: reason.trim(), removeReplies, clearInfo });
        sending.current = false;
        setBusy(false);
      }}
    >
      <label className="block text-xs font-bold" htmlFor={`${formId}-reason`}>
        Motif (obligatoire, visible par l&apos;établissement)
      </label>
      <input id={`${formId}-reason`} className="field mt-1" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : établissement fermé, changement de propriétaire…" />
      <label className="flex min-h-9 items-center gap-2 text-xs">
        <input type="checkbox" className="h-5 w-5" checked={clearInfo} onChange={(e) => setClearInfo(e.target.checked)} disabled={!manager.has_info} />
        Effacer les informations marquées « fournies par l&apos;établissement » sur la fiche, y compris celles d&apos;un gestionnaire précédent (elles redeviennent « inconnues »)
      </label>
      <label className="flex min-h-9 items-center gap-2 text-xs">
        <input type="checkbox" className="h-5 w-5" checked={removeReplies} onChange={(e) => setRemoveReplies(e.target.checked)} disabled={!Number(manager.published_replies)} />
        Retirer ses réponses publiées aux avis
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary min-h-9 px-3 text-xs" disabled={!valid || busy}>
          Confirmer le retrait
        </button>
        <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Replies({ version, act }: { version: number; act: Act }) {
  const { data } = useAdminData<{ replies: Array<Json> }>("/api/admin/reponses", version);
  return (
    <Card title="Réponses des établissements">
      {!data?.replies.length ? (
        <p className="text-sm text-ink-3">Aucune réponse en attente.</p>
      ) : (
        <ul className="space-y-2">
          {data.replies.map((r) => (
            <li key={String(r.review_id)} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-bold">
                {String(r.place_name)} · avis {"★".repeat(Number(r.rating))}
              </p>
              <p className="text-ink-3">Avis : {String(r.review_body)}</p>
              <p className="mt-1 text-ink-2">Réponse : {String(r.body)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/reponses/${r.review_id}`, "PATCH", { decision: "publish", reviewedVersion: String(r.version) }, "Réponse publiée.")}>
                  Publier
                </button>
                <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" onClick={() => void act(`/api/admin/reponses/${r.review_id}`, "PATCH", { decision: "reject", reviewedVersion: String(r.version) }, "Réponse refusée.")}>
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
              {r.author_manages ? <p className="mt-1 text-xs font-bold text-warn-ink">L&apos;auteur gère ou a géré la fiche de ce lieu : cet avis ne peut pas être publié (conflit d&apos;intérêts).</p> : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost min-h-9 px-3 text-xs"
                  disabled={Boolean(r.author_manages)}
                  onClick={() => void act(`/api/admin/reviews/${r.id}`, "PATCH", { decision: "publish", reviewedVersion: String(r.version) }, "Avis publié.")}
                >
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
