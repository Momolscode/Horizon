"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useHorizon } from "../providers/HorizonProvider";

export function Toasts() {
  const { toasts, dismissToast } = useHorizon();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? TriangleAlert : Info;
        return (
          <div key={t.id} className="animate-rise pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-float">
            <Icon aria-hidden="true" className={t.tone === "error" ? "text-coral" : t.tone === "success" ? "text-green" : ""} size={18} />
            <p className="flex-1">{t.message}</p>
            <button type="button" onClick={() => dismissToast(t.id)} className="-m-1 grid h-8 w-8 place-items-center rounded-full opacity-80 hover:opacity-100" aria-label="Fermer la notification">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
