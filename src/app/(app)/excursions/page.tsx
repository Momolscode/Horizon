import type { Metadata } from "next";
import { ExcursionsScreen } from "@/components/screens/ExcursionsScreen";

export const metadata: Metadata = { title: "Excursions" };

export default function ExcursionsPage() {
  return <ExcursionsScreen />;
}
