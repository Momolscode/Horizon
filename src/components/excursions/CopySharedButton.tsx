"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";

export function CopySharedButton({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "auth" | "error">("idle");
  if (state === "auth") {
    return (
      <Link href="/connexion" className="btn btn-primary">
        Se connecter pour copier
      </Link>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch(`/api/partages/${token}/copie`, { method: "POST", credentials: "same-origin" }).catch(() => null);
          if (res?.status === 401) return setState("auth");
          const body = (await res?.json().catch(() => null)) as { excursionId?: string } | null;
          if (!res?.ok || !body?.excursionId) return setState("error");
          router.push(`/excursions/${body.excursionId}`);
        }}
      >
        <Copy size={18} aria-hidden="true" /> {state === "busy" ? "Copie…" : "Copier dans mon compte"}
      </button>
      {state === "error" ? <p className="mt-2 text-sm font-semibold text-danger-ink">La copie a échoué (lien révoqué ?).</p> : null}
    </div>
  );
}
