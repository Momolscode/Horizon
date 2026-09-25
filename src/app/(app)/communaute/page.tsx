import type { Metadata } from "next";
import { CommunityScreen } from "@/components/screens/CommunityScreen";

export const metadata: Metadata = { title: "Communauté" };

export default function CommunautePage() {
  return <CommunityScreen />;
}
