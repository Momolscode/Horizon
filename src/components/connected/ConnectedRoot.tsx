"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { buildCatalogIndex, type CatalogIndex } from "@/modules/catalog/catalog";
import { ConnectedStore } from "@/data/connected-store";
import type { UserState } from "@/data/user-state";
import { HorizonProvider } from "../providers/HorizonProvider";
import { ConfigErrorScreen } from "../shell/ConfigErrorScreen";
import { AppShell } from "../shell/AppShell";
import { AppLoading } from "../AppRoot";
import { AuthContext, type AuthValue } from "./AuthContext";

type Ready = { catalog: CatalogIndex; store: ConnectedStore; state: UserState; user: AuthValue["user"] };
type Problem = { title: string; problems: string[] };
type BootResult = { kind: "ready"; ready: Ready } | { kind: "problem"; problem: Problem };

async function bootConnected(supabase: SupabaseClient): Promise<BootResult> {
  const problem = (title: string, problems: string[]): BootResult => ({ kind: "problem", problem: { title, problems } });
  const res = await fetch("/api/catalog", { cache: "no-store" }).catch(() => null);
  if (!res) return problem("Connexion impossible", ["Le serveur HORIZON est injoignable. Vérifiez votre connexion puis rechargez la page."]);
  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return problem("Mode connecté mal configuré", [
      body.error === "database_not_configured"
        ? "DATABASE_URL est absente côté serveur : le catalogue ne peut pas être chargé."
        : "La base de données n'a pas répondu ou le catalogue est invalide (voir les journaux serveur).",
    ]);
  }
  if (!res.ok) return problem("Catalogue indisponible", [`Réponse inattendue du serveur (HTTP ${res.status}).`]);
  let catalog: CatalogIndex;
  try {
    catalog = buildCatalogIndex(await res.json());
  } catch (e) {
    return problem("Catalogue invalide", [e instanceof Error ? e.message : "Données de catalogue invalides."]);
  }
  const { data } = await supabase.auth.getUser();
  const user = data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  const store = new ConnectedStore(supabase, catalog.catalog, user?.id ?? null);
  try {
    const state = await store.load();
    return { kind: "ready", ready: { catalog, store, state, user } };
  } catch (e) {
    return problem("Votre compte n'a pas pu être chargé", [e instanceof Error ? e.message : "Erreur inconnue."]);
  }
}

/**
 * Démarrage du mode connecté : catalogue depuis la base, session Supabase, données du compte.
 * Toute erreur est affichée telle quelle ; aucune bascule vers la démonstration.
 */
export function ConnectedRoot({ supabaseUrl, supabaseKey, children }: { supabaseUrl: string; supabaseKey: string; children: ReactNode }) {
  const supabase = useMemo(() => createBrowserClient(supabaseUrl, supabaseKey), [supabaseUrl, supabaseKey]);
  const [ready, setReady] = useState<Ready | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void bootConnected(supabase).then((result) => {
      if (cancelled) return;
      if (result.kind === "problem") setProblem(result.problem);
      else {
        setProblem(null);
        setReady(result.ready);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, generation]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setGeneration((g) => g + 1);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const auth = useMemo<AuthValue>(
    () => ({
      supabase,
      user: ready?.user ?? null,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [supabase, ready?.user],
  );

  if (problem) return <ConfigErrorScreen title={problem.title} problems={problem.problems} hint="L'application ne bascule pas en démonstration : corrigez la configuration ou réessayez." />;
  if (!ready) return <AppLoading />;
  return (
    <AuthContext.Provider value={auth}>
      <HorizonProvider key={`${ready.user?.id ?? "anon"}-${generation}`} catalog={ready.catalog} store={ready.store} initialState={ready.state} requiresAccount={!ready.user}>
        <AppShell>{children}</AppShell>
      </HorizonProvider>
    </AuthContext.Provider>
  );
}
