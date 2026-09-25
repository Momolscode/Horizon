import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/screens/OnboardingScreen";

export const metadata: Metadata = { title: "Bienvenue" };

export default function BienvenuePage() {
  return <OnboardingScreen />;
}
