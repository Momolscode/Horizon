#!/usr/bin/env node
// Génère les icônes PWA (PNG) à partir d'un SVG original, via Chromium (Playwright).
// Usage : node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const svg = (size, maskable) => {
  const pad = maskable ? size * 0.14 : 0;
  const s = size - pad * 2;
  const cx = size / 2;
  const r = s * 0.34;
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cx + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><clipPath id="c"><polygon points="${hex}"/></clipPath></defs>
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.22}" fill="#0a1224"/>
  <g clip-path="url(#c)">
    <rect width="${size}" height="${size}" fill="#17233f"/>
    <circle cx="${cx}" cy="${cx + s * 0.06}" r="${s * 0.16}" fill="#ff7b63"/>
    <rect x="0" y="${cx + s * 0.06}" width="${size}" height="${size}" fill="#2e7d5b"/>
    <path d="M0 ${cx + s * 0.16} Q ${cx} ${cx + s * 0.08} ${size} ${cx + s * 0.18} V ${size} H 0 Z" fill="#276b4e"/>
  </g>
  <polygon points="${hex}" fill="none" stroke="#f4efe6" stroke-width="${s * 0.035}" stroke-linejoin="round"/>
</svg>`;
};

const targets = [
  { file: "public/icons/icon-192.png", size: 192, maskable: false },
  { file: "public/icons/icon-512.png", size: 512, maskable: false },
  { file: "public/icons/maskable-512.png", size: 512, maskable: true },
  { file: "public/icons/apple-touch-icon.png", size: 180, maskable: true },
  { file: "src/app/icon.png", size: 64, maskable: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(t.size, t.maskable)}</body></html>`);
  const buffer = await page.locator("svg").screenshot({ omitBackground: true });
  await writeFile(t.file, buffer);
  console.log(`écrit ${t.file}`);
}
await writeFile("public/icons/icon.svg", svg(512, false));
await browser.close();
