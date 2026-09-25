import type { Metadata } from "next";
import { AuthScreen } from "@/components/screens/AuthScreen";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return <AuthScreen />;
}
