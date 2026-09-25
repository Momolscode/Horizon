import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HORIZON — carnet d'exploration",
    short_name: "HORIZON",
    description: "Découvre des lieux. Vis des expériences. Révèle ton monde.",
    lang: "fr",
    start_url: "/carte",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4efe6",
    theme_color: "#0a1224",
    categories: ["travel", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
