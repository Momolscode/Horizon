"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MODE } from "@/config/mode";
import { getDemoCatalog } from "@/modules/catalog/demo";
import { DemoStore, browserStorage } from "@/data/demo-store";
import type { HorizonStore } from "@/data/store";
import type { UserState } from "@/data/user-state";
import type { CatalogIndex } from "@/modules/catalog/catalog";
import { HorizonProvider } from "./providers/HorizonProvider";
import { ConfigErrorScreen } from "./shell/ConfigErrorScreen";
import { AppShell } from "./shell/AppShell";
import { ConnectedRoot } from "./connected/ConnectedRoot";

type Ready = { catalog: CatalogIndex; store: HorizonStore; state: UserState };

function DemoRoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Le stockage du navigateur n'existe que côté client : initialisation après montage.
    Promise.resolve()
      .then(async () => {
        const catalog = getDemoCatalog();
        const { storage, persistent } = browserStorage();
        const store = new DemoStore({ catalog: catalog.catalog, storage, persistent });
        const state = await store.load();
        if (!cancelled) setReady({ catalog, store, state });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Impossible de démarrer la démonstration.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ConfigErrorScreen title="La démonstration n'a pas pu démarrer" problems={[error]} />;
  if (!ready) return <AppLoading />;
  return (
    <HorizonProvider catalog={ready.catalog} store={ready.store} initialState={ready.state}>
      <AppShell>{children}</AppShell>
    </HorizonProvider>
  );
}

export function AppLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg" role="status" aria-live="polite">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-line border-t-coral motion-reduce:animate-none" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink-2">Ouverture du carnet…</p>
    </div>
  );
}

export function AppRoot({ children }: { children: ReactNode }) {
  if (MODE.mode === "demo") return <DemoRoot>{children}</DemoRoot>;
  if (!MODE.ok) {
    return (
      <ConfigErrorScreen
        title="Mode connecté mal configuré"
        problems={MODE.problems}
        hint="L'application ne bascule pas en démonstration : corrigez les variables d'environnement (voir .env.example et README) puis relancez."
      />
    );
  }
  return (
    <ConnectedRoot supabaseUrl={MODE.supabaseUrl} supabaseKey={MODE.supabaseKey}>
      {children}
    </ConnectedRoot>
  );
}
