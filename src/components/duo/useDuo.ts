"use client";

import { useCallback, useEffect, useState } from "react";
import type { DuoOverview } from "@/server/duo";
import { useHorizon } from "../providers/HorizonProvider";

export type { DuoOverview };

/**
 * État Duo du compte connecté (invitations, excursions à deux, visites à confirmer),
 * relu à l'ouverture et à chaque retour sur l'onglet. Inactif en démonstration.
 */
export function useDuo() {
  const { status, requiresAccount } = useHorizon();
  const enabled = status.kind === "connected" && !requiresAccount;
  const [overview, setOverview] = useState<DuoOverview | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch("/api/duo", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DuoOverview>) : null))
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  const call = useCallback(async (path: string, method: "POST" | "PATCH", body: unknown) => {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    return { ok: Boolean(res?.ok), message: data?.message };
  }, []);

  return { enabled, overview, refresh, call };
}

/** « il y a 5 min », « il y a 2 h », « le 3 octobre ». */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(iso))}`;
}
