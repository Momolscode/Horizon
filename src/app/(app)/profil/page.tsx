import type { Metadata } from "next";
import { ProfileScreen } from "@/components/screens/ProfileScreen";

export const metadata: Metadata = { title: "Profil" };

export default function ProfilPage() {
  return <ProfileScreen />;
}
