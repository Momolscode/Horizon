"use client";

import { useCallback, useState } from "react";
import type { PositionFix } from "@/modules/progression/engine";

export type GeoState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "ok"; fix: PositionFix }
  | { status: "error"; reason: "denied" | "unavailable" | "timeout" | "unsupported"; message: string };

const MESSAGES = {
  denied: "Localisation refusée : la recherche manuelle reste disponible.",
  unavailable: "Position indisponible sur cet appareil pour le moment.",
  timeout: "La position n'a pas pu être obtenue à temps.",
  unsupported: "Ce navigateur ne permet pas la localisation.",
} as const;

/**
 * Position PONCTUELLE, uniquement sur action explicite de l'utilisateur.
 * Aucun suivi continu (pas de watchPosition), aucune localisation en arrière-plan.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });

  const locate = useCallback((): Promise<PositionFix | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "error", reason: "unsupported", message: MESSAGES.unsupported });
      return Promise.resolve(null);
    }
    setState({ status: "locating" });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix: PositionFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
          };
          setState({ status: "ok", fix });
          resolve(fix);
        },
        (err) => {
          const reason = err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable";
          setState({ status: "error", reason, message: MESSAGES[reason] });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    });
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, locate, reset };
}
