import { AppRoot } from "@/components/AppRoot";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppRoot>{children}</AppRoot>;
}
