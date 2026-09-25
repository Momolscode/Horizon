import type { Catalog } from "@/modules/catalog/schema";
import { ExcursionSchema, type Excursion } from "@/modules/excursions/types";
import { applyOutcome, planVisit, type VisitRequest } from "@/modules/progression/engine";
import { StoreError, type HorizonStore, type StoreStatus } from "./store";
import { initialUserState, UserStateSchema, type ErrorReport, type Settings, type UserState } from "./user-state";

export const DEMO_STORAGE_KEY = "horizon:demo:v1";

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Stockage du navigateur si disponible ; sinon mémoire (signalé à l'utilisateur). */
export function browserStorage(): { storage: KeyValueStorage; persistent: boolean } {
  try {
    const probe = "horizon:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}

type Deps = {
  catalog: Catalog;
  storage: KeyValueStorage;
  persistent: boolean;
  now?: () => Date;
  newId?: () => string;
};

/**
 * Données de démonstration : tout reste dans ce navigateur. La logique de
 * progression est la même qu'en mode connecté, mais rien n'est validé par un serveur.
 */
export class DemoStore implements HorizonStore {
  private state: UserState;
  private notice: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.state = this.read();
  }

  status(): StoreStatus {
    return {
      kind: "demo",
      persistent: this.deps.persistent,
      storageLabel: this.deps.persistent ? "Ce navigateur uniquement (stockage local)" : "Mémoire temporaire : perdue au rechargement",
      notice: this.notice,
    };
  }

  private read(): UserState {
    let raw: string | null = null;
    try {
      raw = this.deps.storage.getItem(DEMO_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return initialUserState(this.now(), "Voyageur démo");
    try {
      const parsed = UserStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // JSON illisible
    }
    // Données corrompues ou d'un ancien format : on les met de côté, on repart proprement.
    try {
      this.deps.storage.setItem(`${DEMO_STORAGE_KEY}:corrompu`, raw);
    } catch {
      // ignoré
    }
    this.notice = "Les données de démonstration enregistrées étaient illisibles : elles ont été mises de côté et une nouvelle démo a démarré.";
    return initialUserState(this.now(), "Voyageur démo");
  }

  private write(next: UserState): UserState {
    const validated = UserStateSchema.parse(next);
    this.state = validated;
    try {
      this.deps.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(validated));
    } catch {
      this.notice = "Le stockage local est plein ou indisponible : les derniers changements ne survivront pas au rechargement.";
    }
    return validated;
  }

  /** Sérialise les opérations (double clic, onglets rapides). */
  private run<T>(fn: () => T): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  load(): Promise<UserState> {
    return Promise.resolve(this.state);
  }

  updateProfile(patch: Partial<UserState["profile"]>) {
    return this.run(() => this.write({ ...this.state, profile: { ...this.state.profile, ...patch } }));
  }

  updatePreferences(patch: Partial<UserState["preferences"]>) {
    return this.run(() => this.write({ ...this.state, preferences: { ...this.state.preferences, ...patch } }));
  }

  updateSettings(patch: Partial<Settings>) {
    return this.run(() => this.write({ ...this.state, settings: { ...this.state.settings, ...patch } }));
  }

  createCollection(name: string) {
    return this.run(() => {
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 60) throw new StoreError("Nom de collection invalide (1 à 60 caractères).", "validation");
      if (this.state.collections.length >= 30) throw new StoreError("Nombre maximal de collections atteint (30).", "validation");
      return this.write({
        ...this.state,
        collections: [...this.state.collections, { id: this.newId(), name: trimmed, placeIds: [], createdAt: this.now().toISOString() }],
      });
    });
  }

  renameCollection(collectionId: string, name: string) {
    return this.run(() => {
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 60) throw new StoreError("Nom de collection invalide (1 à 60 caractères).", "validation");
      return this.write({ ...this.state, collections: this.state.collections.map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c)) });
    });
  }

  deleteCollection(collectionId: string) {
    return this.run(() => this.write({ ...this.state, collections: this.state.collections.filter((c) => c.id !== collectionId) }));
  }

  togglePlaceInCollection(collectionId: string, placeId: string) {
    return this.run(() => {
      if (!this.deps.catalog.places.some((p) => p.id === placeId)) throw new StoreError("Lieu inconnu.", "not_found");
      const collection = this.state.collections.find((c) => c.id === collectionId);
      if (!collection) throw new StoreError("Collection introuvable.", "not_found");
      const has = collection.placeIds.includes(placeId);
      return this.write({
        ...this.state,
        collections: this.state.collections.map((c) =>
          c.id === collectionId ? { ...c, placeIds: has ? c.placeIds.filter((id) => id !== placeId) : [...c.placeIds, placeId] } : c,
        ),
      });
    });
  }

  saveExcursion(excursion: Excursion) {
    return this.run(() => {
      const parsed = ExcursionSchema.safeParse(excursion);
      if (!parsed.success) throw new StoreError("Excursion invalide.", "validation");
      const exists = this.state.excursions.some((e) => e.id === excursion.id);
      const updated = { ...parsed.data, updatedAt: this.now().toISOString() };
      return this.write({
        ...this.state,
        excursions: exists ? this.state.excursions.map((e) => (e.id === excursion.id ? updated : e)) : [updated, ...this.state.excursions],
      });
    });
  }

  deleteExcursion(excursionId: string) {
    return this.run(() => this.write({ ...this.state, excursions: this.state.excursions.filter((e) => e.id !== excursionId) }));
  }

  declareVisit(request: VisitRequest) {
    return this.run(() => {
      const outcome = planVisit(request, this.state.progression, this.deps.catalog, { now: this.now(), newId: this.newId, mode: "demo" });
      const state = outcome.duplicate ? this.state : this.write({ ...this.state, progression: applyOutcome(this.state.progression, outcome) });
      return { state, outcome };
    });
  }

  reportError(report: Omit<ErrorReport, "id" | "createdAt" | "status">) {
    return this.run(() =>
      this.write({
        ...this.state,
        reports: [...this.state.reports, { ...report, id: this.newId(), createdAt: this.now().toISOString(), status: "stored_locally" }],
      }),
    );
  }

  markSeen(placeId: string) {
    return this.run(() =>
      this.state.seenPlaceIds.includes(placeId) ? this.state : this.write({ ...this.state, seenPlaceIds: [...this.state.seenPlaceIds, placeId] }),
    );
  }

  reset() {
    return this.run(() => {
      try {
        this.deps.storage.removeItem(DEMO_STORAGE_KEY);
      } catch {
        // ignoré
      }
      this.notice = null;
      return this.write(initialUserState(this.now(), "Voyageur démo"));
    });
  }
}

export function createMemoryStorage(): KeyValueStorage {
  return memoryStorage();
}
