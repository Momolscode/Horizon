"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Map } from "lucide-react";
import { useHorizon } from "../providers/HorizonProvider";
import { PlaceDetail } from "../place/PlaceDetail";

export function PlaceScreen({ id }: { id: string }) {
  const { catalog } = useHorizon();
  const router = useRouter();
  const place = catalog.placesById.get(id);
  if (!place) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <h1 className="text-3xl font-semibold">Lieu introuvable</h1>
        <p className="mt-2 text-ink-2">Ce lieu n&apos;existe pas dans le catalogue.</p>
        <Link href="/decouvrir" className="btn btn-primary mt-4">
          Découvrir
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl lg:px-4 lg:pt-6">
      <div className="flex items-center justify-between px-4 py-2 lg:px-0">
        <button type="button" onClick={() => router.back()} className="inline-flex min-h-11 items-center gap-1 font-bold text-ink-2">
          <ChevronLeft size={18} aria-hidden="true" /> Retour
        </button>
        <Link href={`/carte?lieu=${place.id}`} className="inline-flex min-h-11 items-center gap-1 font-bold text-coral-ink">
          <Map size={17} aria-hidden="true" /> Voir sur la carte
        </Link>
      </div>
      <PlaceDetail place={place} userPosition={null} />
    </div>
  );
}
