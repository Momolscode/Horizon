import type { Metadata } from "next";
import { Suspense } from "react";
import { NewExcursionScreen } from "@/components/screens/NewExcursionScreen";

export const metadata: Metadata = { title: "Nouvelle excursion" };

export default function NewExcursionPage() {
  return (
    <Suspense>
      <NewExcursionScreen />
    </Suspense>
  );
}
