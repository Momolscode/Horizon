import type { Metadata } from "next";
import { AdminScreen } from "@/components/admin/AdminScreen";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminScreen />;
}
