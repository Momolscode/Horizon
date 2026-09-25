import type { Excursion } from "@/modules/excursions/types";
import type { VisitOutcome, VisitRequest } from "@/modules/progression/engine";
import type { ErrorReport, Settings, UserState } from "./user-state";

/**
 * Contrat unique entre l'interface et les données utilisateur.
 * Implémentations : DemoStore (navigateur) et ConnectedStore (Supabase + API serveur).
 * Les deux partagent la logique métier (src/modules) mais jamais les données.
 */
export type StoreStatus = {
  kind: "demo" | "connected";
  /** false si les données ne survivront pas à un rechargement (stockage indisponible). */
  persistent: boolean;
  /** Où vivent les données, pour l'affichage dans les paramètres. */
  storageLabel: string;
  notice: string | null;
};

export interface HorizonStore {
  status(): StoreStatus;
  load(): Promise<UserState>;
  updateProfile(patch: Partial<UserState["profile"]>): Promise<UserState>;
  updatePreferences(patch: Partial<UserState["preferences"]>): Promise<UserState>;
  updateSettings(patch: Partial<Settings>): Promise<UserState>;
  createCollection(name: string): Promise<UserState>;
  renameCollection(collectionId: string, name: string): Promise<UserState>;
  deleteCollection(collectionId: string): Promise<UserState>;
  togglePlaceInCollection(collectionId: string, placeId: string): Promise<UserState>;
  saveExcursion(excursion: Excursion): Promise<UserState>;
  deleteExcursion(excursionId: string): Promise<UserState>;
  declareVisit(request: VisitRequest): Promise<{ state: UserState; outcome: VisitOutcome }>;
  reportError(report: Omit<ErrorReport, "id" | "createdAt" | "status">): Promise<UserState>;
  markSeen(placeId: string): Promise<UserState>;
  /** Réclame la récompense d'une mission accomplie (vérifiée côté serveur en mode connecté). */
  claimMission(missionId: string): Promise<{ state: UserState; xpGained: number }>;
  /** Démo uniquement : efface toute la progression locale. */
  reset(): Promise<UserState>;
  /** Relit les excursions (Mode Duo : modifications de l'autre personne). Sans effet en démo. */
  refreshExcursions(): Promise<UserState>;
  /** Mode Duo : « nous y étions » sur une étape (connecté uniquement). */
  declareTogether(excursionId: string, placeId: string): Promise<{ state: UserState; outcome: VisitOutcome; requestCreated: boolean }>;
  /** Mode Duo : confirmer ou refuser une visite déclarée pour deux (connecté uniquement). */
  respondDuoVisit(requestId: string, accept: boolean): Promise<{ state: UserState; outcome: VisitOutcome | null }>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "network" | "unauthorized" | "conflict" | "unavailable" | "rate_limited",
    /** État à jour à afficher malgré l'échec (ex. version récente après un conflit Duo). */
    readonly state?: UserState,
  ) {
    super(message);
  }
}
