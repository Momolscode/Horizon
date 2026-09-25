"use client";

import Link from "next/link";

/** Erreur inattendue dans une page : message en français, sans détail technique. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="card max-w-md p-6 text-center" role="alert">
        <h1 className="text-3xl font-semibold">Un problème est survenu</h1>
        <p className="mt-2 text-ink-2">Cette page n&apos;a pas pu s&apos;afficher. Vos données enregistrées ne sont pas affectées.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Réessayer
          </button>
          <Link href="/carte" className="btn btn-ghost">
            Retour à la carte
          </Link>
        </div>
      </div>
    </main>
  );
}
