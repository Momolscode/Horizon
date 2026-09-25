import Link from "next/link";

export const metadata = { title: "Hors connexion" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-3xl font-semibold">Vous êtes hors connexion</h1>
        <p className="mt-2 text-ink-2">
          Cette page n&apos;a pas été mise en cache. HORIZON n&apos;est pas une application entièrement hors ligne : seules les pages déjà visitées et le fond de
          carte sont conservés.
        </p>
        <Link href="/carte" className="btn btn-primary mt-4">
          Réessayer
        </Link>
      </div>
    </main>
  );
}
