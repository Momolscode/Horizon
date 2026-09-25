import Link from "next/link";
import { ArrowRight, Bookmark, Compass, Footprints, Hexagon, Route, Share2, Wand2 } from "lucide-react";
import { PlaceArt } from "@/components/PlaceArt";
import { HexReveal } from "@/components/progress/HexReveal";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { MODE } from "@/config/mode";

const LOOP = [
  { icon: Compass, label: "Découvrir" },
  { icon: Bookmark, label: "Enregistrer" },
  { icon: Route, label: "Organiser" },
  { icon: Footprints, label: "Visiter" },
  { icon: Hexagon, label: "Révéler" },
  { icon: Share2, label: "Partager, si vous le voulez" },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="font-display text-xl font-bold tracking-[0.2em]">HORIZON</span>
        <Link href="/carte" className="btn btn-ghost min-h-11">
          {MODE.mode === "demo" ? "Ouvrir la démo" : "Ouvrir l'application"}
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-12">
          <div>
            <p className="eyebrow">Carnet d&apos;exploration</p>
            <h1 className="mt-3 text-[2.6rem] font-semibold leading-[1.05] sm:text-6xl">
              Découvre des lieux.
              <br />
              Vis des expériences.
              <br />
              <span className="text-coral-ink">Révèle ton monde.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              Vos idées de sorties sont éparpillées entre cartes, avis, vidéos et guides. HORIZON les transforme en excursion concrète, puis vos visites en carte
              explorée et en carnet de souvenirs.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/carte" className="btn btn-primary min-h-12 px-6 text-base">
                Essayer la démo <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#liste" className="btn btn-ghost min-h-12 px-6 text-base">
                Liste d&apos;attente
              </a>
            </div>
            <p className="mt-3 text-sm text-ink-3">Sans compte, sans localisation obligatoire. La démo fonctionne dans votre navigateur.</p>
          </div>

          <div className="relative mx-auto h-[380px] w-full max-w-[440px]" aria-hidden="true">
            <div className="grain absolute left-0 top-6 h-64 w-52 -rotate-6 overflow-hidden rounded-[26px] border-4 border-surface shadow-float">
              <PlaceArt seed="annecy-paquier" motif="lake" palette="alpine" className="h-full w-full" />
            </div>
            <div className="grain absolute right-0 top-0 h-60 w-48 rotate-6 overflow-hidden rounded-[26px] border-4 border-surface shadow-float">
              <PlaceArt seed="marseille-vallon-des-auffes" motif="cove" palette="mediterranee" className="h-full w-full" />
            </div>
            <div className="grain absolute bottom-0 left-1/2 h-56 w-56 -translate-x-1/2 overflow-hidden rounded-[26px] border-4 border-surface shadow-float">
              <PlaceArt seed="lyon-fourviere" motif="basilica" palette="lyon" className="h-full w-full" />
            </div>
            <div className="absolute -bottom-4 right-6 rounded-full bg-surface p-3 shadow-float">
              <HexReveal state="declared" size={96} />
            </div>
          </div>
        </section>

        <section className="bg-ink py-16 text-bg">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold sm:text-4xl">Trois signatures</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <article className="rounded-[26px] bg-white/5 p-6">
                <Hexagon className="text-green" aria-hidden="true" />
                <h3 className="mt-3 text-2xl font-semibold">Une carte qui se révèle</h3>
                <p className="mt-2 opacity-85">Chaque visite lève le voile sur une parcelle hexagonale : votre carte personnelle se dessine au fil de vos sorties, quartier par quartier.</p>
              </article>
              <article className="rounded-[26px] bg-white/5 p-6">
                <Wand2 className="text-coral" aria-hidden="true" />
                <h3 className="mt-3 text-2xl font-semibold">Surprends-nous</h3>
                <p className="mt-2 opacity-85">Destination, budget, temps, transport, envies : trois à cinq étapes cohérentes, expliquées une à une, que vous ajustez librement.</p>
              </article>
              <article className="rounded-[26px] bg-white/5 p-6">
                <Footprints className="text-sand" aria-hidden="true" />
                <h3 className="mt-3 text-2xl font-semibold">Un passeport d&apos;exploration</h3>
                <p className="mt-2 opacity-85">Niveaux, badges, médailles de parcours et carnet de souvenirs privés. Partageable en image, uniquement quand vous le décidez.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold sm:text-4xl">Une boucle simple</h2>
          <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {LOOP.map(({ icon: Icon, label }, i) => (
              <li key={label} className="card p-4">
                <span className="text-xs font-bold text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <Icon className="mt-2 text-coral-ink" aria-hidden="true" />
                <p className="mt-2 font-bold">{label}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-ink-2">
            Pensé aussi pour les sorties proches : un village voisin, une randonnée gratuite, un dimanche après-midi. Les informations pratiques et de sécurité ne
            sont jamais verrouillées par la progression.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="card grid gap-6 p-6 md:grid-cols-2 md:p-8">
            <div>
              <h2 className="text-2xl font-semibold">Ce que contient la démonstration</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-2">
                <li>4 destinations françaises et 40 lieux, dont 8 établissements fictifs signalés comme tels.</li>
                <li>Lieux réels cités sans vérification : coordonnées approximatives, informations pratiques à confirmer.</li>
                <li>Fond de carte simplifié Natural Earth : ce n&apos;est pas une carte routière.</li>
                <li>Progression conservée dans votre navigateur, réinitialisable à tout moment.</li>
              </ul>
            </div>
            <div id="liste" className="relative scroll-mt-6">
              <h2 className="text-2xl font-semibold">Être informé·e du lancement</h2>
              <p className="mb-4 mt-2 text-ink-2">Nom provisoire. Aucune date de lancement n&apos;est annoncée.</p>
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:justify-between sm:px-6">
          <p>HORIZON — prototype. Illustrations générées par le projet ; aucune photo tierce.</p>
          <p>
            Fond de carte :{" "}
            <a className="underline" href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
              Natural Earth
            </a>{" "}
            (domaine public).
          </p>
        </div>
      </footer>
    </div>
  );
}
