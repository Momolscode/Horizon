import Link from "next/link";

export default function SharedNotFound() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="font-display text-lg font-bold tracking-[0.2em]">
          HORIZON
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">Lien révoqué ou inexistant</h1>
        <p className="mt-2 text-ink-2">La personne qui a partagé cette excursion a peut-être retiré l&apos;accès.</p>
      </div>
    </main>
  );
}
