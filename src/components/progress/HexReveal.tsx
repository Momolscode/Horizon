import { useId } from "react";

/** Hexagone qui se dévoile : le voile glisse et laisse apparaître la parcelle. */
export function HexReveal({ state, size = 148 }: { state: "simulated" | "declared" | "checked"; size?: number }) {
  const id = useId().replace(/:/g, "");
  const hex = "M74 6 L134 40 L134 108 L74 142 L14 108 L14 40 Z";
  return (
    <svg width={size} height={size} viewBox="0 0 148 148" aria-hidden="true" className="overflow-visible">
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={hex} />
        </clipPath>
        <linearGradient id={`land-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dcefe4" />
          <stop offset="1" stopColor="#8fd0b0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        <rect width="148" height="148" fill={`url(#land-${id})`} />
        <path d="M0 96 Q40 70 74 88 T148 80 V148 H0 Z" fill="#2e7d5b" opacity="0.85" />
        <path d="M0 112 Q50 96 90 110 T148 104 V148 H0 Z" fill="#276b4e" />
        <circle cx="104" cy="46" r="12" fill="#fff3dc" />
        <path d="M30 60 l14 -18 l14 18 Z M52 64 l10 -13 l10 13 Z" fill="#276b4e" opacity="0.6" />
        <rect className="hex-veil" width="148" height="148" fill="#e9e2d4" />
      </g>
      <path d={hex} fill="none" stroke={state === "simulated" ? "#646c7e" : "#2e7d5b"} strokeWidth="4" strokeDasharray={state === "simulated" ? "8 6" : undefined} />
      <style>{`
        .hex-veil { transform-origin: 50% 0; animation: hex-veil-lift 1.1s cubic-bezier(.2,.8,.2,1) .25s forwards; }
        @keyframes hex-veil-lift { to { transform: translateY(-105%); } }
        @media (prefers-reduced-motion: reduce) { .hex-veil { animation: none; transform: translateY(-105%); } }
        [data-motion="reduced"] .hex-veil { animation: none; transform: translateY(-105%); }
      `}</style>
    </svg>
  );
}
