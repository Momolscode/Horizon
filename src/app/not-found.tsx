import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="card max-w-md p-6 text-center">
        <p className="eyebrow">Erreur 404</p>
        <h1 className="mt-1 text-3xl font-semibold">Page introuvable</h1>
        <p className="mt-2 text-ink-2">Cette adresse ne correspond à aucune page ni à aucun lieu du catalogue.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/carte" className="btn btn-primary">
            Ouvrir la carte
          </Link>
          <Link href="/" className="btn btn-ghost">
            Accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
