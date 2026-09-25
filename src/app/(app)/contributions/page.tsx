import type { Metadata } from "next";
import { ContributionsScreen } from "@/components/screens/ContributionsScreen";

export const metadata: Metadata = { title: "Mes contributions" };

export default function ContributionsPage() {
  return <ContributionsScreen />;
}
