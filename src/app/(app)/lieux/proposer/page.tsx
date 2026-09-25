import type { Metadata } from "next";
import { ProposePlaceScreen } from "@/components/screens/ProposePlaceScreen";

export const metadata: Metadata = { title: "Proposer un lieu" };

export default function ProposerPage() {
  return <ProposePlaceScreen />;
}
