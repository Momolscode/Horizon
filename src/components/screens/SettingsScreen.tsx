"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellOff, ChevronLeft, Download, Lock, MapPin, ShieldCheck, Trash2 } from "lucide-react";
import { levelForXp } from "@/modules/progression/config";
import { totals } from "@/modules/progression/engine";
import { VISIBILITIES, type Settings, type Visibility } from "@/data/user-state";
import { useHorizon } from "../providers/HorizonProvider";
import { useAuth } from "../connected/AuthContext";
import { Dialog } from "../shell/Dialog";

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="card space-y-3 p-5">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string; locked?: string }>; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="chip" disabled={Boolean(o.locked)} title={o.locked} onClick={() => onChange(o.id)}>
            {o.locked ? <Lock size={13} aria-hidden="true" /> : null}
            {o.label}
            {o.locked ? <span className="sr-only"> (verrouillé : {o.locked})</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const VISIBILITY_LABELS: Record<Visibility, string> = { private: "Privé", friends: "Amis", public: "Public" };

export function SettingsScreen() {
  const { state, status, actions, toast } = useHorizon();
  const s = state.settings;
  const level = levelForXp(totals(state.progression).xp).current.level;
  const [pseudonym, setPseudonym] = useState(state.profile.pseudonym);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [geoPermission, setGeoPermission] = useState<string>("inconnue");
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const auth = useAuth();

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => setGeoPermission({ granted: "accordée", denied: "refusée", prompt: "demandée à chaque usage" }[p.state] ?? p.state))
      .catch(() => setGeoPermission("inconnue"));
  }, []);

  const update = (patch: Partial<Settings>) => void actions.updateSettings(patch);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), mode: status.kind, data: state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `horizon-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Export téléchargé.", "success");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-12 pt-6">
      <Link href="/profil" className="inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft size={18} aria-hidden="true" /> Profil
      </Link>
      <h1 className="text-4xl font-semibold">Paramètres</h1>
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <strong className="text-ink">Où sont vos données ?</strong> {status.storageLabel}.
        {status.kind === "demo" ? " Rien n'est synchronisé ni envoyé à un serveur en démonstration." : " Synchronisées avec votre compte."}
      </p>

      {auth ? (
        <Section title="Compte" id="s-account">
          {auth.user ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-2">Connecté : {auth.user.email}</p>
              <button type="button" className="btn btn-ghost" onClick={() => void auth.signOut()}>
                Se déconnecter
              </button>
            </div>
          ) : (
            <Link href="/connexion" className="btn btn-primary">
              Se connecter ou créer un compte
            </Link>
          )}
        </Section>
      ) : null}

      <Section title="Profil" id="s-profile">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = pseudonym.trim();
            if (value.length < 2 || value.length > 32) return toast("Le pseudonyme doit faire 2 à 32 caractères.", "error");
            if (await actions.updateProfile({ pseudonym: value })) toast("Pseudonyme enregistré.", "success");
          }}
        >
          <label className="sr-only" htmlFor="pseudonym">
            Pseudonyme
          </label>
          <input id="pseudonym" className="field" value={pseudonym} maxLength={32} onChange={(e) => setPseudonym(e.target.value)} />
          <button type="submit" className="btn btn-ghost">
            Enregistrer
          </button>
        </form>
        <p className="text-xs text-ink-3">Un pseudonyme n&apos;est pas une garantie d&apos;anonymat technique.</p>
        <Choice
          label="Visibilité du profil et de l'historique"
          value={state.profile.visibility}
          options={VISIBILITIES.map((v) => ({ id: v, label: VISIBILITY_LABELS[v] }))}
          onChange={(v) => void actions.updateProfile({ visibility: v })}
        />
        <p className="text-xs text-ink-3">
          Privé par défaut. Aucune carte de vos déplacements en temps réel n&apos;existe.{status.kind === "demo" ? " En démonstration, ce réglage n'a pas d'effet : rien n'est partagé." : ""}
        </p>
      </Section>

      {status.kind === "connected" ? (
        <Section title="Mesure d'usage" id="s-analytics">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-[var(--coral)]"
              checked={state.profile.analyticsConsent}
              onChange={(e) => void actions.updateProfile({ analyticsConsent: e.target.checked })}
            />
            <span>
              Aider à améliorer HORIZON
              <span className="block text-xs text-ink-3">
                Enregistre quelques événements (ouverture, favori ajouté, excursion créée, visite déclarée, partage), sans position ni texte libre. Désactivé par défaut, révocable à tout moment.
              </span>
            </span>
          </label>
        </Section>
      ) : null}

      <Section title="Apparence" id="s-appearance">
        <Choice
          label="Thème"
          value={s.theme}
          options={[
            { id: "system", label: "Système" },
            { id: "light", label: "Papier (clair)" },
            { id: "dark", label: "Nuit" },
          ]}
          onChange={(theme) => update({ theme })}
        />
        <Choice
          label="Apparence de la carte"
          value={s.mapTheme}
          options={[
            { id: "auto", label: "Selon le thème" },
            { id: "aurore", label: "Aurore", locked: level < 3 ? "Débloqué au niveau 3" : undefined },
          ]}
          onChange={(mapTheme) => update({ mapTheme })}
        />
        <Choice
          label="Style du passeport"
          value={s.passportStyle}
          options={[
            { id: "classique", label: "Classique" },
            { id: "carnet-nuit", label: "Carnet de nuit", locked: level < 5 ? "Débloqué au niveau 5" : undefined },
          ]}
          onChange={(passportStyle) => update({ passportStyle })}
        />
        <Choice
          label="Animations"
          value={s.motion}
          options={[
            { id: "system", label: "Selon le système" },
            { id: "reduced", label: "Réduites" },
          ]}
          onChange={(motion) => update({ motion })}
        />
        <Choice
          label="Unités"
          value={s.units}
          options={[
            { id: "metric", label: "Kilomètres" },
            { id: "imperial", label: "Miles" },
          ]}
          onChange={(units) => update({ units })}
        />
        <label className="block text-sm font-bold">
          Langue
          <select className="field mt-1" value="fr" disabled aria-describedby="lang-help">
            <option value="fr">Français</option>
          </select>
        </label>
        <p id="lang-help" className="text-xs text-ink-3">
          Seul le français est disponible. La structure est prête pour d&apos;autres langues (voir docs/HANDOVER.md).
        </p>
      </Section>

      <Section title="Notifications" id="s-notifications">
        <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn-ink">
          <BellOff size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Aucune infrastructure de notification n&apos;est configurée dans cette version : aucune notification ne sera envoyée. Vos préférences sont conservées pour le jour où elle le sera.
        </p>
        <fieldset disabled className="space-y-3 opacity-70">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={s.notifications.reminders} readOnly /> Rappels d&apos;excursion
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={s.notifications.changes} readOnly /> Changements pertinents (horaires, météo)
          </label>
          <p className="text-sm">
            Horaires silencieux : {s.notifications.quietHours.start} – {s.notifications.quietHours.end} · au plus {s.notifications.maxPerWeek} par semaine
          </p>
        </fieldset>
      </Section>

      <Section title="Localisation" id="s-location">
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <MapPin size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          HORIZON demande votre position uniquement quand vous touchez « Me localiser », « Autour de vous » ou « Contrôler ma position ». Jamais en arrière-plan, jamais de suivi continu. Pour un contrôle de visite, seules la distance et la précision sont conservées.
        </p>
        <p className="text-sm">
          Autorisation du navigateur : <strong>{geoPermission}</strong> (modifiable dans les réglages du navigateur).
        </p>
      </Section>

      <Section title="Vos données" id="s-data">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={exportData}>
            <Download size={18} aria-hidden="true" /> Exporter (JSON)
          </button>
          <button type="button" className="btn btn-ghost text-danger-ink" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} aria-hidden="true" /> {status.kind === "demo" ? "Effacer les données de démo" : "Supprimer mon compte"}
          </button>
        </div>
        <p className="flex items-start gap-2 text-xs text-ink-3">
          <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> Politique de conservation et de suppression : voir docs/HANDOVER.md § Données personnelles (document de travail à faire valider juridiquement).
        </p>
      </Section>

      <Section title="Assistance" id="s-support">
        {supportEmail ? (
          <a className="btn btn-ghost" href={`mailto:${supportEmail}`}>
            Contacter l&apos;assistance
          </a>
        ) : (
          <p className="text-sm text-ink-2">Aucune adresse d&apos;assistance n&apos;est configurée pour cette installation (variable NEXT_PUBLIC_SUPPORT_EMAIL).</p>
        )}
      </Section>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={status.kind === "demo" ? "Effacer les données de démonstration ?" : "Supprimer votre compte ?"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (await actions.reset()) toast(status.kind === "demo" ? "Données de démonstration effacées." : "Compte supprimé.", "success");
                setConfirmDelete(false);
              }}
            >
              Confirmer
            </button>
          </>
        }
      >
        <p className="text-ink-2">Cette action est irréversible. Pensez à exporter vos données avant.</p>
      </Dialog>
    </div>
  );
}
