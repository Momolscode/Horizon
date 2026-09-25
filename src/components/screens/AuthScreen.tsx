"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../connected/AuthContext";

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Adresse ou mot de passe incorrect.",
  "User already registered": "Un compte existe déjà avec cette adresse.",
  "Email not confirmed": "Adresse non confirmée : consultez vos e-mails.",
};

export function AuthScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  if (!auth) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-3xl font-semibold">Connexion</h1>
        <p className="mt-2 text-ink-2">Cette installation fonctionne en démonstration : il n&apos;existe pas de comptes. Votre progression reste dans ce navigateur.</p>
        <Link href="/carte" className="btn btn-primary mt-4">
          Retour à la carte
        </Link>
      </div>
    );
  }
  if (auth.user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-3xl font-semibold">Vous êtes connecté</h1>
        <p className="mt-2 text-ink-2">{auth.user.email}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/carte" className="btn btn-primary">
            Explorer
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => void auth.signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-8">
      <p className="eyebrow">Compte HORIZON</p>
      <h1 className="text-4xl font-semibold">{mode === "signin" ? "Connexion" : "Créer un compte"}</h1>
      <p className="mt-2 text-ink-2">Un compte synchronise vos collections, excursions et votre passeport entre appareils. La consultation reste possible sans compte.</p>
      <div className="mt-5 flex rounded-full border border-line bg-surface p-1" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "signin"} className={`flex-1 rounded-full py-2 font-bold ${mode === "signin" ? "bg-ink text-bg" : "text-ink-2"}`} onClick={() => setMode("signin")}>
          Se connecter
        </button>
        <button type="button" role="tab" aria-selected={mode === "signup"} className={`flex-1 rounded-full py-2 font-bold ${mode === "signup" ? "bg-ink text-bg" : "text-ink-2"}`} onClick={() => setMode("signup")}>
          Créer un compte
        </button>
      </div>
      <form
        className="mt-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage(null);
          try {
            const { data, error } =
              mode === "signin"
                ? await auth.supabase.auth.signInWithPassword({ email, password })
                : await auth.supabase.auth.signUp({ email, password });
            if (error) {
              setMessage({ tone: "error", text: MESSAGES[error.message] ?? error.message });
              return;
            }
            if (mode === "signup" && !data.session) {
              setMessage({ tone: "info", text: "Compte créé : confirmez votre adresse via l'e-mail reçu, puis connectez-vous." });
              return;
            }
            router.push("/carte");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-bold">
          Adresse e-mail
          <input type="email" required autoComplete="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-bold">
          Mot de passe {mode === "signup" ? "(8 caractères minimum)" : ""}
          <input
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="field mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {mode === "signin" ? <LogIn size={18} aria-hidden="true" /> : <UserPlus size={18} aria-hidden="true" />}
          {busy ? "Patientez…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
        <p role="status" aria-live="polite" className={message?.tone === "error" ? "text-sm font-semibold text-danger-ink" : "text-sm font-semibold text-green-ink"}>
          {message?.text ?? ""}
        </p>
      </form>
      <p className="mt-4 text-xs text-ink-3">Votre pseudonyme est modifiable dans les paramètres. Un pseudonyme n&apos;est pas une garantie d&apos;anonymat technique.</p>
    </div>
  );
}
