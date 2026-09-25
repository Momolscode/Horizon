import type { Metadata } from "next";
import { PlaceScreen } from "@/components/screens/PlaceScreen";

export const metadata: Metadata = { title: "Lieu" };

export default async function LieuPage({ params }: PageProps<"/lieux/[id]">) {
  const { id } = await params;
  return <PlaceScreen id={id} />;
}
