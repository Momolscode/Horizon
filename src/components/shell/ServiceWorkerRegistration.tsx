"use client";

import { useEffect } from "react";

/** Enregistre le service worker en production uniquement (le cache gênerait le développement). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sans service worker, l'application fonctionne normalement en ligne.
    });
  }, []);
  return null;
}
