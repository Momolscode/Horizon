"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Compass, FlaskConical, LogIn, Map, RotateCcw, Route, User, Users } from "lucide-react";
import { useHorizon } from "../providers/HorizonProvider";
import { Dialog } from "./Dialog";
import { Toasts } from "./Toasts";
import { RevealOverlay } from "../progress/RevealOverlay";
import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";

const NAV = [
  { href: "/carte", label: "Carte", icon: Map },
  { href: "/decouvrir", label: "Découvrir", icon: Compass },
  { href: "/excursions", label: "Excursions", icon: Route },
  { href: "/communaute", label: "Communauté", icon: Users },
  { href: "/profil", label: "Profil", icon: User },
] as const;

function ConnectedBanner() {
  const { status, requiresAccount } = useHorizon();
  if (status.kind !== "connected" || !requiresAccount) return null;
  return (
    <div className="relative z-40 flex items-center gap-2 bg-green-soft px-3 py-1.5 text-[12px] font-semibold text-green-ink sm:px-4">
      <p className="min-w-0 flex-1 truncate">Vous consultez sans compte : rien n&apos;est enregistré.</p>
      <Link href="/connexion" className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2 underline underline-offset-2">
        <LogIn size={13} aria-hidden="true" /> Se connecter
      </Link>
    </div>
  );
}

function DemoBanner() {
  const { status, actions, toast } = useHorizon();
  const [confirm, setConfirm] = useState(false);
  if (status.kind !== "demo") return null;
  return (
    <>
      <div className="relative z-40 flex items-center gap-2 bg-ink px-3 py-1.5 text-[12px] font-semibold text-bg sm:px-4">
        <FlaskConical size={14} aria-hidden="true" className="shrink-0 text-coral" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-extrabold tracking-wide">DÉMONSTRATION</span>
          <span className="opacity-80"> · lieux non vérifiés, restaurants et personnes fictifs · progression {status.persistent ? "gardée dans ce navigateur" : "non conservée"}</span>
        </p>
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2 underline-offset-2 hover:underline">
          <RotateCcw size={13} aria-hidden="true" />
          Réinitialiser
        </button>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Réinitialiser la démonstration ?"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (await actions.reset()) toast("Démonstration réinitialisée.", "success");
                setConfirm(false);
              }}
            >
              Tout effacer
            </button>
          </>
        }
      >
        <p className="text-ink-2">Visites, parcelles, collections, excursions et préférences enregistrées dans ce navigateur seront effacées. Cette action est irréversible.</p>
      </Dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg lg:pl-[92px]">
      <a href="#contenu" className="sr-only-focusable fixed left-2 top-2 z-[70] rounded-full bg-coral px-4 py-2 font-bold text-on-coral">
        Aller au contenu
      </a>
      <DemoBanner />
      <ConnectedBanner />
      <main id="contenu" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(68px+env(safe-area-inset-bottom))] outline-none lg:pb-0">
        {children}
      </main>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:inset-y-0 lg:left-0 lg:right-auto lg:w-[92px] lg:border-r lg:border-t-0 lg:pb-0"
      >
        <div className="hidden px-2 pb-2 pt-5 text-center lg:block">
          <Link href="/" className="font-display text-sm font-bold tracking-[0.18em]">
            HORIZON
          </Link>
        </div>
        <ul className="mx-auto grid max-w-lg grid-cols-5 lg:mt-4 lg:max-w-none lg:grid-cols-1 lg:gap-1 lg:px-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/carte" && pathname.startsWith("/lieux"));
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-bold transition-colors lg:min-h-[68px] ${
                    active ? "text-coral-ink" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  <span
                    className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${active ? "bg-coral-soft" : "group-hover:bg-surface-2"}`}
                  >
                    <Icon size={20} aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Toasts />
      <RevealOverlay />
      <ServiceWorkerRegistration />
    </div>
  );
}
