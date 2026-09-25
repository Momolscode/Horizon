import type { Metadata } from "next";
import { ExcursionDetailScreen } from "@/components/screens/ExcursionDetailScreen";

export const metadata: Metadata = { title: "Excursion" };

export default async function ExcursionPage({ params }: PageProps<"/excursions/[id]">) {
  const { id } = await params;
  return <ExcursionDetailScreen id={id} />;
}
