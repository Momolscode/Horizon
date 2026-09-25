import type { Metadata } from "next";
import { SettingsScreen } from "@/components/screens/SettingsScreen";

export const metadata: Metadata = { title: "Paramètres" };

export default function ParametresPage() {
  return <SettingsScreen />;
}
