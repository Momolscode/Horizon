import type { NextConfig } from "next";

/**
 * En-têtes de sécurité. La CSP autorise uniquement l'origine de l'application et les
 * services explicitement configurés (Supabase, météo, style de carte, CSP_EXTRA_CONNECT_SRC).
 * Limite connue : 'unsafe-inline' pour les scripts (scripts en ligne de Next.js et
 * script de thème) ; une CSP à nonce est une amélioration documentée (docs/KNOWN_LIMITATIONS.md).
 */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const isDev = process.env.NODE_ENV !== "production";
const connectSrc = [
  "'self'",
  originOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
  process.env.NEXT_PUBLIC_WEATHER_PROVIDER === "open-meteo" ? "https://api.open-meteo.com" : null,
  originOf(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
  ...(process.env.CSP_EXTRA_CONNECT_SRC ?? "").split(/\s+/).filter(Boolean),
  isDev ? "ws: wss:" : null,
].filter(Boolean);

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
