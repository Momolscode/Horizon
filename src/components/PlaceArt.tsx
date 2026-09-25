import { useId } from "react";
import { seededUnit } from "@/modules/shared/hash";

/**
 * Illustration générative d'un lieu (SVG original du projet, aucune photo tierce).
 * Déterministe : un même lieu produit toujours la même image.
 */

type Palette = { skyTop: string; skyBottom: string; sun: string; far: string; mid: string; near: string; water: string; accent: string; light: string };

const PALETTES: Record<string, Palette> = {
  alpine: { skyTop: "#8fb9c9", skyBottom: "#f6dcc4", sun: "#fff3dc", far: "#9fb7c4", mid: "#5f8795", near: "#2f4f5b", water: "#5aa0b0", accent: "#e8604c", light: "#fbf5ea" },
  lyon: { skyTop: "#e9b98c", skyBottom: "#f7e6d0", sun: "#fff4e0", far: "#d9a57d", mid: "#b96f4f", near: "#6e3b2e", water: "#7fa3a8", accent: "#2e7d5b", light: "#fdf3e6" },
  mediterranee: { skyTop: "#7ec3e0", skyBottom: "#f8eedb", sun: "#fffbe8", far: "#c9d8d6", mid: "#e7dcc6", near: "#b9a27e", water: "#1f7fae", accent: "#e8604c", light: "#fffaf0" },
  atlantique: { skyTop: "#9fb3c4", skyBottom: "#efe4d2", sun: "#fff6e2", far: "#b9c3c9", mid: "#7f919c", near: "#3e4f5c", water: "#4f7d91", accent: "#d9a441", light: "#faf4e8" },
};

type SceneKind = "mountains" | "water" | "skyline" | "towers" | "dome" | "trees" | "arches" | "crystal" | "awning" | "cliffs" | "beach" | "boat" | "lighthouse";

const MOTIF_SCENES: Record<string, SceneKind[]> = {
  summit: ["mountains"],
  lake: ["mountains", "water"],
  bay: ["mountains", "water", "boat"],
  canal: ["mountains", "skyline", "water"],
  castle: ["mountains", "towers"],
  garden: ["mountains", "trees", "water"],
  church: ["dome", "trees"],
  basilica: ["dome", "skyline"],
  gorge: ["cliffs", "water"],
  "old-town": ["skyline", "arches"],
  amphitheatre: ["arches"],
  modern: ["crystal", "water"],
  market: ["awning"],
  table: ["awning"],
  kiosk: ["awning", "water"],
  cafe: ["awning"],
  "fine-dining": ["awning"],
  mural: ["skyline", "arches"],
  gallery: ["arches", "crystal"],
  harbour: ["skyline", "water", "boat"],
  calanque: ["cliffs", "water", "boat"],
  "island-fort": ["water", "towers", "boat"],
  cove: ["cliffs", "water", "boat"],
  fountain: ["arches", "trees"],
  towers: ["towers", "water", "boat"],
  lighthouse: ["lighthouse", "water"],
  aquarium: ["water", "crystal"],
  "clock-gate": ["skyline", "towers"],
  beach: ["beach", "water", "boat"],
  ship: ["water", "boat", "skyline"],
};

function ridge(seed: string, baseY: number, amplitude: number, peaks: number, width = 400): string {
  const pts: string[] = [`M0 ${baseY + amplitude}`];
  const step = width / peaks;
  for (let i = 0; i <= peaks; i += 1) {
    const x = i * step;
    const y = baseY + amplitude * (0.2 + 0.8 * seededUnit(seed, `r${i}`));
    const cx = x - step / 2;
    const cy = baseY - amplitude * (0.2 + seededUnit(seed, `p${i}`));
    pts.push(i === 0 ? `L${x} ${y}` : `Q${cx} ${cy} ${x} ${y}`);
  }
  pts.push(`L${width} 260 L0 260 Z`);
  return pts.join(" ");
}

export function PlaceArt({
  seed,
  motif,
  palette: paletteName,
  className,
  label,
}: {
  seed: string;
  motif: string;
  palette: string;
  className?: string;
  label?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const p = PALETTES[paletteName] ?? PALETTES.alpine!;
  const scenes = MOTIF_SCENES[motif] ?? ["mountains"];
  const sunX = 60 + seededUnit(seed, "sunx") * 280;
  const sunY = 50 + seededUnit(seed, "suny") * 40;
  const has = (k: SceneKind) => scenes.includes(k);
  const horizon = has("water") || has("beach") ? 175 : 205;

  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.skyTop} />
          <stop offset="1" stopColor={p.skyBottom} />
        </linearGradient>
        <linearGradient id={`water-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.water} stopOpacity="0.85" />
          <stop offset="1" stopColor={p.near} />
        </linearGradient>
        <radialGradient id={`sun-${uid}`}>
          <stop offset="0" stopColor={p.sun} />
          <stop offset="0.55" stopColor={p.sun} stopOpacity="0.85" />
          <stop offset="1" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(seededUnit(seed, "g") * 100)} />
          <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.1  0 0 0 0.22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      <rect width="400" height="260" fill={`url(#sky-${uid})`} />
      <circle cx={sunX} cy={sunY} r="46" fill={`url(#sun-${uid})`} />
      <circle cx={sunX} cy={sunY} r="18" fill={p.sun} />

      {(has("mountains") || has("cliffs")) && (
        <>
          <path d={ridge(`${seed}-far`, horizon - 70, 40, 5)} fill={p.far} opacity="0.9" />
          <path d={ridge(`${seed}-mid`, horizon - 38, 34, 4)} fill={p.mid} />
        </>
      )}
      {has("mountains") && (
        <path d={ridge(`${seed}-snow`, horizon - 72, 10, 5)} fill={p.light} opacity="0.35" transform="translate(0,-6)" />
      )}

      {has("cliffs") && (
        <>
          <path d={`M0 ${horizon - 60} L70 ${horizon - 80} L110 ${horizon - 20} L120 260 L0 260 Z`} fill={p.near} />
          <path d={`M400 ${horizon - 70} L320 ${horizon - 95} L285 ${horizon - 25} L275 260 L400 260 Z`} fill={p.near} opacity="0.92" />
        </>
      )}

      {has("dome") && (
        <g fill={p.light} stroke={p.near} strokeWidth="1.5">
          <path d={ridge(`${seed}-hill`, horizon - 20, 18, 3)} fill={p.mid} stroke="none" />
          <rect x="165" y={horizon - 85} width="70" height="55" />
          <path d={`M170 ${horizon - 85} Q200 ${horizon - 135} 230 ${horizon - 85} Z`} />
          <rect x="196" y={horizon - 150} width="8" height="22" />
          <rect x="150" y={horizon - 100} width="14" height="70" />
          <rect x="236" y={horizon - 100} width="14" height="70" />
          <path d={`M178 ${horizon - 55} a8 12 0 0 1 16 0 v25 h-16 Z M206 ${horizon - 55} a8 12 0 0 1 16 0 v25 h-16 Z`} fill={p.near} opacity="0.7" stroke="none" />
        </g>
      )}

      {has("skyline") && (
        <g>
          {Array.from({ length: 11 }, (_, i) => {
            const w = 28 + seededUnit(seed, `bw${i}`) * 16;
            const h = 34 + seededUnit(seed, `bh${i}`) * 48;
            const x = i * 38 - 8;
            const colors = [p.accent, p.light, p.mid, p.far];
            const fill = colors[Math.floor(seededUnit(seed, `bc${i}`) * colors.length)]!;
            return (
              <g key={i}>
                <rect x={x} y={horizon - h} width={w} height={h + 60} fill={fill} opacity="0.95" />
                <path d={`M${x - 2} ${horizon - h} L${x + w / 2} ${horizon - h - 12} L${x + w + 2} ${horizon - h} Z`} fill={p.near} opacity="0.75" />
                {Array.from({ length: 3 }, (_, j) => (
                  <rect key={j} x={x + 6 + j * 8} y={horizon - h + 12} width="4" height="7" fill={p.near} opacity="0.55" />
                ))}
              </g>
            );
          })}
        </g>
      )}

      {has("towers") && (
        <g fill={p.light} stroke={p.near} strokeWidth="1.5">
          <rect x="95" y={horizon - 100} width="48" height="100" />
          <path d={`M92 ${horizon - 100} h54 v-10 h-8 v6 h-8 v-6 h-8 v6 h-8 v-6 h-8 v6 h-6 v-6 h-8 Z`} />
          <rect x="255" y={horizon - 80} width="40" height="80" />
          <path d={`M250 ${horizon - 80} L275 ${horizon - 118} L300 ${horizon - 80} Z`} fill={p.accent} />
          <rect x="112" y={horizon - 70} width="12" height="18" rx="6" fill={p.near} stroke="none" opacity="0.7" />
        </g>
      )}

      {has("lighthouse") && (
        <g stroke={p.near} strokeWidth="1.5">
          <path d={`M188 ${horizon} L196 ${horizon - 120} L214 ${horizon - 120} L222 ${horizon} Z`} fill={p.light} />
          <path d={`M191 ${horizon - 60} h28 l-2 -14 h-24 Z`} fill={p.accent} />
          <path d={`M194 ${horizon - 120} L205 ${horizon - 150} L216 ${horizon - 120} Z`} fill={p.near} />
          <circle cx="205" cy={horizon - 128} r="4" fill={p.sun} stroke="none" />
        </g>
      )}

      {has("arches") && (
        <g fill={p.light} stroke={p.near} strokeWidth="1.5">
          <rect x="30" y={horizon - 70} width="340" height="90" />
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M${48 + i * 46} ${horizon + 20} v-45 a17 17 0 0 1 34 0 v45 Z`} fill={p.mid} opacity="0.75" />
          ))}
          <rect x="24" y={horizon - 80} width="352" height="12" fill={p.accent} />
        </g>
      )}

      {has("crystal") && (
        <g>
          <path d={`M120 ${horizon} L170 ${horizon - 95} L285 ${horizon - 70} L320 ${horizon} Z`} fill={p.light} opacity="0.9" />
          <path d={`M170 ${horizon - 95} L230 ${horizon} L285 ${horizon - 70}`} fill="none" stroke={p.mid} strokeWidth="2" />
          <path d={`M150 ${horizon - 40} L300 ${horizon - 35}`} stroke={p.accent} strokeWidth="3" />
        </g>
      )}

      {has("trees") && (
        <g>
          {Array.from({ length: 8 }, (_, i) => {
            const x = 20 + i * 50 + seededUnit(seed, `tx${i}`) * 20;
            const r = 18 + seededUnit(seed, `tr${i}`) * 14;
            return (
              <g key={i}>
                <rect x={x - 2} y={horizon - 6} width="4" height="22" fill={p.near} />
                <circle cx={x} cy={horizon - r / 2 - 4} r={r} fill={i % 2 ? "#4f8a5e" : "#3f7250"} opacity="0.95" />
              </g>
            );
          })}
        </g>
      )}

      {has("awning") && (
        <g>
          <rect x="0" y="120" width="400" height="140" fill={p.light} />
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M${i * 40} 110 h40 v34 a20 14 0 0 1 -40 0 Z`} fill={i % 2 ? p.accent : p.light} stroke={p.near} strokeWidth="1" />
          ))}
          <ellipse cx="140" cy="215" rx="48" ry="14" fill={p.near} opacity="0.15" />
          <circle cx="140" cy="205" r="34" fill="#ffffff" stroke={p.mid} strokeWidth="3" />
          <circle cx="140" cy="205" r="20" fill={p.accent} opacity="0.35" />
          <circle cx="262" cy="205" r="30" fill="#ffffff" stroke={p.mid} strokeWidth="3" />
          <path d="M248 205 q14 -18 28 0" stroke="#3f7250" strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>
      )}

      {has("water") && (
        <g>
          <rect x="0" y={horizon} width="400" height={260 - horizon} fill={`url(#water-${uid})`} />
          {Array.from({ length: 7 }, (_, i) => (
            <path
              key={i}
              d={`M${seededUnit(seed, `wx${i}`) * 320} ${horizon + 12 + i * 11} h${40 + seededUnit(seed, `ww${i}`) * 60}`}
              stroke={p.light}
              strokeOpacity="0.45"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </g>
      )}

      {has("beach") && (
        <g>
          <path d={`M0 ${horizon + 40} Q200 ${horizon + 10} 400 ${horizon + 45} L400 260 L0 260 Z`} fill="#ecd9b0" />
          <path d={`M300 ${horizon + 38} l-4 -40`} stroke={p.near} strokeWidth="3" />
          <path d={`M270 ${horizon - 2} q26 -26 52 0 Z`} fill={p.accent} />
        </g>
      )}

      {has("boat") && (
        <g transform={`translate(${70 + seededUnit(seed, "boat") * 220} ${horizon + 22})`}>
          <path d="M0 0 h46 l-8 10 h-30 Z" fill={p.near} />
          <path d="M22 -2 v-34 l18 32 Z" fill={p.light} stroke={p.near} strokeWidth="1" />
        </g>
      )}

      <rect width="400" height="260" filter={`url(#grain-${uid})`} opacity="0.9" />
    </svg>
  );
}
