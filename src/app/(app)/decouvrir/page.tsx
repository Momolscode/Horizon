import type { Metadata } from "next";
import { Suspense } from "react";
import { DiscoverScreen } from "@/components/screens/DiscoverScreen";

export const metadata: Metadata = { title: "Découvrir" };

export default function DecouvrirPage() {
  return (
    <Suspense>
      <DiscoverScreen />
    </Suspense>
  );
}
