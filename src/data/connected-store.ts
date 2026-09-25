import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalog } from "@/modules/catalog/schema";
import { DEFAULT_PREFERENCES, type Excursion } from "@/modules/excursions/types";
import type { ProgressionSnapshot, VisitOutcome, VisitRequest } from "@/modules/progression/engine";
import { StoreError, type HorizonStore, type StoreStatus } from "./store";
import { DEFAULT_SETTINGS, initialUserState, SettingsSchema, UserStateSchema, type ErrorReport, type Settings, type UserState } from "./user-state";
import { TripPreferencesSchema } from "@/modules/excursions/types";

type Row = Record<string, unknown>;

/** Colonnes lisibles par le navigateur (jamais l'identifiant du propriétaire ni du dernier auteur). */
const EXCURSION_COLUMNS = "id, title, destination_id, date, start_time, duration_minutes, preferences, seed, origin, steps, created_at, updated_at, version";

function mapExcursion(r: Row): Excursion {
  const prefs = (r.preferences ?? {}) as Partial<Excursion>;
  return {
    id: String(r.id),
    title: String(r.title),
    destinationId: String(r.destination_id),
    date: String(r.date),
    startTime: String(r.start_time).slice(0, 5),
    durationMinutes: Number(r.duration_minutes),
    party: prefs.party ?? DEFAULT_PREFERENCES.party,
    budget: prefs.budget ?? DEFAULT_PREFERENCES.budget,
    transport: prefs.transport ?? DEFAULT_PREFERENCES.transport,
    interests: prefs.interests ?? DEFAULT_PREFERENCES.interests,
    needs: prefs.needs ?? DEFAULT_PREFERENCES.needs,
    includeMeal: prefs.includeMeal ?? DEFAULT_PREFERENCES.includeMeal,
    seed: (r.seed as number | null) ?? null,
    origin: r.origin as Excursion["origin"],
    steps: (r.steps as Excursion["steps"]) ?? [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    version: Number(r.version ?? 1),
  };
}

function mapVisitRow(r: Row) {
  return {
    id: String(r.id),
    placeId: String(r.place_id),
    status: r.status as "declared" | "proximity_checked",
    visitedOn: String(r.visited_on).slice(0, 10),
    createdAt: String(r.created_at),
    idempotencyKey: String(r.idempotency_key),
    proximity: (r.proximity as UserState["progression"]["visits"][number]["proximity"]) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

/**
 * Données d'un compte réel. Lectures et écritures « de préparation » via supabase-js
 * sous RLS ; la progression passe exclusivement par l'API serveur (/api/visits).
 */
export class ConnectedStore implements HorizonStore {
  private state: UserState;
  private notice: string | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly catalog: Catalog,
    private readonly userId: string | null,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    this.state = initialUserState(new Date(), "Invité");
  }

  status(): StoreStatus {
    return {
      kind: "connected",
      persistent: Boolean(this.userId),
      storageLabel: this.userId ? "Votre compte HORIZON (base de données, synchronisée entre appareils)" : "Aucune donnée enregistrée : vous n'êtes pas connecté",
      notice: this.notice,
    };
  }

  /** Mesure d'usage : envoyée seulement avec le consentement explicite (le serveur revérifie). */
  track(name: "app_open" | "first_discovery" | "favorite_added" | "excursion_created" | "visit_declared" | "visit_checked" | "share_created", props: Record<string, string | number | boolean> = {}) {
    if (!this.userId || !this.state.profile.analyticsConsent) return;
    void this.fetchImpl("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, props }),
    }).catch(() => undefined);
  }

  private requireUser(): string {
    if (!this.userId) throw new StoreError("Connectez-vous pour enregistrer vos données.", "unauthorized");
    return this.userId;
  }

  private fail(error: { message: string; code?: string } | null, fallback: string): never {
    const code = error?.code === "42501" ? "unauthorized" : error?.code === "23514" ? "validation" : "network";
    throw new StoreError(error?.code === "23514" ? `${fallback} (données refusées par le serveur)` : fallback, code);
  }

  async load(): Promise<UserState> {
    if (!this.userId) return this.state;
    const uid = this.userId;
    const [profile, collections, items, excursions, visits, parcels, ledger, badges, reports] = await Promise.all([
      this.supabase.from("profiles").select("*").eq("id", uid).single(),
      this.supabase.from("collections").select("*").order("created_at"),
      this.supabase.from("collection_items").select("*"),
      this.supabase.from("excursions").select(EXCURSION_COLUMNS).order("date"),
      this.supabase.from("visits").select("*").order("created_at"),
      this.supabase.from("parcels").select("*"),
      this.supabase.from("xp_ledger").select("*").order("created_at"),
      this.supabase.from("badges_awarded").select("*"),
      this.supabase.from("error_reports").select("*").order("created_at"),
    ]);
    const firstError = [profile, collections, items, excursions, visits, parcels, ledger, badges, reports].find((r) => r.error)?.error;
    if (firstError || !profile.data) this.fail(firstError ?? null, "Impossible de charger votre compte");

    let collectionRows = (collections.data ?? []) as Row[];
    if (!collectionRows.some((c) => c.is_default)) {
      const created = await this.supabase.from("collections").insert({ name: "Favoris", is_default: true }).select().single();
      if (created.error) this.fail(created.error, "Impossible de créer la collection Favoris");
      collectionRows = [created.data as Row, ...collectionRows];
    }
    const itemRows = (items.data ?? []) as Row[];
    const p = profile.data as Row;
    const prefs = (p.preferences ?? {}) as Record<string, unknown>;
    const trip = TripPreferencesSchema.safeParse(prefs.trip);
    const settings = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...((p.settings ?? {}) as object) });

    const next: UserState = {
      schemaVersion: 1,
      profile: {
        pseudonym: String(p.pseudonym),
        visibility: p.visibility as UserState["profile"]["visibility"],
        createdAt: String(p.created_at),
        analyticsConsent: Boolean(p.analytics_consent),
      },
      preferences: {
        onboarded: Boolean(prefs.onboarded),
        trip: trip.success ? trip.data : DEFAULT_PREFERENCES,
        availableMinutes: typeof prefs.availableMinutes === "number" ? prefs.availableMinutes : 300,
        homeDestinationId: typeof prefs.homeDestinationId === "string" ? prefs.homeDestinationId : null,
      },
      settings: settings.success ? settings.data : DEFAULT_SETTINGS,
      collections: collectionRows
        .sort((a, b) => Number(b.is_default) - Number(a.is_default))
        .map((c) => ({
          id: String(c.id),
          name: String(c.name),
          placeIds: itemRows.filter((i) => i.collection_id === c.id).map((i) => String(i.place_id)),
          createdAt: String(c.created_at),
        })),
      excursions: ((excursions.data ?? []) as Row[]).map(mapExcursion),
      progression: {
        visits: ((visits.data ?? []) as Row[]).map(mapVisitRow),
        parcels: ((parcels.data ?? []) as Row[]).map((r) => ({
          cell: String(r.cell),
          resolution: Number(r.resolution),
          state: r.state as "declared" | "checked",
          firstRevealedAt: String(r.first_revealed_at),
          placeId: String(r.place_id),
        })),
        ledger: ((ledger.data ?? []) as Row[]).map((r) => ({
          id: String(r.id),
          kind: r.kind as "xp" | "points",
          amount: Number(r.amount),
          reason: r.reason as UserState["progression"]["ledger"][number]["reason"],
          refId: String(r.ref_id),
          uniqueKey: String(r.unique_key),
          createdAt: String(r.created_at),
        })),
        badges: ((badges.data ?? []) as Row[]).map((r) => ({ id: String(r.badge_id), awardedAt: String(r.awarded_at) })),
      },
      reports: ((reports.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        placeId: String(r.place_id),
        kind: r.kind as ErrorReport["kind"],
        message: String(r.message),
        createdAt: String(r.created_at),
        status: "submitted" as const,
      })),
      seenPlaceIds: (p.seen_place_ids as string[]) ?? [],
    };
    this.state = UserStateSchema.parse(next);
    return this.state;
  }

  private defaultCollectionId(): string | null {
    return this.state.collections[0]?.id ?? null;
  }

  async updateProfile(patch: Partial<UserState["profile"]>) {
    const uid = this.requireUser();
    const update: Row = {};
    if (patch.pseudonym !== undefined) update.pseudonym = patch.pseudonym;
    if (patch.visibility !== undefined) update.visibility = patch.visibility;
    if (patch.analyticsConsent !== undefined) update.analytics_consent = patch.analyticsConsent;
    const { error } = await this.supabase.from("profiles").update(update).eq("id", uid);
    if (error) {
      if (error.code === "23505") throw new StoreError("Ce pseudonyme est déjà utilisé.", "conflict");
      this.fail(error, "Mise à jour du profil impossible");
    }
    this.state = { ...this.state, profile: { ...this.state.profile, ...patch } };
    return this.state;
  }

  async updatePreferences(patch: Partial<UserState["preferences"]>) {
    const uid = this.requireUser();
    const preferences = { ...this.state.preferences, ...patch };
    const { error } = await this.supabase.from("profiles").update({ preferences }).eq("id", uid);
    if (error) this.fail(error, "Enregistrement des préférences impossible");
    this.state = { ...this.state, preferences };
    return this.state;
  }

  async updateSettings(patch: Partial<Settings>) {
    const uid = this.requireUser();
    const settings = { ...this.state.settings, ...patch };
    const { error } = await this.supabase.from("profiles").update({ settings }).eq("id", uid);
    if (error) this.fail(error, "Enregistrement des paramètres impossible");
    this.state = { ...this.state, settings };
    return this.state;
  }

  async createCollection(name: string) {
    this.requireUser();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) throw new StoreError("Nom de collection invalide (1 à 60 caractères).", "validation");
    const { data, error } = await this.supabase.from("collections").insert({ name: trimmed }).select().single();
    if (error) this.fail(error, "Création de la collection impossible");
    const row = data as Row;
    this.state = { ...this.state, collections: [...this.state.collections, { id: String(row.id), name: trimmed, placeIds: [], createdAt: String(row.created_at) }] };
    return this.state;
  }

  async renameCollection(collectionId: string, name: string) {
    this.requireUser();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) throw new StoreError("Nom de collection invalide (1 à 60 caractères).", "validation");
    const { error } = await this.supabase.from("collections").update({ name: trimmed }).eq("id", collectionId);
    if (error) this.fail(error, "Renommage impossible");
    this.state = { ...this.state, collections: this.state.collections.map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c)) };
    return this.state;
  }

  async deleteCollection(collectionId: string) {
    this.requireUser();
    if (collectionId === this.defaultCollectionId()) throw new StoreError("La collection Favoris ne peut pas être supprimée.", "validation");
    const { error } = await this.supabase.from("collections").delete().eq("id", collectionId);
    if (error) this.fail(error, "Suppression impossible");
    this.state = { ...this.state, collections: this.state.collections.filter((c) => c.id !== collectionId) };
    return this.state;
  }

  async togglePlaceInCollection(collectionId: string, placeId: string) {
    this.requireUser();
    // « favoris » est l'identifiant local de la collection par défaut dans l'interface démo.
    const id = collectionId === "favoris" ? this.defaultCollectionId() : collectionId;
    const collection = this.state.collections.find((c) => c.id === id);
    if (!id || !collection) throw new StoreError("Collection introuvable.", "not_found");
    if (!this.catalog.places.some((p) => p.id === placeId)) throw new StoreError("Lieu inconnu.", "not_found");
    const has = collection.placeIds.includes(placeId);
    const { error } = has
      ? await this.supabase.from("collection_items").delete().eq("collection_id", id).eq("place_id", placeId)
      : await this.supabase.from("collection_items").insert({ collection_id: id, place_id: placeId });
    if (error) this.fail(error, "Enregistrement impossible");
    if (!has) this.track("favorite_added");
    this.state = {
      ...this.state,
      collections: this.state.collections.map((c) => (c.id === id ? { ...c, placeIds: has ? c.placeIds.filter((x) => x !== placeId) : [...c.placeIds, placeId] } : c)),
    };
    return this.state;
  }

  async saveExcursion(excursion: Excursion) {
    this.requireUser();
    const row = {
      id: excursion.id,
      title: excursion.title,
      destination_id: excursion.destinationId,
      date: excursion.date,
      start_time: excursion.startTime,
      duration_minutes: excursion.durationMinutes,
      preferences: {
        party: excursion.party,
        budget: excursion.budget,
        transport: excursion.transport,
        interests: excursion.interests,
        needs: excursion.needs,
        includeMeal: excursion.includeMeal,
      },
      seed: excursion.seed,
      origin: excursion.origin,
      steps: excursion.steps,
    };
    const current = this.state.excursions.find((e) => e.id === excursion.id);
    // Colonnes explicites : l'identifiant n'est jamais modifiable, les dates sont fixées par la base.
    const { id, ...updatable } = row;
    if (!current) {
      const { data, error } = await this.supabase.from("excursions").insert(row).select(EXCURSION_COLUMNS).single();
      if (error) this.fail(error, "Enregistrement de l'excursion impossible");
      this.track("excursion_created", { origin: excursion.origin, steps: excursion.steps.length });
      this.state = { ...this.state, excursions: [...this.state.excursions, mapExcursion(data as Row)] };
      return this.state;
    }
    // Mode Duo : on n'enregistre que si personne n'a modifié l'excursion depuis sa lecture.
    const expected = excursion.version ?? current.version ?? 1;
    const { data, error } = await this.supabase.from("excursions").update(updatable).eq("id", id).eq("version", expected).select(EXCURSION_COLUMNS).maybeSingle();
    if (error) this.fail(error, "Enregistrement de l'excursion impossible");
    if (!data) {
      const fresh = await this.supabase.from("excursions").select(EXCURSION_COLUMNS).eq("id", id).maybeSingle();
      if (fresh.data) {
        const latest = mapExcursion(fresh.data as Row);
        this.state = { ...this.state, excursions: this.state.excursions.map((e) => (e.id === latest.id ? latest : e)) };
        throw new StoreError(
          "L'excursion a été modifiée entre-temps par l'autre personne : voici la version à jour. Vos modifications n'ont pas été enregistrées.",
          "conflict",
          this.state,
        );
      }
      this.state = { ...this.state, excursions: this.state.excursions.filter((e) => e.id !== id) };
      throw new StoreError("Cette excursion ne vous est plus accessible.", "not_found", this.state);
    }
    const saved = mapExcursion(data as Row);
    this.state = { ...this.state, excursions: this.state.excursions.map((e) => (e.id === saved.id ? saved : e)) };
    return this.state;
  }

  async refreshExcursions() {
    if (!this.userId) return this.state;
    const { data, error } = await this.supabase.from("excursions").select(EXCURSION_COLUMNS).order("date");
    if (error) this.fail(error, "Actualisation des excursions impossible");
    this.state = { ...this.state, excursions: ((data ?? []) as Row[]).map(mapExcursion) };
    return this.state;
  }

  private async postJson(path: string, method: "POST" | "PATCH", body: unknown) {
    const res = await this.fetchImpl(path, {
      method,
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res) throw new StoreError("Connexion impossible : rien n'a été enregistré. Réessayez (aucun double crédit possible).", "network");
    const payload = (await res.json().catch(() => ({}))) as { outcome?: VisitOutcome; snapshot?: ProgressionSnapshot; requestCreated?: boolean; kind?: string; message?: string };
    if (res.status === 401) throw new StoreError("Session expirée : reconnectez-vous.", "unauthorized");
    if (res.status === 429) throw new StoreError(payload.message ?? "Trop de visites en peu de temps : réessayez plus tard.", "rate_limited");
    if (!res.ok) throw new StoreError(payload.message ?? "Le serveur n'a pas pu enregistrer l'opération.", res.status === 404 || res.status === 410 ? "not_found" : "validation");
    return payload;
  }

  async declareTogether(excursionId: string, placeId: string) {
    this.requireUser();
    const payload = await this.postJson("/api/duo/visites", "POST", { excursionId, placeId });
    if (!payload.outcome || !payload.snapshot) throw new StoreError("Réponse inattendue du serveur.", "unavailable");
    this.state = { ...this.state, progression: payload.snapshot };
    if (!payload.outcome.duplicate) this.track("visit_declared", { duo: true });
    return { state: this.state, outcome: payload.outcome, requestCreated: Boolean(payload.requestCreated) };
  }

  async respondDuoVisit(requestId: string, accept: boolean) {
    this.requireUser();
    const payload = await this.postJson(`/api/duo/visites/${encodeURIComponent(requestId)}`, "PATCH", { action: accept ? "accept" : "decline" });
    if (payload.kind === "accepted" && payload.snapshot) this.state = { ...this.state, progression: payload.snapshot };
    return { state: this.state, outcome: payload.kind === "accepted" ? (payload.outcome ?? null) : null };
  }

  async deleteExcursion(excursionId: string) {
    this.requireUser();
    const { data, error } = await this.supabase.from("excursions").delete().eq("id", excursionId).select("id");
    if (error) this.fail(error, "Suppression impossible");
    // Sous RLS, une suppression refusée (personne invitée en Duo) ne renvoie aucune ligne.
    if (!data || data.length === 0) throw new StoreError("Seule la personne qui a créé l'excursion peut la supprimer.", "unauthorized");
    this.state = { ...this.state, excursions: this.state.excursions.filter((e) => e.id !== excursionId) };
    return this.state;
  }

  async declareVisit(request: VisitRequest): Promise<{ state: UserState; outcome: VisitOutcome }> {
    this.requireUser();
    let res: Response;
    try {
      res = await this.fetchImpl("/api/visits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(request),
      });
    } catch {
      throw new StoreError("Connexion impossible : la visite n'a pas été enregistrée. Réessayez (aucun double crédit possible).", "network");
    }
    const payload = (await res.json().catch(() => ({}))) as { outcome?: VisitOutcome; snapshot?: ProgressionSnapshot; message?: string; error?: string };
    if (res.status === 401) throw new StoreError("Session expirée : reconnectez-vous.", "unauthorized");
    if (res.status === 429) throw new StoreError("Trop de visites en peu de temps : réessayez plus tard.", "rate_limited");
    if (!res.ok || !payload.outcome || !payload.snapshot) {
      throw new StoreError(payload.message ?? "Le serveur n'a pas pu enregistrer la visite.", res.status === 422 ? "validation" : "unavailable");
    }
    this.state = { ...this.state, progression: payload.snapshot };
    if (!payload.outcome.duplicate) this.track(payload.outcome.visit.status === "proximity_checked" ? "visit_checked" : "visit_declared");
    return { state: this.state, outcome: payload.outcome };
  }

  async reportError(report: Omit<ErrorReport, "id" | "createdAt" | "status">) {
    this.requireUser();
    const { data, error } = await this.supabase
      .from("error_reports")
      .insert({ place_id: report.placeId, kind: report.kind, message: report.message })
      .select()
      .single();
    if (error) this.fail(error, "Envoi du signalement impossible");
    const row = data as Row;
    this.state = { ...this.state, reports: [...this.state.reports, { ...report, id: String(row.id), createdAt: String(row.created_at), status: "submitted" }] };
    return this.state;
  }

  async markSeen(placeId: string) {
    if (!this.userId || this.state.seenPlaceIds.includes(placeId)) return this.state;
    if (this.state.seenPlaceIds.length === 0) this.track("first_discovery");
    const seen = [...this.state.seenPlaceIds, placeId].slice(-500);
    const { error } = await this.supabase.from("profiles").update({ seen_place_ids: seen }).eq("id", this.userId);
    if (!error) this.state = { ...this.state, seenPlaceIds: seen };
    return this.state;
  }

  async claimMission(missionId: string) {
    this.requireUser();
    const res = await this.fetchImpl("/api/missions/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ missionId }),
    }).catch(() => null);
    if (!res) throw new StoreError("Connexion impossible.", "network");
    const payload = (await res.json().catch(() => ({}))) as { snapshot?: ProgressionSnapshot; xpGained?: number; message?: string };
    if (!res.ok || !payload.snapshot) throw new StoreError(payload.message ?? "Mission indisponible.", res.status === 409 ? "conflict" : "validation");
    this.state = { ...this.state, progression: payload.snapshot };
    return { state: this.state, xpGained: payload.xpGained ?? 0 };
  }

  async reset() {
    this.requireUser();
    const res = await this.fetchImpl("/api/account?confirm=SUPPRIMER", { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) throw new StoreError("La suppression du compte a échoué.", "unavailable");
    await this.supabase.auth.signOut();
    this.state = initialUserState(new Date(), "Invité");
    return this.state;
  }
}
