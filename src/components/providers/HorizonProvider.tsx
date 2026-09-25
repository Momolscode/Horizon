"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogIndex } from "@/modules/catalog/catalog";
import type { VisitOutcome, VisitRequest } from "@/modules/progression/engine";
import type { Excursion } from "@/modules/excursions/types";
import type { HorizonStore, StoreStatus } from "@/data/store";
import type { ErrorReport, Settings, UserState } from "@/data/user-state";

export type Toast = { id: number; message: string; tone: "info" | "success" | "error" };

export type RevealEvent = { id: number; placeId: string; outcome: VisitOutcome };

export type HorizonContextValue = {
  catalog: CatalogIndex;
  state: UserState;
  status: StoreStatus;
  /** Session requise pour les actions personnelles (mode connecté, utilisateur non connecté). */
  requiresAccount: boolean;
  busy: boolean;
  toasts: Toast[];
  reveal: RevealEvent | null;
  clearReveal: () => void;
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  actions: {
    updateProfile: (patch: Partial<UserState["profile"]>) => Promise<boolean>;
    updatePreferences: (patch: Partial<UserState["preferences"]>) => Promise<boolean>;
    updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
    createCollection: (name: string) => Promise<boolean>;
    renameCollection: (id: string, name: string) => Promise<boolean>;
    deleteCollection: (id: string) => Promise<boolean>;
    togglePlaceInCollection: (collectionId: string, placeId: string) => Promise<boolean>;
    saveExcursion: (excursion: Excursion) => Promise<boolean>;
    deleteExcursion: (id: string) => Promise<boolean>;
    declareVisit: (request: VisitRequest) => Promise<VisitOutcome | null>;
    reportError: (report: Omit<ErrorReport, "id" | "createdAt" | "status">) => Promise<boolean>;
    markSeen: (placeId: string) => Promise<void>;
    claimMission: (missionId: string) => Promise<number | null>;
    reset: () => Promise<boolean>;
  };
};

const HorizonContext = createContext<HorizonContextValue | null>(null);

export function useHorizon(): HorizonContextValue {
  const value = useContext(HorizonContext);
  if (!value) throw new Error("useHorizon doit être utilisé dans <HorizonProvider>.");
  return value;
}

function applyAppearance(settings: Settings) {
  const root = document.documentElement;
  const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-map-theme", settings.mapTheme);
  if (settings.motion === "reduced") root.setAttribute("data-motion", "reduced");
  else root.removeAttribute("data-motion");
  try {
    localStorage.setItem("horizon:theme", settings.theme);
    localStorage.setItem("horizon:motion", settings.motion);
  } catch {
    // Préférence d'affichage non mémorisée : sans conséquence.
  }
}

export function HorizonProvider({
  catalog,
  store,
  initialState,
  requiresAccount = false,
  children,
}: {
  catalog: CatalogIndex;
  store: HorizonStore;
  initialState: UserState;
  requiresAccount?: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<UserState>(initialState);
  const [status, setStatus] = useState<StoreStatus>(() => store.status());
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reveal, setReveal] = useState<RevealEvent | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  useEffect(() => {
    applyAppearance(state.settings);
    if (state.settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(state.settings);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [state.settings]);

  useEffect(() => {
    const notice = store.status().notice;
    if (notice) toast(notice, "error");
  }, [store, toast]);

  const guard = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (requiresAccount) {
        toast("Connectez-vous pour enregistrer vos données.", "info");
        return null;
      }
      setBusy(true);
      try {
        const result = await fn();
        setStatus(store.status());
        return result;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Une erreur est survenue.", "error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [requiresAccount, store, toast],
  );

  const actions = useMemo<HorizonContextValue["actions"]>(() => {
    const wrap =
      <A extends unknown[]>(fn: (...args: A) => Promise<UserState>) =>
      async (...args: A) => {
        const next = await guard(() => fn(...args));
        if (next) setState(next);
        return next !== null;
      };
    return {
      updateProfile: wrap((p) => store.updateProfile(p)),
      updatePreferences: wrap((p) => store.updatePreferences(p)),
      updateSettings: wrap((p) => store.updateSettings(p)),
      createCollection: wrap((n) => store.createCollection(n)),
      renameCollection: wrap((id, n) => store.renameCollection(id, n)),
      deleteCollection: wrap((id) => store.deleteCollection(id)),
      togglePlaceInCollection: wrap((c, p) => store.togglePlaceInCollection(c, p)),
      saveExcursion: wrap((e) => store.saveExcursion(e)),
      deleteExcursion: wrap((id) => store.deleteExcursion(id)),
      reportError: wrap((r) => store.reportError(r)),
      reset: wrap(() => store.reset()),
      markSeen: async (placeId: string) => {
        if (requiresAccount) return;
        try {
          setState(await store.markSeen(placeId));
        } catch {
          // Non bloquant : le suivi des fiches vues n'est qu'un confort.
        }
      },
      claimMission: async (missionId: string) => {
        const result = await guard(() => store.claimMission(missionId));
        if (!result) return null;
        setState(result.state);
        return result.xpGained;
      },
      declareVisit: async (request: VisitRequest) => {
        const result = await guard(() => store.declareVisit(request));
        if (!result) return null;
        setState(result.state);
        if (!result.outcome.duplicate) setReveal({ id: Date.now(), placeId: request.placeId, outcome: result.outcome });
        return result.outcome;
      },
    };
  }, [guard, requiresAccount, store]);

  const value = useMemo<HorizonContextValue>(
    () => ({
      catalog,
      state,
      status,
      requiresAccount,
      busy,
      toasts,
      reveal,
      clearReveal: () => setReveal(null),
      toast,
      dismissToast,
      actions,
    }),
    [catalog, state, status, requiresAccount, busy, toasts, reveal, toast, dismissToast, actions],
  );

  return <HorizonContext.Provider value={value}>{children}</HorizonContext.Provider>;
}
