import type { Metadata } from "next";
import { Suspense } from "react";
import { MapScreen } from "@/components/map/MapScreen";

export const metadata: Metadata = { title: "Carte" };

export default function CartePage() {
  return (
    <Suspense>
      <MapScreen />
    </Suspense>
  );
}
