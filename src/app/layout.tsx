import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HORIZON — Découvre des lieux, vis des expériences", template: "%s · HORIZON" },
  description: "Découvre des lieux. Vis des expériences. Révèle ton monde. Une application d'exploration qui transforme vos idées de sortie en excursions concrètes.",
  applicationName: "HORIZON",
  appleWebApp: { capable: true, title: "HORIZON", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1224" },
  ],
};

// Applique le thème et la préférence d'animation avant le premier rendu (pas de flash).
const bootScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("horizon:theme")||"system";var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.setAttribute("data-theme",dark?"dark":"light");var m=localStorage.getItem("horizon:motion");if(m==="reduced")d.setAttribute("data-motion","reduced");}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
